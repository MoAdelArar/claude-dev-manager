import { v4 as uuidv4 } from 'uuid';
import {
  type AgentConfig,
  type AgentRole,
  type AgentResult,
  AgentStatus,
  type AgentTask,
  type Artifact,
  type ArtifactType,
  ArtifactStatus,
  ReviewStatus,
  type Issue,
  type PipelineStage,
  type HandoffPayload,
  MessagePriority,
} from '../types';
import { agentLog } from '../utils/logger';
import { validateArtifact } from '../utils/validators';
import { type ArtifactStore } from '../workspace/artifact-store';
import { optimizeInputArtifacts, estimateTokens } from '../context/context-optimizer';

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected status: AgentStatus = AgentStatus.IDLE;
  protected currentTask: AgentTask | null = null;
  protected artifactStore: ArtifactStore;

  constructor(config: AgentConfig, artifactStore: ArtifactStore) {
    this.config = config;
    this.artifactStore = artifactStore;
  }

  get role(): AgentRole {
    return this.config.role;
  }

  get name(): string {
    return this.config.name;
  }

  get title(): string {
    return this.config.title;
  }

  get currentStatus(): AgentStatus {
    return this.status;
  }

  getSystemPrompt(): string {
    return this.config.systemPrompt;
  }

  getCapabilities(): string[] {
    return this.config.capabilities.map((c) => c.name);
  }

  getAllowedTools(): string[] {
    return this.config.capabilities.flatMap((c) => c.allowedTools);
  }

  getMaxTokenBudget(): number {
    return this.config.maxTokenBudget;
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    this.currentTask = task;
    this.status = AgentStatus.WORKING;

    agentLog(this.role, `Starting task: ${task.title}`, task.stage);

    const startTime = Date.now();
    let result: AgentResult;

    try {
      this.validateInputArtifacts(task.inputArtifacts);

      const output = await this.performWork(task);
      const artifacts = await this.produceArtifacts(task, output);
      const issues = await this.identifyIssues(task, output);

      result = {
        agentRole: this.role,
        status: 'success',
        output,
        artifacts,
        issues,
        tokensUsed: this.estimateTokensUsed(output),
        durationMs: Date.now() - startTime,
        metadata: { taskId: task.id },
      };

      agentLog(this.role, `Task completed: ${task.title}`, task.stage);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      agentLog(this.role, `Task failed: ${errorMessage}`, task.stage, 'error');

      result = {
        agentRole: this.role,
        status: 'failure',
        output: errorMessage,
        artifacts: [],
        issues: [],
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        metadata: { taskId: task.id, error: errorMessage },
      };
    }

    this.status = AgentStatus.IDLE;
    this.currentTask = null;
    return result;
  }

  protected abstract performWork(task: AgentTask): Promise<string>;

  protected abstract produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]>;

  protected abstract identifyIssues(task: AgentTask, output: string): Promise<Issue[]>;

  buildClaudeCodePrompt(task: AgentTask): string {
    const sections: string[] = [];

    sections.push(`# Agent Role: ${this.config.title}`);
    sections.push(`## Role Description\n${this.config.description}`);
    sections.push(`## System Instructions\n${this.config.systemPrompt}`);

    sections.push(`## Task\n**${task.title}**\n${task.description}`);

    if (task.instructions) {
      sections.push(`## Detailed Instructions\n${task.instructions}`);
    }

    if (task.inputArtifacts.length > 0) {
      const optimized = optimizeInputArtifacts(task.inputArtifacts, task.assignedTo);
      sections.push(`## Input Artifacts (${task.inputArtifacts.length})\n${optimized}`);
    }

    if (task.expectedOutputs.length > 0) {
      const outputs = task.expectedOutputs.map((t) => `- ${t}`).join('\n');
      sections.push(`## Expected Outputs\n${outputs}`);
    }

    if (task.constraints.length > 0) {
      const constraints = task.constraints.map((c) => `- ${c}`).join('\n');
      sections.push(`## Constraints\n${constraints}`);
    }

    sections.push(this.getOutputFormatInstructions());

    const prompt = sections.join('\n\n');
    const tokens = estimateTokens(prompt);
    agentLog(this.role, `Prompt: ~${tokens.toLocaleString()} tokens`, task.stage);

    return prompt;
  }

  protected getOutputFormatInstructions(): string {
    return `## Output Format
Write a brief summary of what was accomplished, then emit each artifact and issue using EXACTLY the block format below. Each field MUST be on its own line — do not combine fields with | separators.

Artifact block (one per artifact produced):
---ARTIFACT_START---
Type: <artifact_type>
Name: <artifact_name>
Description: <one-line description>
Content:
<full content here>
---ARTIFACT_END---

Issue block (one per issue found, omit section if none):
---ISSUE_START---
Type: <issue_type>
Severity: <critical|high|medium|low|info>
Title: <short title>
Description: <description>
---ISSUE_END---

End with a Recommendations section for the next stage.`;
  }

  prepareHandoff(
    toAgent: AgentRole,
    stage: PipelineStage,
    artifacts: Artifact[],
    feedback?: string[],
  ): HandoffPayload {
    return {
      fromAgent: this.role,
      toAgent,
      stage,
      context: this.buildHandoffContext(),
      artifacts,
      instructions: this.buildHandoffInstructions(toAgent, stage),
      constraints: this.getHandoffConstraints(toAgent),
      previousFeedback: feedback,
    };
  }

  protected buildHandoffContext(): string {
    if (!this.currentTask) return 'No active task context.';
    return `Agent ${this.config.title} completed work on task: ${this.currentTask.title}`;
  }

  protected buildHandoffInstructions(toAgent: AgentRole, stage: PipelineStage): string {
    return `Continuing pipeline at stage ${stage}. Please review provided artifacts and proceed with your responsibilities.`;
  }

  protected getHandoffConstraints(toAgent: AgentRole): string[] {
    return [
      'Maintain consistency with previous artifacts',
      'Do not modify approved artifacts without requesting a revision',
      'Report any blocking issues immediately',
    ];
  }

  protected createArtifact(
    type: ArtifactType,
    name: string,
    description: string,
    content: string,
    filePath: string,
    metadata: Record<string, unknown> = {},
  ): Artifact {
    const artifact: Artifact = {
      id: uuidv4(),
      type,
      name,
      description,
      filePath,
      createdBy: this.role,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      content,
      metadata,
      status: ArtifactStatus.DRAFT,
      reviewStatus: ReviewStatus.PENDING,
    };

    const errors = validateArtifact(artifact);
    if (errors.length > 0) {
      throw new Error(`Invalid artifact: ${errors.map((e) => e.message).join(', ')}`);
    }

    return artifact;
  }

  protected createIssue(
    featureId: string,
    type: Issue['type'],
    severity: Issue['severity'],
    title: string,
    description: string,
    stage: PipelineStage,
  ): Issue {
    return {
      id: uuidv4(),
      featureId,
      type,
      severity,
      title,
      description,
      reportedBy: this.role,
      stage,
      status: 'open' as Issue['status'],
      createdAt: new Date(),
    };
  }

  private validateInputArtifacts(artifacts: Artifact[]): void {
    for (const artifact of artifacts) {
      const errors = validateArtifact(artifact);
      if (errors.length > 0) {
        agentLog(
          this.role,
          `Warning: Input artifact "${artifact.name}" has validation issues: ${errors.map((e) => e.message).join(', ')}`,
          undefined,
          'warn',
        );
      }
    }
  }

  private estimateTokensUsed(output: string): number {
    return Math.ceil(output.length / 4);
  }
}

export interface AgentConstructor {
  new (artifactStore: ArtifactStore): BaseAgent;
}
