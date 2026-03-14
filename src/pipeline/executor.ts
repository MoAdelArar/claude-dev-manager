import * as fs from 'node:fs';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import {
  type ExecutionPlan,
  type ExecutionStep,
  type StepResult,
  StepStatus,
  type Feature,
  type Artifact,
  type Issue,
  type AgentTask,
  AgentStatus,
  MessagePriority,
  IssueSeverity,
  type PipelineResult,
} from '../types';
import { type AgentRegistry } from '../agents/index';
import { type ArtifactStore } from '../workspace/artifact-store';
import { type SkillRegistry } from '../skills/base-skill';
import { type ClaudeCodeBridge } from '../orchestrator/claude-code-bridge';
import { type CDMConfig } from '../utils/config';
import logger, { pipelineLog, agentLog } from '../utils/logger';

export interface ExecutorOptions {
  maxRetries: number;
  dryRun: boolean;
  skipSteps?: number[];
  onStepStart?: (step: ExecutionStep) => void;
  onStepComplete?: (step: ExecutionStep, result: StepResult) => void;
  onError?: (step: ExecutionStep, error: Error) => void;
}

export class PipelineExecutor {
  private agentRegistry: AgentRegistry;
  private artifactStore: ArtifactStore;
  private skillRegistry: SkillRegistry;
  private bridge: ClaudeCodeBridge;
  private config: CDMConfig;
  private projectPath: string;

  constructor(
    agentRegistry: AgentRegistry,
    artifactStore: ArtifactStore,
    skillRegistry: SkillRegistry,
    bridge: ClaudeCodeBridge,
    config: CDMConfig,
    projectPath: string,
  ) {
    this.agentRegistry = agentRegistry;
    this.artifactStore = artifactStore;
    this.skillRegistry = skillRegistry;
    this.bridge = bridge;
    this.config = config;
    this.projectPath = projectPath;
  }

  async executePlan(
    plan: ExecutionPlan,
    feature: Feature,
    options: ExecutorOptions,
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const result: PipelineResult = {
      featureId: feature.id,
      success: false,
      templateUsed: plan.templateId,
      stepsCompleted: [],
      stepsFailed: [],
      stepsSkipped: [],
      totalTokensUsed: 0,
      totalDurationMs: 0,
      artifacts: [],
      issues: [],
      executionMode: this.bridge.getExecutionMode(),
    };

    pipelineLog(`Starting execution plan: ${plan.templateId} (${plan.steps.length} steps)`);
    pipelineLog(`Execution mode: ${result.executionMode}`);

    if (options.dryRun) {
      pipelineLog('DRY RUN: No actual execution will occur');
      this.printPlanSummary(plan);
      result.success = true;
      return result;
    }

    const completedSteps = new Set<number>();
    const skipSteps = new Set(options.skipSteps || []);

    for (const step of plan.steps) {
      if (skipSteps.has(step.index) && step.canSkip) {
        pipelineLog(`Skipping step ${step.index}: ${step.description}`);
        result.stepsSkipped.push(step.index);
        completedSteps.add(step.index);
        continue;
      }

      if (step.dependsOn && step.dependsOn.length > 0) {
        const unmetDeps = step.dependsOn.filter((dep) => !completedSteps.has(dep));
        if (unmetDeps.length > 0) {
          pipelineLog(`Step ${step.index} waiting for dependencies: ${unmetDeps.join(', ')}`);
          continue;
        }
      }

      options.onStepStart?.(step);

      let stepResult: StepResult | null = null;
      let retryCount = 0;
      const maxRetries = options.maxRetries;

      while (retryCount <= maxRetries) {
        try {
          stepResult = await this.executeStep(step, feature, result.artifacts);

          if (stepResult.status === StepStatus.COMPLETED) {
            break;
          }

          if (stepResult.status === StepStatus.FAILED) {
            retryCount++;
            if (retryCount <= maxRetries) {
              pipelineLog(`Step ${step.index} failed, retry ${retryCount}/${maxRetries}`);
            }
          }
        } catch (error) {
          retryCount++;
          const err = error instanceof Error ? error : new Error(String(error));
          options.onError?.(step, err);
          pipelineLog(`Step ${step.index} error: ${err.message}, retry ${retryCount}/${maxRetries}`, 'error');

          if (retryCount > maxRetries) {
            stepResult = this.createFailedStepResult(step, err);
          }
        }
      }

      if (!stepResult) {
        stepResult = this.createFailedStepResult(step, new Error('Step produced no result'));
      }

      feature.stepResults.set(step.index, stepResult);
      result.totalTokensUsed += stepResult.tokensUsed;
      result.artifacts.push(...stepResult.artifacts);
      result.issues.push(...stepResult.issues);

      this.persistState(feature, plan);

      options.onStepComplete?.(step, stepResult);

      if (stepResult.status === StepStatus.COMPLETED) {
        result.stepsCompleted.push(step.index);
        completedSteps.add(step.index);
        pipelineLog(`Step ${step.index} completed: ${step.description}`);
      } else {
        result.stepsFailed.push(step.index);
        pipelineLog(`Step ${step.index} failed: ${step.description}`, 'error');
        break;
      }

      if (step.gateCondition) {
        const gatePassed = this.evaluateGateCondition(step.gateCondition, stepResult);
        if (!gatePassed) {
          pipelineLog(`Gate condition failed for step ${step.index}: ${step.gateCondition}`, 'error');
          result.stepsFailed.push(step.index);
          break;
        }
      }
    }

    result.totalDurationMs = Date.now() - startTime;
    result.success = result.stepsFailed.length === 0;

    if (result.success) {
      pipelineLog(`Execution plan completed successfully (${result.stepsCompleted.length} steps)`);
    } else {
      pipelineLog(`Execution plan failed at step(s): ${result.stepsFailed.join(', ')}`, 'error');
    }

    return result;
  }

