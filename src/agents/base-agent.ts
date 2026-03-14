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
  type HandoffPayload,
  type Skill,
} from '../types';
import { agentLog } from '../utils/logger';
import { validateArtifact } from '../utils/validators';
import { type ArtifactStore } from '../workspace/artifact-store';
import { optimizeInputArtifacts, estimateTokens } from '../context/context-optimizer';
import { isRtkInstalled } from '../utils/rtk';

export interface ProjectContext {
  language: string;
  framework: string;
  testFramework: string;
  buildTool: string;
  cloudProvider: string;
  projectName?: string;
  customInstructions?: string;
}

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected status: AgentStatus = AgentStatus.IDLE;
  protected currentTask: AgentTask | null = null;
  protected artifactStore: ArtifactStore;
  protected activeSkills: Skill[] = [];
  protected projectContext: ProjectContext | null = null;

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

  getActiveSkills(): Skill[] {
    return this.activeSkills;
  }

  getActiveSkillIds(): string[] {
    return this.activeSkills.map((s) => s.id);
  }

  setActiveSkills(skills: Skill[]): void {
    this.activeSkills = skills;
    agentLog(this.role, `Active skills: ${skills.map((s) => s.id).join(', ') || 'none'}`);
  }

  setProjectContext(context: ProjectContext): void {
    this.projectContext = context;
  }

  getCapabilities(): string[] {
    const baseCapabilities = this.config.capabilities.map((c) => c.name);
    const skillCapabilities = this.activeSkills.map((s) => s.name);
    return [...new Set([...baseCapabilities, ...skillCapabilities])];
  }

  getAllowedTools(): string[] {
    return this.config.capabilities.flatMap((c) => c.allowedTools);
  }

  getMaxTokenBudget(): number {
    return this.config.maxTokenBudget;
  }

  getExpectedOutputArtifacts(): ArtifactType[] {
    const baseOutputs = this.config.outputArtifacts;
    const skillOutputs = this.activeSkills.flatMap((s) => s.expectedArtifacts);
    return [...new Set([...baseOutputs, ...skillOutputs])];
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    this.currentTask = task;
    this.status = AgentStatus.WORKING;

    agentLog(this.role, `Starting task: ${task.title}`, task.step);
    if (this.activeSkills.length > 0) {
      agentLog(this.role, `Using skills: ${this.activeSkills.map((s) => s.id).join(', ')}`, task.step);
    }

    const startTime = Date.now();
    let result: AgentResult;

    try {
      this.validateInputArtifacts(task.inputArtifacts);

      const output = await this.performWork(task);
      const artifacts = await this.produceArtifacts(task, output);
      const issues = await this.identifyIssues(task, output);

      result = {
        agentRole: this.role,
        skills: this.getActiveSkillIds(),
        status: 'success',
        output,
        artifacts,
        issues,
        tokensUsed: this.estimateTokensUsed(output),
        durationMs: Date.now() - startTime,
        metadata: { taskId: task.id, skills: this.getActiveSkillIds() },
      };

      agentLog(this.role, `Task completed: ${task.title}`, task.step);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      agentLog(this.role, `Task failed: ${errorMessage}`, task.step, 'error');

      result = {
        agentRole: this.role,
        skills: this.getActiveSkillIds(),
        status: 'failure',
        output: errorMessage,
        artifacts: [],
        issues: [],
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        metadata: { taskId: task.id, error: errorMessage, skills: this.getActiveSkillIds() },
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

    if (this.activeSkills.length > 0) {
      sections.push(`## Active Skills\n${this.buildSkillPromptSections()}`);
    }

    sections.push(`## Task\n**${task.title}**\n${task.description}`);

    if (task.instructions) {
      sections.push(`## Detailed Instructions\n${task.instructions}`);
    }

    if (task.inputArtifacts.length > 0) {
      const optimized = optimizeInputArtifacts(task.inputArtifacts, task.assignedTo);
      sections.push(`## Input Artifacts (${task.inputArtifacts.length})\n${optimized}`);
    }

    const expectedOutputs = this.getExpectedOutputArtifacts();
    if (expectedOutputs.length > 0) {
      const outputs = expectedOutputs.map((t) => `- ${t}`).join('\n');
      sections.push(`## Expected Outputs\n${outputs}`);
    }

    if (task.constraints.length > 0) {
      const constraints = task.constraints.map((c) => `- ${c}`).join('\n');
      sections.push(`## Constraints\n${constraints}`);
    }

    sections.push(this.getOutputFormatInstructions());

    const prompt = sections.join('\n\n');
    const tokens = estimateTokens(prompt);
    agentLog(this.role, `Prompt: ~${tokens.toLocaleString()} tokens`, task.step);

    return prompt;
  }

  protected buildSkillPromptSections(): string {
    if (this.activeSkills.length === 0) {
      return '';
    }

    const sections: string[] = [];

    for (const skill of this.activeSkills) {
      let template = skill.promptTemplate;

      if (this.projectContext) {
        template = this.interpolateSkillTemplate(template, this.projectContext);
      }

      sections.push(`### ${skill.name}\n${template}`);
    }

    return sections.join('\n\n');
  }

  protected interpolateSkillTemplate(template: string, context: ProjectContext): string {
    return template
      .replace(/\{language\}/g, context.language || 'unknown')
      .replace(/\{framework\}/g, context.framework || 'none')
      .replace(/\{testFramework\}/g, context.testFramework || 'unknown')
      .replace(/\{buildTool\}/g, context.buildTool || 'unknown')
      .replace(/\{cloudProvider\}/g, context.cloudProvider || 'none')
      .replace(/\{projectName\}/g, context.projectName || 'project')
      .replace(/\{customInstructions\}/g, context.customInstructions || '');
  }

  protected getOutputFormatInstructions(): string {
    const rtkNote = isRtkInstalled()
      ? '\nWhen running CLI commands, prefer concise output flags (--oneline, -1, --short). CLI outputs are automatically compressed by RTK.\n'
      : '';

    return `## Output Format
Write a brief summary of what was accomplished, then emit each artifact and issue using EXACTLY the block format below. Each field MUST be on its own line — do not combine fields with | separators.
${rtkNote}
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

End with a Recommendations section for the next step.`;
  }

  prepareHandoff(
    toAgent: AgentRole,
    step: string,
    artifacts: Artifact[],
    feedback?: string[],
  ): HandoffPayload {
    return {
      fromAgent: this.role,
      toAgent,
      step,
      context: this.buildHandoffContext(),
      artifacts,
      instructions: this.buildHandoffInstructions(toAgent, step),
      constraints: this.getHandoffConstraints(toAgent),
      previousFeedback: feedback,
    };
  }

  protected buildHandoffContext(): string {
    if (!this.currentTask) return 'No active task context.';
    const skills = this.activeSkills.length > 0
      ? ` (skills: ${this.activeSkills.map((s) => s.id).join(', ')})`
      : '';
    return `Agent ${this.config.title}${skills} completed work on task: ${this.currentTask.title}`;
  }

  protected buildHandoffInstructions(toAgent: AgentRole, step: string): string {
    return `Continuing pipeline at step ${step}. Please review provided artifacts and proceed with your responsibilities.`;
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
      metadata: {
        ...metadata,
        skills: this.getActiveSkillIds(),
      },
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
    step: string,
  ): Issue {
    return {
      id: uuidv4(),
      featureId,
      type,
      severity,
      title,
      description,
      reportedBy: this.role,
      step,
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
