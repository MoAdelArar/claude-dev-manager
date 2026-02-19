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
  AgentRole,
  type Artifact,
  type Issue,
  MessagePriority,
  FeatureStatus,
} from '../types';
import { AgentRegistry } from '../agents/index';
import { type ArtifactStore } from '../workspace/artifact-store';
import { TransitionEngine } from '../pipeline/transitions';
import { getStageConfig, getStagesInOrder } from '../pipeline/stages';
import { type ProjectContext } from './context';
import { ClaudeCodeBridge, type ClaudeCodeOptions } from './claude-code-bridge';
import { DevelopmentTracker } from '../tracker/development-tracker';
import { optimizeAnalysisForRole, optimizeProfileForRole } from '../context/context-optimizer';
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
  contextOptimized: boolean;
}

// Roles that benefit from per-directory module context
const CODE_ROLES = new Set<AgentRole>([
  AgentRole.SENIOR_DEVELOPER,
  AgentRole.JUNIOR_DEVELOPER,
  AgentRole.CODE_REVIEWER,
  AgentRole.DATABASE_ENGINEER,
]);

export class PipelineOrchestrator {
  private agentRegistry: AgentRegistry;
  private artifactStore: ArtifactStore;
  private transitionEngine: TransitionEngine;
  private projectContext: ProjectContext;
  private bridge: ClaudeCodeBridge;
  private config: CDMConfig;
  private projectAnalysis: string | null = null;
  private codeStyleProfile: string | null = null;
  private entityFiles: Map<string, string> = new Map();
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
    this.transitionEngine = new TransitionEngine(artifactStore);

    const project = projectContext.getProject();
    this.bridge = new ClaudeCodeBridge(this.agentRegistry, this.artifactStore, {
      projectPath: project.rootPath,
      ...bridgeOptions,
    });