  async executeStep(
    step: ExecutionStep,
    feature: Feature,
    previousArtifacts: Artifact[],
  ): Promise<StepResult> {
    const startTime = Date.now();

    pipelineLog(`Executing step ${step.index}: ${step.agent} [${step.skills.join(', ')}]`);

    const agent = this.agentRegistry.getAgent(step.agent, step.skills);

    const inputArtifacts = this.gatherInputArtifacts(step, previousArtifacts);

    const task = this.createAgentTask(feature, step, inputArtifacts);

    agentLog(step.agent, `Starting: ${step.description}`, `step-${step.index}`);

    const agentResult = await this.bridge.executeAgentTask(task);

    const stepResult: StepResult = {
      stepIndex: step.index,
      agent: step.agent,
      skills: step.skills,
      status: agentResult.status === 'success' ? StepStatus.COMPLETED : StepStatus.FAILED,
      startedAt: new Date(startTime),
      completedAt: new Date(),
      artifacts: agentResult.artifacts,
      issues: agentResult.issues,
      tokensUsed: agentResult.tokensUsed,
      durationMs: Date.now() - startTime,
    };

    for (const artifact of stepResult.artifacts) {
      this.artifactStore.store(artifact);
    }

    agentLog(step.agent, `Completed: ${stepResult.artifacts.length} artifacts, ${stepResult.issues.length} issues`, `step-${step.index}`);

    return stepResult;
  }

  private createAgentTask(
    feature: Feature,
    step: ExecutionStep,
    inputArtifacts: Artifact[],
  ): AgentTask {
    const expectedOutputs = this.skillRegistry.getExpectedArtifacts(step.skills);

    return {
      id: uuidv4(),
      featureId: feature.id,
      step: `step-${step.index}`,
      stepIndex: step.index,
      assignedTo: step.agent,
      activeSkills: step.skills,
      title: `Step ${step.index}: ${step.description}`,
      description: `${step.description}\n\nFeature: ${feature.name}\nDescription: ${feature.description}`,
      instructions: this.buildStepInstructions(step, feature),
      inputArtifacts,
      expectedOutputs,
      constraints: this.getStepConstraints(step),
      priority: MessagePriority.HIGH,
      status: AgentStatus.IDLE,
      createdAt: new Date(),
    };
  }

  private buildStepInstructions(step: ExecutionStep, feature: Feature): string {
    const instructions: string[] = [];

    instructions.push(`Feature: "${feature.name}"`);
    if (feature.description !== feature.name) {
      instructions.push(`Description: ${feature.description}`);
    }

    instructions.push(`\nStep ${step.index}: ${step.description}`);
    instructions.push(`Agent: ${step.agent}`);
    instructions.push(`Skills: ${step.skills.join(', ')}`);

    if (step.dependsOn && step.dependsOn.length > 0) {
      instructions.push(`\nThis step builds on work from step(s): ${step.dependsOn.join(', ')}`);
    }

    if (step.gateCondition) {
      instructions.push(`\nGate condition: ${step.gateCondition}`);
    }

    return instructions.join('\n');
  }

