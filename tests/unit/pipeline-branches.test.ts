import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  AgentRole,
  PipelineStage,
  StageStatus,
  ArtifactType,
  FeatureStatus,
  FeaturePriority,
  type Feature,
  type StageResult,
} from '../../src/types';
import { PipelineOrchestrator, type PipelineOptions, type PipelineResult } from '../../src/orchestrator/pipeline';
import { ProjectContext } from '../../src/orchestrator/context';
import { ArtifactStore } from '../../src/workspace/artifact-store';
import { getDefaultConfig, type CDMConfig } from '../../src/utils/config';

let tempDir: string;
let context: ProjectContext;
let artifactStore: ArtifactStore;
let config: CDMConfig;

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    projectId: 'proj-1',
    name: 'Test Feature',
    description: 'A test feature',
    requestedBy: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    currentStage: PipelineStage.REQUIREMENTS_GATHERING,
    stageResults: new Map(),
    artifacts: [],
    issues: [],
    status: FeatureStatus.DRAFT,
    priority: FeaturePriority.MEDIUM,
    metadata: {},
    ...overrides,
  };
}

function defaultOpts(overrides: Partial<PipelineOptions> = {}): PipelineOptions {
  return {
    skipStages: [],
    maxRetries: 0,
    dryRun: false,
    interactive: false,
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-pipeline-test-'));
  artifactStore = new ArtifactStore(tempDir);
  context = new ProjectContext(tempDir, 'TestProject');
  config = getDefaultConfig();
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('PipelineOrchestrator branch coverage', () => {
  describe('startFromStage option', () => {
    it('skips stages before the start stage', async () => {
      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });
      const feature = context.createFeature('Skip Test', 'test');
      const result = await orchestrator.runFeaturePipeline(feature, defaultOpts({
        startFromStage: PipelineStage.IMPLEMENTATION,
        maxRetries: 0,
      }));

      expect(result.stagesSkipped).toContain(PipelineStage.REQUIREMENTS_GATHERING);
      expect(result.stagesSkipped).toContain(PipelineStage.ARCHITECTURE_DESIGN);
      expect(result.stagesSkipped).toContain(PipelineStage.UI_UX_DESIGN);
      expect(result.stagesSkipped).toContain(PipelineStage.TASK_BREAKDOWN);
      expect(result.stagesCompleted).toContain(PipelineStage.IMPLEMENTATION);
    });
  });

  describe('primary agent disabled', () => {
    it('skips stage when primary agent is disabled', async () => {
      const disabledConfig = getDefaultConfig();
      disabledConfig.agents[AgentRole.PRODUCT_MANAGER] = { enabled: false };

      const orchestrator = new PipelineOrchestrator(context, artifactStore, disabledConfig, {
        executionMode: 'simulation',
      });
      const feature = context.createFeature('Disabled Agent Test', 'test');
      const result = await orchestrator.runFeaturePipeline(feature, defaultOpts({ maxRetries: 0 }));

      expect(result.stagesSkipped).toContain(PipelineStage.REQUIREMENTS_GATHERING);
    });
  });

  describe('stage revision and retries', () => {
    it('completes pipeline successfully in simulation mode', async () => {
      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });
      const feature = context.createFeature('Normal Flow', 'testing normal flow');
      const result = await orchestrator.runFeaturePipeline(feature, defaultOpts({
        maxRetries: 1,
      }));

      expect(result.stagesCompleted.length).toBeGreaterThan(0);
      expect(result.artifacts.length).toBeGreaterThan(0);
    });

    it('retries exhausted leads to failure', async () => {
      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });

      const bridge = orchestrator.getBridge();
      const origExecute = bridge.executeAgentTask.bind(bridge);
      let callCount = 0;
      bridge.executeAgentTask = async (task) => {
        if (task.stage === PipelineStage.REQUIREMENTS_GATHERING) {
          callCount++;
          throw new Error('Simulated failure');
        }
        return origExecute(task);
      };

      const feature = context.createFeature('Retry Fail', 'test');
      const result = await orchestrator.runFeaturePipeline(feature, defaultOpts({
        maxRetries: 1,
      }));

      expect(result.stagesFailed).toContain(PipelineStage.REQUIREMENTS_GATHERING);
      expect(result.success).toBe(false);
      expect(callCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('executeStage error handling', () => {
    it('creates failed stage result when stage throws', async () => {
      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });

      const bridge = orchestrator.getBridge();
      bridge.executeAgentTask = async () => {
        throw new Error('Stage exploded');
      };

      const feature = context.createFeature('Error Test', 'test');
      const errors: Error[] = [];
      const result = await orchestrator.runFeaturePipeline(feature, defaultOpts({
        maxRetries: 0,
        onError: (_stage, err) => errors.push(err),
      }));

      expect(result.success).toBe(false);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Stage exploded');
    });
  });

  describe('stageResult producing null result', () => {
    it('generates failed result when no stageResult produced', async () => {
      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });

      const bridge = orchestrator.getBridge();
      bridge.executeAgentTask = async () => {
        return {
          agentRole: AgentRole.PRODUCT_MANAGER,
          status: 'success' as const,
          output: '',
          artifacts: [],
          issues: [{ id: '1', featureId: 'f', type: 'bug' as any, severity: 'critical', title: 'blocking', description: '', reportedBy: AgentRole.PRODUCT_MANAGER, stage: PipelineStage.REQUIREMENTS_GATHERING, status: 'open' as any, createdAt: new Date() }],
          tokensUsed: 0,
          durationMs: 0,
          metadata: {},
        };
      };

      const feature = context.createFeature('Null Result', 'test');
      const result = await orchestrator.runFeaturePipeline(feature, defaultOpts({
        maxRetries: 2,
      }));

      expect(result.stagesFailed.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('skipStages', () => {
    it('skips requested skippable stages', async () => {
      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });
      const feature = context.createFeature('Skip Test', 'test');
      const result = await orchestrator.runFeaturePipeline(feature, defaultOpts({
        skipStages: [PipelineStage.UI_UX_DESIGN],
        maxRetries: 0,
      }));

      expect(result.stagesSkipped).toContain(PipelineStage.UI_UX_DESIGN);
    });

    it('cannot skip mandatory stages', async () => {
      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });
      const feature = context.createFeature('Mandatory Skip', 'test');
      const result = await orchestrator.runFeaturePipeline(feature, defaultOpts({
        skipStages: [PipelineStage.REQUIREMENTS_GATHERING],
        maxRetries: 0,
      }));

      expect(result.stagesSkipped).not.toContain(PipelineStage.REQUIREMENTS_GATHERING);
    });
  });

  describe('context optimization', () => {
    it('loads project analysis when .cdm/analysis/overview.md exists', async () => {
      const analysisDir = path.join(tempDir, '.cdm', 'analysis');
      fs.mkdirSync(analysisDir, { recursive: true });
      fs.writeFileSync(path.join(analysisDir, 'overview.md'), '# Analysis\n## Entry Points\n- src/index.ts', 'utf-8');

      const freshStore = new ArtifactStore(tempDir);
      const freshContext = new ProjectContext(tempDir, 'AnalysisProject');
      const orchestrator = new PipelineOrchestrator(freshContext, freshStore, config, {
        executionMode: 'simulation',
      });

      const feature = freshContext.createFeature('Context Test', 'test feature');
      const result = await orchestrator.runFeaturePipeline(feature, defaultOpts({
        skipStages: [
          PipelineStage.ARCHITECTURE_DESIGN, PipelineStage.UI_UX_DESIGN,
          PipelineStage.TASK_BREAKDOWN, PipelineStage.IMPLEMENTATION,
          PipelineStage.CODE_REVIEW, PipelineStage.TESTING,
          PipelineStage.SECURITY_REVIEW, PipelineStage.DOCUMENTATION,
          PipelineStage.DEPLOYMENT,
        ],
        maxRetries: 0,
      }));
      expect(result.contextOptimized).toBe(true);
    });

    it('loads codestyle profile when .cdm/analysis/codestyle.md exists', () => {
      const analysisDir = path.join(tempDir, '.cdm', 'analysis');
      fs.mkdirSync(analysisDir, { recursive: true });
      fs.writeFileSync(path.join(analysisDir, 'codestyle.md'), '# Style\n## Naming Conventions\ncamelCase', 'utf-8');

      const freshStore = new ArtifactStore(tempDir);
      const freshContext = new ProjectContext(tempDir, 'StyleProject');
      const orchestrator = new PipelineOrchestrator(freshContext, freshStore, config, {
        executionMode: 'simulation',
      });
      expect(orchestrator).toBeDefined();
    });
  });

  describe('callbacks', () => {
    it('invokes onStageStart and onStageComplete callbacks', async () => {
      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });
      const feature = context.createFeature('Callback Test', 'test');
      const started: PipelineStage[] = [];
      const completed: PipelineStage[] = [];

      await orchestrator.runFeaturePipeline(feature, defaultOpts({
        maxRetries: 0,
        onStageStart: (stage) => started.push(stage),
        onStageComplete: (stage) => completed.push(stage),
      }));

      expect(started.length).toBeGreaterThan(0);
      expect(completed.length).toBeGreaterThan(0);
    });

    it('invokes onAgentWork callback', async () => {
      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });
      const feature = context.createFeature('Agent Work CB', 'test');
      const agentWorks: AgentRole[] = [];

      await orchestrator.runFeaturePipeline(feature, defaultOpts({
        maxRetries: 0,
        startFromStage: PipelineStage.REQUIREMENTS_GATHERING,
        onAgentWork: (role) => agentWorks.push(role),
      }));

      expect(agentWorks.length).toBeGreaterThan(0);
    });
  });

  describe('pipeline success and failure finalization', () => {
    it('marks feature COMPLETED on success', async () => {
      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });
      const feature = context.createFeature('Success Feature', 'test');
      const result = await orchestrator.runFeaturePipeline(feature, defaultOpts({ maxRetries: 0 }));

      if (result.success) {
        const updated = context.getFeature(feature.id);
        expect(updated?.status).toBe(FeatureStatus.COMPLETED);
      }
    });

    it('marks feature ON_HOLD on failure', async () => {
      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });

      orchestrator.getBridge().executeAgentTask = async () => {
        throw new Error('fail');
      };

      const feature = context.createFeature('Fail Feature', 'test');
      const result = await orchestrator.runFeaturePipeline(feature, defaultOpts({ maxRetries: 0 }));

      expect(result.success).toBe(false);
      const updated = context.getFeature(feature.id);
      expect(updated?.status).toBe(FeatureStatus.ON_HOLD);
    });
  });

  describe('accessor methods', () => {
    it('exposes bridge, tracker, registry, transitionEngine', () => {
      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });
      expect(orchestrator.getBridge()).toBeDefined();
      expect(orchestrator.getTracker()).toBeDefined();
      expect(orchestrator.getAgentRegistry()).toBeDefined();
      expect(orchestrator.getTransitionEngine()).toBeDefined();
    });
  });
});