    this.tracker = new DevelopmentTracker(project.rootPath, project.id, project.name);
    this.projectAnalysis = this.loadProjectAnalysis();
    this.codeStyleProfile = this.loadCodeStyleProfile();
    this.entityFiles = this.loadEntityFiles();
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
      contextOptimized: this.projectAnalysis !== null || this.codeStyleProfile !== null,
    };

    pipelineLog(`Starting pipeline for feature: ${feature.name}`);
    pipelineLog(`Execution mode: ${this.bridge.getExecutionMode()} (Claude CLI ${this.bridge.isClaudeAvailable() ? 'available' : 'not found — using simulation'})`);
    if (result.contextOptimized) {
      pipelineLog('Context optimization: ON (role-aware filtering + artifact summarization)');
    }
    if (this.entityFiles.size > 0) {
      pipelineLog(`Entity context: ${this.entityFiles.size} module file(s) loaded`);
    }

    // Merge user-supplied skips with auto-inferred skips based on feature description
    const effectiveSkipStages = new Set([
      ...options.skipStages,
      ...this.inferSkipStages(feature.description),
    ]);

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

      if (effectiveSkipStages.has(stage)) {
        if (this.transitionEngine.canSkipStage(stage)) {
          const reason = options.skipStages.includes(stage) ? 'user request' : 'auto-inferred';
          stageLog(stage, `Skipping stage (${reason})`);
          this.tracker.recordStageSkipped(feature.id, stage, reason);
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

    const inputArtifacts = this.gatherInputArtifacts(stageConfig.requiredArtifacts, feature.id);

    // ── Primary agent (always sequential — others depend on its output) ──────
    const task = this.createAgentTask(feature, stage, stageConfig.primaryAgent, inputArtifacts);
    options.onAgentWork?.(stageConfig.primaryAgent, task);
    agentLog(stageConfig.primaryAgent, `Executing primary work for ${stageConfig.name}`, stage);

    const primaryResult = await this.bridge.executeAgentTask(task);
    this.tracker.recordAgentTask(feature.id, stage, stageConfig.primaryAgent, task.title, primaryResult);

    const allArtifacts = [...primaryResult.artifacts];
    const allIssues = [...primaryResult.issues];
    let totalTokens = primaryResult.tokensUsed;

    // ── Supporting agents (parallel — all receive primary's output) ──────────
    const enabledSupport = stageConfig.supportingAgents.filter(r => this.isAgentEnabled(r));
    if (enabledSupport.length > 0) {
      const supportResults = await Promise.all(
        enabledSupport.map(async (supportRole) => {
          const supportTask = this.createAgentTask(
            feature, stage, supportRole,
            [...inputArtifacts, ...primaryResult.artifacts],
          );
          options.onAgentWork?.(supportRole, supportTask);
          agentLog(supportRole, `Executing supporting work for ${stageConfig.name}`, stage);
          const result = await this.bridge.executeAgentTask(supportTask);
          this.tracker.recordAgentTask(feature.id, stage, supportRole, supportTask.title, result);
          return result;
        }),
      );
      for (const r of supportResults) {
        allArtifacts.push(...r.artifacts);
        allIssues.push(...r.issues);
        totalTokens += r.tokensUsed;
      }
    }

    // ── Reviewers (parallel — all review the same completed artifact set) ────
    const enabledReviewers = stageConfig.reviewers.filter(r => this.isAgentEnabled(r));
    let reviewApproved = enabledReviewers.length === 0;

    if (enabledReviewers.length > 0) {
      const reviewResults = await Promise.all(
        enabledReviewers.map(async (reviewerRole) => {
          const reviewTask = this.createReviewTask(feature, stage, reviewerRole, allArtifacts, primaryResult);
          agentLog(reviewerRole, `Reviewing work for ${stageConfig.name}`, stage);
          const result = await this.bridge.executeAgentTask(reviewTask);
          this.tracker.recordAgentTask(feature.id, stage, reviewerRole, reviewTask.title, result);
          return result;
        }),
      );
      // Approved only when no reviewer raised a critical issue
      reviewApproved = !reviewResults.some(r => r.issues.some(i => i.severity === 'critical'));
      for (const r of reviewResults) {
        allIssues.push(...r.issues);
        totalTokens += r.tokensUsed;
      }
    }

    return {
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

  private gatherInputArtifacts(requiredTypes: import('../types').ArtifactType[], featureId: string): Artifact[] {
    const artifacts: Artifact[] = [];
    for (const type of requiredTypes) {
      // Prefer an artifact produced by the current feature; fall back to the most recent
      const all = this.artifactStore.getByType(type); // sorted newest first
      const artifact = all.find(a => a.metadata?.featureId === featureId) ?? all[0];
      if (artifact) artifacts.push(artifact);
    }
    return artifacts;
  }

  private buildTaskInstructions(
    feature: Feature,
    stage: PipelineStage,
    agentRole: AgentRole,
  ): string {
    const instructions: string[] = [];

    // Feature goal — role/stage already appear in the prompt header built by BaseAgent
    instructions.push(`Feature: "${feature.name}"`);
    if (feature.description !== feature.name) {
      instructions.push(`Description: ${feature.description}`);
    }

    // Custom project instructions only (stack/framework already in agent system prompt)
    const project = this.projectContext.getProject();
    if (project.config.customInstructions) {
      instructions.push(`\nProject-specific instructions: ${project.config.customInstructions}`);
    }

    // Role-filtered overview (entry points, deps, patterns, etc.)
    const filteredAnalysis = optimizeAnalysisForRole(this.projectAnalysis, agentRole);
    if (filteredAnalysis) {
      instructions.push(`\n--- PROJECT OVERVIEW ---\n${filteredAnalysis}\n--- END PROJECT OVERVIEW ---`);
    }

    // Role-filtered code style conventions
    const filteredProfile = optimizeProfileForRole(this.codeStyleProfile, agentRole);
    if (filteredProfile) {
      instructions.push(`\n--- CODE CONVENTIONS (follow these) ---\n${filteredProfile}\n--- END CODE CONVENTIONS ---`);
    }

    // Per-directory module context for code-authoring roles
    if (CODE_ROLES.has(agentRole) && this.entityFiles.size > 0) {
      const relevant = this.selectEntityFiles(feature.description);
      instructions.push(`\n--- MODULE CONTEXT ---`);
      for (const [name, content] of relevant) {
        instructions.push(`\n### ${name}\n${content}`);
      }
      instructions.push(`--- END MODULE CONTEXT ---`);
    }

    // Last 3 stage results — enough for continuity without bloat
    const previousResults = Array.from(feature.stageResults.entries()).slice(-3);
    if (previousResults.length > 0) {
      instructions.push(`\nPrevious stages:`);
      for (const [prevStage, result] of previousResults) {
        instructions.push(`- ${prevStage}: ${result.status} (${result.artifacts.length} artifacts, ${result.issues.length} issues)`);
      }
    }

    return instructions.join('\n');
  }

  // ── Entity files ─────────────────────────────────────────────────────────

  private loadEntityFiles(): Map<string, string> {
    const analysisDir = path.join(
      this.projectContext.getProject().rootPath,
      '.cdm', 'analysis',
    );
    const files = new Map<string, string>();
    const skip = new Set(['overview.md', 'structure.md', 'codestyle.md']);

    if (!fs.existsSync(analysisDir)) return files;

    try {
      for (const name of fs.readdirSync(analysisDir)) {
        if (!name.endsWith('.md') || skip.has(name)) continue;
        const content = fs.readFileSync(path.join(analysisDir, name), 'utf-8');
        files.set(name, content);
      }
      if (files.size > 0) {
        pipelineLog(`Loaded ${files.size} entity file(s) from .cdm/analysis/`);
      }
    } catch {
      pipelineLog('Failed to read entity files from .cdm/analysis/');
    }

    return files;
  }

  // Returns entity files whose name matches keywords in the feature description.
  // Falls back to all entity files when there are no keyword matches.
  private selectEntityFiles(featureDescription: string): Map<string, string> {
    const words = featureDescription.toLowerCase().match(/\b\w{4,}\b/g) ?? [];
    const matched = new Map<string, string>();

    for (const [name, content] of this.entityFiles) {
      const entityName = name.replace('.md', '').toLowerCase();
      if (words.some(w => entityName.includes(w) || w.includes(entityName))) {
        matched.set(name, content);
      }
    }

    return matched.size > 0 ? matched : new Map(this.entityFiles);
  }

  // ── Smart stage inference ─────────────────────────────────────────────────

  // Infers skippable stages from the feature description without touching
  // mandatory stages (canBeSkipped: false). Only conservative, safe skips.
  private inferSkipStages(description: string): PipelineStage[] {
    const desc = description.toLowerCase();
    const toSkip: PipelineStage[] = [];

    const hasFrontend = /\b(ui|ux|design|button|page|component|screen|layout|css|style|modal|form|animation|responsive|visual|frontend|front-end)\b/.test(desc);
    const hasBackend  = /\b(api|endpoint|database|schema|migration|query|service|model|cache|queue|job|webhook|server|backend|back-end|auth|permission|role)\b/.test(desc);
    const isSimple    = /\b(fix|typo|rename|refactor|cleanup|clean[ -]up|format|lint|minor|tweak|wording|copy)\b/.test(desc);

    // Pure backend feature — no UI work expected
    if (hasBackend && !hasFrontend) {
      toSkip.push(PipelineStage.UI_UX_DESIGN);
    }

    // Simple non-security-sensitive changes — security review adds no value
    if (isSimple && !hasBackend) {
      toSkip.push(PipelineStage.SECURITY_REVIEW);
    }

    if (toSkip.length > 0) {
      pipelineLog(`Auto-skipping: ${toSkip.join(', ')} (inferred from feature description)`);
    }

    return toSkip;
  }

  // ── Analysis loaders ──────────────────────────────────────────────────────

  private loadProjectAnalysis(): string | null {
    const analysisPath = path.join(
      this.projectContext.getProject().rootPath,
      '.cdm',
      'analysis',
      'overview.md',
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
      'analysis',
      'codestyle.md',
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

  getTransitionEngine(): TransitionEngine {
    return this.transitionEngine;
  }
}