  private getStepConstraints(step: ExecutionStep): string[] {
    const constraints: string[] = [
      'Follow project coding standards and conventions',
      'Produce all expected output artifacts',
      'Report any issues or concerns',
    ];

    if (step.skills.includes('code-implementation')) {
      constraints.push('Write production-quality code');
      constraints.push('Handle errors gracefully');
    }

    if (step.skills.includes('security-audit')) {
      constraints.push('Check against OWASP Top 10');
      constraints.push('Report vulnerabilities with severity ratings');
    }

    return constraints;
  }

  private gatherInputArtifacts(step: ExecutionStep, previousArtifacts: Artifact[]): Artifact[] {
    const requiredTypes = this.skillRegistry.getRequiredInputArtifacts(step.skills);

    if (requiredTypes.length === 0) {
      return previousArtifacts.slice(-5);
    }

    const artifacts: Artifact[] = [];
    for (const type of requiredTypes) {
      const artifact = previousArtifacts.find((a) => a.type === type) ||
        this.artifactStore.getByType(type)[0];
      if (artifact) {
        artifacts.push(artifact);
      }
    }

    return artifacts;
  }

  private evaluateGateCondition(condition: string, stepResult: StepResult): boolean {
    if (condition.startsWith('hasArtifact:')) {
      const artifactType = condition.replace('hasArtifact:', '');
      return stepResult.artifacts.some((a) => a.type === artifactType);
    }

    if (condition === 'noCriticalIssues') {
      return !stepResult.issues.some((i) => i.severity === IssueSeverity.CRITICAL);
    }

    if (condition === 'noHighIssues') {
      return !stepResult.issues.some(
        (i) => i.severity === IssueSeverity.CRITICAL || i.severity === IssueSeverity.HIGH,
      );
    }

    return true;
  }

  private createFailedStepResult(step: ExecutionStep, error: Error): StepResult {
    return {
      stepIndex: step.index,
      agent: step.agent,
      skills: step.skills,
      status: StepStatus.FAILED,
      startedAt: new Date(),
      completedAt: new Date(),
      artifacts: [],
      issues: [],
      tokensUsed: 0,
      durationMs: 0,
    };
  }

  private persistState(feature: Feature, plan: ExecutionPlan): void {
    const stateDir = path.join(this.projectPath, '.cdm', 'features', feature.id);

    try {
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
      }

      const state = {
        featureId: feature.id,
        featureName: feature.name,
        executionPlan: plan,
        stepResults: Object.fromEntries(feature.stepResults),
        currentStepIndex: Math.max(...Array.from(feature.stepResults.keys()), -1) + 1,
        updatedAt: new Date().toISOString(),
      };

      fs.writeFileSync(
        path.join(stateDir, 'state.json'),
        JSON.stringify(state, null, 2),
      );
    } catch (error) {
      logger.warn(`Failed to persist state: ${error}`);
    }
  }

  private printPlanSummary(plan: ExecutionPlan): void {
    pipelineLog('--- Execution Plan Summary ---');
    pipelineLog(`Template: ${plan.templateId}`);
    pipelineLog(`Task Type: ${plan.taskType}`);
    pipelineLog(`Reasoning: ${plan.reasoning}`);
    pipelineLog('Steps:');

    for (const step of plan.steps) {
      const deps = step.dependsOn?.length ? ` (depends on: ${step.dependsOn.join(', ')})` : '';
      const skip = step.canSkip ? ' [skippable]' : '';
      pipelineLog(`  ${step.index}. ${step.agent} [${step.skills.join(', ')}]${deps}${skip}`);
      pipelineLog(`     ${step.description}`);
    }

    pipelineLog('--- End Summary ---');
  }

  canResume(feature: Feature): boolean {
    const stateFile = path.join(
      this.projectPath,
      '.cdm',
      'features',
      feature.id,
      'state.json',
    );
    return fs.existsSync(stateFile);
  }

  loadResumeState(feature: Feature): ExecutionPlan | null {
    const stateFile = path.join(
      this.projectPath,
      '.cdm',
      'features',
      feature.id,
      'state.json',
    );

    if (!fs.existsSync(stateFile)) {
      return null;
    }

    try {
      const content = fs.readFileSync(stateFile, 'utf-8');
      const state = JSON.parse(content);
      return state.executionPlan as ExecutionPlan;
    } catch {
      return null;
    }
  }

  getLastCompletedStep(feature: Feature): number {
    if (feature.stepResults.size === 0) {
      return -1;
    }

    let lastCompleted = -1;
    for (const [index, result] of feature.stepResults) {
      if (result.status === StepStatus.COMPLETED && index > lastCompleted) {
        lastCompleted = index;
      }
    }
    return lastCompleted;
  }
}
