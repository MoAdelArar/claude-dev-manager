import * as fs from 'node:fs';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import {
  type Feature,
  AgentRole,
  FeatureStatus,
  type ExecutionPlan,
  type PipelineResult,
} from '../types';
import { AgentRegistry, type ProjectContext as AgentProjectContext } from '../agents/index';
import { type ArtifactStore } from '../workspace/artifact-store';
import { type ProjectContext } from './context';
import { ClaudeCodeBridge, type ClaudeCodeOptions } from './claude-code-bridge';
import { DevelopmentTracker } from '../tracker/development-tracker';
import { pipelineLog, agentLog } from '../utils/logger';
import { type CDMConfig } from '../utils/config';
import { PipelineExecutor, type ExecutorOptions } from '../pipeline/executor';
import { SkillRegistry } from '../skills/base-skill';
import { loadBuiltInSkills } from '../skills/index';
import {
  getTemplateOrThrow,
  matchTemplate,
  getAllTemplates,
  type PipelineTemplate,
} from '../pipeline/templates';
import type { PlannerAgent } from '../agents/planner';

export interface StreamingCallbacks {
  onAgentOutput?: (agent: AgentRole, line: string) => void;
  onFileCreated?: (path: string) => void;
  onFileModified?: (path: string, linesChanged: number) => void;
  onTestResult?: (passed: number, failed: number, total: number) => void;
  onProgress?: (percent: number, message: string) => void;
}

export interface PipelineOptions {
  skipSteps?: string[];
  template?: string;
  maxRetries: number;
  dryRun: boolean;
  interactive: boolean;
  startFromStep?: number;
  onStepStart?: (step: { index: number; description: string }) => void;
  onStepComplete?: (step: { index: number; description: string }) => void;
  onAgentWork?: (role: AgentRole, task: unknown) => void;
  onError?: (stepIndex: number, error: Error) => void;
  streaming?: StreamingCallbacks;
}

export class PipelineOrchestrator {
  private agentRegistry: AgentRegistry;
  private artifactStore: ArtifactStore;
  private skillRegistry: SkillRegistry;
  private projectContext: ProjectContext;
  private bridge: ClaudeCodeBridge;
  private executor: PipelineExecutor;
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

    this.skillRegistry = new SkillRegistry();
    loadBuiltInSkills(this.skillRegistry);

    this.agentRegistry = new AgentRegistry(artifactStore, this.skillRegistry);

    const project = projectContext.getProject();

    const agentContext: AgentProjectContext = {
      language: project.config.language,
      framework: project.config.framework,
      testFramework: project.config.testFramework,
      buildTool: project.config.buildTool,
      cloudProvider: project.config.cloudProvider,
      projectName: project.name,
      customInstructions: project.config.customInstructions,
    };
    this.agentRegistry.setProjectContext(agentContext);

    this.bridge = new ClaudeCodeBridge(this.agentRegistry, this.artifactStore, {
      projectPath: project.rootPath,
      ...bridgeOptions,
    });

    this.executor = new PipelineExecutor(
      this.agentRegistry,
      this.artifactStore,
      this.skillRegistry,
      this.bridge,
      config,
      project.rootPath,
    );

