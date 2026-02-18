import * as fs from 'node:fs';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import {
  type Feature,
  PipelineStage,
  type StageResult,
  StageStatus,
  StageMetrics,
  type AgentTask,
  type AgentResult,
  AgentStatus,
  type AgentRole,
  type Artifact,
  type Issue,
  MessagePriority,
  MessageType,
  FeatureStatus,
} from '../types';
import { AgentRegistry } from '../agents/index';
import { type ArtifactStore } from '../workspace/artifact-store';
import { MessageBus } from '../communication/message-bus';
import { HandoffProtocol } from '../communication/handoff';
import { TransitionEngine, TransitionResult } from '../pipeline/transitions';
import { getStageConfig, getAllStageConfigs, getStagesInOrder, getNextStage } from '../pipeline/stages';
import { type ProjectContext } from './context';
import { ClaudeCodeBridge, type ClaudeCodeOptions } from './claude-code-bridge';
import { DevelopmentTracker } from '../tracker/development-tracker';
import { pipelineLog, stageLog, agentLog } from '../utils/logger';
import { type CDMConfig } from '../utils/config';

export interface PipelineOptions {
  skipStages: PipelineStage[];
  maxRetries: number;
  dryRun: boolean;
  interactive: boolean;
  startFromStage?: PipelineStage;
  onStageStart?: (stage: PipelineStage) => void;
  onStageComplete?: (stage: PipelineStage, result: StageResult) => void;
  onAgentWork?: (role: AgentRole, task: AgentTask) => void;
  onError?: (stage: PipelineStage, error: Error) => void;
}

export interface PipelineResult {
  featureId: string;
  success: boolean;
  stagesCompleted: PipelineStage[];
  stagesFailed: PipelineStage[];
  stagesSkipped: PipelineStage[];
  totalTokensUsed: number;
  totalDurationMs: number;
  artifacts: Artifact[];
  issues: Issue[];
  executionMode: string;
}

export class PipelineOrchestrator {
  private agentRegistry: AgentRegistry;
  private artifactStore: ArtifactStore;
  private messageBus: MessageBus;
  private handoffProtocol: HandoffProtocol;
  private transitionEngine: TransitionEngine;
  private projectContext: ProjectContext;
  private bridge: ClaudeCodeBridge;
  private config: CDMConfig;
  private projectAnalysis: string | null = null;
  private codeStyleProfile: string | null = null;
  private tracker: DevelopmentTracker;

  constructor(
    projectContext: ProjectContext,
    artifactStore: ArtifactStore,
    config: CDMConfig,
    bridgeOptions?: Partial<ClaudeCodeOptions>,
  ) {
    this.projectContext = projectContext;
    this.artifactStore = artifactStore;
    this.config = config;

    this.agentRegistry = new AgentRegistry(artifactStore);
    this.messageBus = new MessageBus();
    this.handoffProtocol = new HandoffProtocol(this.messageBus);
    this.transitionEngine = new TransitionEngine(artifactStore);

    const project = projectContext.getProject();
    this.bridge = new ClaudeCodeBridge(this.agentRegistry, this.artifactStore, {
      projectPath: project.rootPath,
      ...bridgeOptions,
    });

    this.tracker = new DevelopmentTracker(project.rootPath, project.id, project.name);
    this.projectAnalysis = this.loadProjectAnalysis();
    this.codeStyleProfile = this.loadCodeStyleProfile();
  }

  async runFeaturePipeline(
    feature: Feature,
    options: PipelineOptions,
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const result: PipelineResult = {
      featureId: feature.id,
      success: false,
      stagesCompleted: [],
      stagesFailed: [],
      stagesSkipped: [],
      totalTokensUsed: 0,
      totalDurationMs: 0,
      artifacts: [],
      issues: [],
      executionMode: this.bridge.getExecutionMode(),
    };

    pipelineLog(`Starting pipeline for feature: ${feature.name}`);
    pipelineLog(`Execution mode: ${this.bridge.getExecutionMode()} (Claude CLI ${this.bridge.isClaudeAvailable() ? 'available' : 'not found — using simulation'})`);

    this.tracker.recordPipelineStarted(feature.id, feature.name, this.bridge.getExecutionMode());

    this.projectContext.updateFeature(feature.id, {
      status: FeatureStatus.IN_PROGRESS,
    });

    const stages = getStagesInOrder();
    let reachedStartStage = !options.startFromStage;

    for (const stage of stages) {
      if (stage === PipelineStage.COMPLETED) continue;

      if (!reachedStartStage) {
        if (stage === options.startFromStage) {
          reachedStartStage = true;
        } else {
          result.stagesSkipped.push(stage);
          continue;
        }
      }

      if (options.skipStages.includes(stage)) {
        if (this.transitionEngine.canSkipStage(stage)) {
          stageLog(stage, 'Skipping stage (user request)');
          this.tracker.recordStageSkipped(feature.id, stage, 'user request');
          result.stagesSkipped.push(stage);
          continue;
        } else {
          stageLog(stage, 'Cannot skip this stage — it is mandatory', 'warn');
        }
      }

      const stageConfig = getStageConfig(stage);
      if (!stageConfig) {
        stageLog(stage, 'Stage configuration not found', 'error');
        result.stagesFailed.push(stage);
        break;
      }

      if (!this.isAgentEnabled(stageConfig.primaryAgent)) {
        stageLog(stage, `Primary agent ${stageConfig.primaryAgent} is disabled, skipping`);
        this.tracker.recordStageSkipped(feature.id, stage, `agent ${stageConfig.primaryAgent} disabled`);
        result.stagesSkipped.push(stage);
        continue;
      }

      options.onStageStart?.(stage);
      stageLog(stage, `Starting stage: ${stageConfig.name}`);
      this.tracker.recordStageStarted(feature.id, stage, stageConfig.primaryAgent);

      this.projectContext.updateFeatureStage(feature.id, stage);

      let stageResult: StageResult | null = null;
      let retryCount = 0;
      const maxRetries = Math.min(options.maxRetries, stageConfig.maxRetries);

      while (retryCount <= maxRetries) {
        try {
          stageResult = await this.executeStage(feature, stage, options);

          if (
            stageResult.status === StageStatus.APPROVED ||
            stageResult.status === StageStatus.SKIPPED
          ) {
            break;
          }

          if (stageResult.status === StageStatus.REVISION_NEEDED) {
            retryCount++;
            if (retryCount <= maxRetries) {
              stageLog(stage, `Revision needed, retry ${retryCount}/${maxRetries}`);
              this.tracker.recordStageRetried(feature.id, stage, retryCount, maxRetries);
            }
          } else {
            break;
          }
        } catch (error) {
          retryCount++;
          const err = error instanceof Error ? error : new Error(String(error));
          options.onError?.(stage, err);
          stageLog(stage, `Error: ${err.message}, retry ${retryCount}/${maxRetries}`, 'error');
          this.tracker.recordStageFailed(feature.id, stage, err.message);

          if (retryCount > maxRetries) {
            stageResult = this.createFailedStageResult(stage, err);
          }
        }
      }

      if (!stageResult) {
        stageResult = this.createFailedStageResult(
          stage,
          new Error('Stage produced no result'),
        );
      }

      this.projectContext.recordStageResult(feature.id, stageResult);
      result.totalTokensUsed += stageResult.metrics.tokensUsed;
      result.artifacts.push(...stageResult.artifacts);
      result.issues.push(...stageResult.issues);

      this.tracker.recordStageCompleted(feature.id, stage, stageResult);

      for (const artifact of stageResult.artifacts) {
        this.tracker.recordArtifactProduced(feature.id, stage, artifact.name, artifact.type, artifact.createdBy);
      }
      for (const issue of stageResult.issues) {
        this.tracker.recordIssueFound(feature.id, stage, issue.title, issue.severity, issue.reportedBy);
      }

      options.onStageComplete?.(stage, stageResult);

      if (stageResult.status === StageStatus.APPROVED || stageResult.status === StageStatus.SKIPPED) {
        result.stagesCompleted.push(stage);
        stageLog(stage, `Stage completed: ${stageConfig.name}`);
      } else {
        result.stagesFailed.push(stage);
        stageLog(stage, `Stage failed: ${stageConfig.name}`, 'error');
        break;
      }
    }

    result.totalDurationMs = Date.now() - startTime;
    result.success = result.stagesFailed.length === 0;

    if (result.success) {
      this.projectContext.completeFeature(feature.id);
      this.tracker.recordPipelineCompleted(feature.id, feature.name, result.totalDurationMs, result.totalTokensUsed, result.artifacts.length, result.issues.length);
      pipelineLog(`Pipeline completed successfully for feature: ${feature.name}`);
    } else {
      this.projectContext.updateFeature(feature.id, {
        status: FeatureStatus.ON_HOLD,
      });
      this.tracker.recordPipelineFailed(feature.id, feature.name, result.stagesFailed[0]!);
      pipelineLog(`Pipeline failed at stage(s): ${result.stagesFailed.join(', ')}`);
    }

    this.tracker.saveHistory();
    return result;
  }