    this.tracker = new DevelopmentTracker(project.rootPath, project.id, project.name);
    this.projectAnalysis = this.loadProjectAnalysis();
    this.codeStyleProfile = this.loadCodeStyleProfile();
    this.entityFiles = this.loadEntityFiles();
  }

  async runFeaturePipeline(
    feature: Feature,
    options: PipelineOptions,
  ): Promise<PipelineResult> {
    const _startTime = Date.now();

    pipelineLog(`Starting pipeline for feature: ${feature.name}`);
    const modeReason = this.bridge.isNestedClaudeSession()
      ? 'parent session detected — agents will run as fresh Claude CLI instances'
      : this.bridge.isClaudeAvailable()
        ? 'Claude CLI available'
        : 'Claude CLI not found — using simulation';
    pipelineLog(`Execution mode: ${this.bridge.getExecutionMode()} (${modeReason})`);

    this.tracker.recordPipelineStarted(feature.id, feature.name, this.bridge.getExecutionMode());

    this.projectContext.updateFeature(feature.id, {
      status: FeatureStatus.IN_PROGRESS,
    });

    let plan: ExecutionPlan;

    if (options.template) {
      const template = getTemplateOrThrow(options.template);
      plan = this.createPlanFromTemplate(template, feature);
      pipelineLog(`Using template: ${options.template}`);
    } else {
      plan = await this.generateExecutionPlan(feature, options);
      pipelineLog(`Generated plan: ${plan.templateId} (${plan.steps.length} steps)`);
    }

    feature.executionPlan = plan;

    const explicitSkips = options.skipSteps
      ?.map(s => parseInt(s.replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n)) ?? [];

    const startFromSkips = options.startFromStep
      ? plan.steps
          .filter(step => step.index < options.startFromStep!)
          .map(step => step.index)
      : [];

    const skipStepIndices = [...new Set([...explicitSkips, ...startFromSkips])];

    const executorOptions: ExecutorOptions = {
      maxRetries: options.maxRetries,
      dryRun: options.dryRun,
      skipSteps: skipStepIndices.length > 0 ? skipStepIndices : undefined,
      onStepStart: (step) => {
        options.onStepStart?.({ index: step.index, description: step.description });
        this.tracker.recordStepStarted(feature.id, `step-${step.index}`, step.agent);
      },
      onStepComplete: (step, result) => {
        options.onStepComplete?.({ index: step.index, description: step.description });

        for (const artifact of result.artifacts) {
          this.tracker.recordArtifactProduced(
            feature.id,
            `step-${step.index}`,
            artifact.name,
            artifact.type,
            artifact.createdBy,
          );
        }
        for (const issue of result.issues) {
          this.tracker.recordIssueFound(
            feature.id,
            `step-${step.index}`,
            issue.title,
            issue.severity,
            issue.reportedBy,
          );
        }
      },
      onError: (step, error) => {
        options.onError?.(step.index, error);
      },
    };

    const result = await this.executor.executePlan(plan, feature, executorOptions);

    result.executionMode = this.bridge.getExecutionMode();

    if (result.success) {
      this.projectContext.completeFeature(feature.id);
      this.tracker.recordPipelineCompleted(
        feature.id,
        feature.name,
        result.totalDurationMs,
        result.totalTokensUsed,
        result.artifacts.length,
        result.issues.length,
      );
      pipelineLog(`Pipeline completed successfully for feature: ${feature.name}`);
    } else {
      this.projectContext.updateFeature(feature.id, {
        status: FeatureStatus.ON_HOLD,
      });
      const failedSteps = result.stepsFailed.map(i => `step-${i}`).join(', ');
      this.tracker.recordPipelineFailed(feature.id, feature.name, failedSteps);
      pipelineLog(`Pipeline failed at step(s): ${result.stepsFailed.join(', ')}`);
    }

    this.tracker.saveHistory();
    return result;
  }

  private async generateExecutionPlan(
    feature: Feature,
    _options: PipelineOptions,
  ): Promise<ExecutionPlan> {
    const match = matchTemplate(feature.description);

    if (match.confidence >= 0.85) {
      pipelineLog(`Fast mode: matched template "${match.template.id}" (${match.reason})`);
      return this.createPlanFromTemplate(match.template, feature);
    }

    const plannerAgent = this.agentRegistry.getAgent(
      AgentRole.PLANNER,
      ['requirements-analysis', 'task-decomposition'],
    ) as PlannerAgent;

    const taskType = plannerAgent.classifyTask(feature.description);
    const plan = plannerAgent.generateExecutionPlan(taskType, feature.description, feature.id);

    agentLog(AgentRole.PLANNER, `Generated ${plan.steps.length}-step plan for ${taskType}`, 'planning');

    return plan;
  }

  private createPlanFromTemplate(template: PipelineTemplate, _feature: Feature): ExecutionPlan {
    return {
      id: uuidv4(),
      taskType: template.id,
      templateId: template.id,
      steps: [...template.steps],
      reasoning: template.applicableWhen,
    };
  }

  getAvailableTemplates(): Array<{ id: string; name: string; description: string; steps: number }> {
    return getAllTemplates().map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      steps: t.steps.length,
    }));
  }

  getSkillRegistry(): SkillRegistry {
    return this.skillRegistry;
  }

  private loadEntityFiles(): Map<string, string> {
    const analysisDir = path.join(
      this.projectContext.getProject().rootPath,
      '.cdm',
      'analysis',
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

  canResume(feature: Feature): boolean {
    return this.executor.canResume(feature);
  }

  getLastCompletedStep(feature: Feature): number {
    return this.executor.getLastCompletedStep(feature);
  }

  loadResumeState(feature: Feature): ExecutionPlan | null {
    return this.executor.loadResumeState(feature);
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

  getExecutor(): PipelineExecutor {
    return this.executor;
  }
}