  private async executeStage(
    feature: Feature,
    stage: PipelineStage,
    options: PipelineOptions,
  ): Promise<StageResult> {
    const stageConfig = getStageConfig(stage)!;
    const startTime = Date.now();

    const inputArtifacts = this.gatherInputArtifacts(stageConfig.requiredArtifacts);

    const primaryAgent = this.agentRegistry.getAgent(stageConfig.primaryAgent);
    const task = this.createAgentTask(feature, stage, stageConfig.primaryAgent, inputArtifacts);

    options.onAgentWork?.(stageConfig.primaryAgent, task);
    agentLog(stageConfig.primaryAgent, `Executing primary work for ${stageConfig.name}`, stage);

    const primaryResult = await this.bridge.executeAgentTask(task);
    this.tracker.recordAgentTask(feature.id, stage, stageConfig.primaryAgent, task.title, primaryResult);

    const allArtifacts = [...primaryResult.artifacts];
    const allIssues = [...primaryResult.issues];
    let totalTokens = primaryResult.tokensUsed;

    for (const supportRole of stageConfig.supportingAgents) {
      if (!this.isAgentEnabled(supportRole)) continue;

      const supportTask = this.createAgentTask(
        feature, stage, supportRole,
        [...inputArtifacts, ...primaryResult.artifacts],
      );

      options.onAgentWork?.(supportRole, supportTask);
      agentLog(supportRole, `Executing supporting work for ${stageConfig.name}`, stage);

      const supportResult = await this.bridge.executeAgentTask(supportTask);
      this.tracker.recordAgentTask(feature.id, stage, supportRole, supportTask.title, supportResult);
      allArtifacts.push(...supportResult.artifacts);
      allIssues.push(...supportResult.issues);
      totalTokens += supportResult.tokensUsed;
    }

    let reviewApproved = stageConfig.reviewers.length === 0;
    for (const reviewerRole of stageConfig.reviewers) {
      if (!this.isAgentEnabled(reviewerRole)) {
        reviewApproved = true;
        continue;
      }

      const reviewTask = this.createReviewTask(
        feature, stage, reviewerRole,
        allArtifacts, primaryResult,
      );

      agentLog(reviewerRole, `Reviewing work for ${stageConfig.name}`, stage);

      const reviewResult = await this.bridge.executeAgentTask(reviewTask);
      this.tracker.recordAgentTask(feature.id, stage, reviewerRole, reviewTask.title, reviewResult);
      allIssues.push(...reviewResult.issues);
      totalTokens += reviewResult.tokensUsed;

      const hasCritical = reviewResult.issues.some(
        (i) => i.severity === 'critical',
      );
      if (!hasCritical) {
        reviewApproved = true;
      }
    }

    const stageResult: StageResult = {
      stage,
      status: reviewApproved ? StageStatus.APPROVED : StageStatus.REVISION_NEEDED,
      startedAt: new Date(startTime),
      completedAt: new Date(),
      agentResults: [primaryResult],
      artifacts: allArtifacts,
      issues: allIssues,
      metrics: {
        tokensUsed: totalTokens,
        durationMs: Date.now() - startTime,
        retryCount: 0,
        artifactsProduced: allArtifacts.length,
        issuesFound: allIssues.length,
        issuesResolved: 0,
      },
    };

    if (stageResult.status === StageStatus.APPROVED) {
      const nextStage = getNextStage(stage);
      if (nextStage && nextStage !== PipelineStage.COMPLETED) {
        const nextConfig = getStageConfig(nextStage);
        if (nextConfig) {
          const handoff = primaryAgent.prepareHandoff(
            nextConfig.primaryAgent,
            nextStage,
            allArtifacts,
          );
          await this.handoffProtocol.executeHandoff(handoff);
        }
      }
    }

    return stageResult;
  }

  private createAgentTask(
    feature: Feature,
    stage: PipelineStage,
    agentRole: AgentRole,
    inputArtifacts: Artifact[],
  ): AgentTask {
    const stageConfig = getStageConfig(stage)!;
    const agentConfig = this.agentRegistry.getConfig(agentRole);

    return {
      id: uuidv4(),
      featureId: feature.id,
      stage,
      assignedTo: agentRole,
      title: `${stageConfig.name} for "${feature.name}"`,
      description: `${stageConfig.description}\n\nFeature: ${feature.name}\nDescription: ${feature.description}`,
      instructions: this.buildTaskInstructions(feature, stage, agentRole),
      inputArtifacts,
      expectedOutputs: agentConfig.outputArtifacts,
      constraints: this.getAgentConstraints(agentRole, stage),
      priority: MessagePriority.HIGH,
      status: AgentStatus.IDLE,
      createdAt: new Date(),
    };
  }

  private createReviewTask(
    feature: Feature,
    stage: PipelineStage,
    reviewerRole: AgentRole,
    artifacts: Artifact[],
    primaryResult: AgentResult,
  ): AgentTask {
    return {
      id: uuidv4(),
      featureId: feature.id,
      stage,
      assignedTo: reviewerRole,
      title: `Review: ${stage} for "${feature.name}"`,
      description: `Review the work produced during ${stage}. Evaluate quality, completeness, and correctness.`,
      instructions: `Please review the following artifacts produced during the ${stage} stage.
Evaluate against the project standards and requirements.
Flag any issues with appropriate severity levels.
If the work meets standards, approve it. If changes are needed, detail what must be fixed.`,
      inputArtifacts: artifacts,
      expectedOutputs: [],
      constraints: [
        'Focus on your area of expertise',
        'Provide specific, actionable feedback',
        'Rate issues by severity accurately',
      ],
      priority: MessagePriority.HIGH,
      status: AgentStatus.IDLE,
      createdAt: new Date(),
    };
  }

  private gatherInputArtifacts(requiredTypes: import('../types').ArtifactType[]): Artifact[] {
    const artifacts: Artifact[] = [];
    for (const type of requiredTypes) {
      const latest = this.artifactStore.getLatestByType(type);
      if (latest) {
        artifacts.push(latest);
      }
    }
    return artifacts;
  }

  private buildTaskInstructions(
    feature: Feature,
    stage: PipelineStage,
    agentRole: AgentRole,
  ): string {
    const instructions: string[] = [];

    instructions.push(`You are working on feature: "${feature.name}"`);
    instructions.push(`Feature description: ${feature.description}`);
    instructions.push(`Current stage: ${stage}`);
    instructions.push(`Your role: ${agentRole}`);

    const project = this.projectContext.getProject();
    instructions.push(`\nProject context:`);
    instructions.push(`- Language: ${project.config.language}`);
    instructions.push(`- Framework: ${project.config.framework}`);
    instructions.push(`- Test framework: ${project.config.testFramework}`);
    instructions.push(`- Build tool: ${project.config.buildTool}`);
    instructions.push(`- Cloud provider: ${project.config.cloudProvider}`);

    if (project.config.customInstructions) {
      instructions.push(`\nCustom instructions: ${project.config.customInstructions}`);
    }

    if (this.projectAnalysis) {
      instructions.push(`\n--- PROJECT ANALYSIS (use this as your primary reference for the codebase) ---\n`);
      instructions.push(this.projectAnalysis);
      instructions.push(`\n--- END PROJECT ANALYSIS ---`);
    }

    if (this.codeStyleProfile) {
      instructions.push(`\n--- CODE STYLE PROFILE (you MUST follow these conventions) ---\n`);
      instructions.push(this.codeStyleProfile);
      instructions.push(`\n--- END CODE STYLE PROFILE ---`);
    }

    const previousResults = Array.from(feature.stageResults.entries());
    if (previousResults.length > 0) {
      instructions.push(`\nPrevious stage results:`);
      for (const [prevStage, result] of previousResults) {
        instructions.push(`- ${prevStage}: ${result.status} (${result.artifacts.length} artifacts, ${result.issues.length} issues)`);
      }
    }

    return instructions.join('\n');
  }

  private loadProjectAnalysis(): string | null {
    const analysisPath = path.join(
      this.projectContext.getProject().rootPath,
      '.cdm',
      'project-analysis.md',
    );

    if (fs.existsSync(analysisPath)) {
      try {
        const content = fs.readFileSync(analysisPath, 'utf-8');
        pipelineLog(`Loaded project analysis (${(content.length / 1024).toFixed(1)} KB)`);
        return content;
      } catch {
        pipelineLog('Failed to read project analysis file');
      }
    }

    return null;
  }

  private loadCodeStyleProfile(): string | null {
    const profilePath = path.join(
      this.projectContext.getProject().rootPath,
      '.cdm',
      'codestyle-profile.md',
    );

    if (fs.existsSync(profilePath)) {
      try {
        const content = fs.readFileSync(profilePath, 'utf-8');
        pipelineLog(`Loaded code style profile (${(content.length / 1024).toFixed(1)} KB)`);
        return content;
      } catch {
        pipelineLog('Failed to read code style profile');
      }
    }

    return null;
  }

  private getAgentConstraints(agentRole: AgentRole, stage: PipelineStage): string[] {
    const constraints: string[] = [
      'Follow the project coding standards and conventions',
      'Produce all expected output artifacts',
      'Report any issues or concerns',
      'Stay within your area of responsibility',
    ];

    const agentConfig = this.agentRegistry.getConfig(agentRole);
    if (agentConfig.blockedFilePatterns.length > 0) {
      constraints.push(`Do not modify files matching: ${agentConfig.blockedFilePatterns.join(', ')}`);
    }

    return constraints;
  }

  private isAgentEnabled(role: AgentRole): boolean {
    const override = this.config.agents[role];
    return override?.enabled !== false;
  }

  private createFailedStageResult(stage: PipelineStage, error: Error): StageResult {
    return {
      stage,
      status: StageStatus.FAILED,
      startedAt: new Date(),
      completedAt: new Date(),
      agentResults: [],
      artifacts: [],
      issues: [],
      metrics: {
        tokensUsed: 0,
        durationMs: 0,
        retryCount: 0,
        artifactsProduced: 0,
        issuesFound: 0,
        issuesResolved: 0,
      },
    };
  }

  getBridge(): ClaudeCodeBridge {
    return this.bridge;
  }

  getTracker(): DevelopmentTracker {
    return this.tracker;
  }

  getAgentRegistry(): AgentRegistry {
    return this.agentRegistry;
  }

  getMessageBus(): MessageBus {
    return this.messageBus;
  }

  getTransitionEngine(): TransitionEngine {
    return this.transitionEngine;
  }
}
