import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  PipelineStage,
  FeaturePriority,
  FeatureStatus,
  StageStatus,
  AgentRole,
  ArtifactType,
} from '../../src/types';
import { ProjectContext } from '../../src/orchestrator/context';
import { PipelineOrchestrator, PipelineOptions, PipelineResult } from '../../src/orchestrator/pipeline';
import { ClaudeCodeBridge } from '../../src/orchestrator/claude-code-bridge';
import { ArtifactStore } from '../../src/workspace/artifact-store';
import { AgentRegistry } from '../../src/agents/index';
import { loadConfig, saveConfig, getDefaultConfig } from '../../src/utils/config';

function createTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-pipe-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'test-project', version: '1.0.0' }),
    'utf-8',
  );
  return dir;
}

function cleanDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function buildPipelineOptions(overrides: Partial<PipelineOptions> = {}): PipelineOptions {
  return {
    skipStages: [],
    maxRetries: 1,
    dryRun: false,
    interactive: false,
    ...overrides,
  };
}

// ─── Full Pipeline Execution ────────────────────────────────────────────────

describe('Pipeline Orchestrator — E2E', () => {
  let projectDir: string;
  let context: ProjectContext;
  let artifactStore: ArtifactStore;
  let config: ReturnType<typeof getDefaultConfig>;

  beforeEach(() => {
    projectDir = createTempProject();
    context = new ProjectContext(projectDir);
    artifactStore = new ArtifactStore(projectDir);
    config = getDefaultConfig();
  });

  afterEach(() => {
    cleanDir(projectDir);
  });

  describe('full pipeline run in simulation mode', () => {
    it('should execute all stages and produce a successful result', async () => {
      const feature = context.createFeature(
        'User authentication system',
        'Build a complete user auth system with login, registration, and password reset',
        FeaturePriority.HIGH,
      );

      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });

      const stagesVisited: PipelineStage[] = [];
      const agentsUsed: AgentRole[] = [];

      const options = buildPipelineOptions({
        onStageStart: (stage) => stagesVisited.push(stage),
        onAgentWork: (role) => agentsUsed.push(role),
      });

      const result = await orchestrator.runFeaturePipeline(feature, options);

      expect(result.featureId).toBe(feature.id);
      expect(result.success).toBe(true);
      expect(result.stagesFailed).toHaveLength(0);
      expect(result.stagesCompleted.length).toBeGreaterThanOrEqual(6);
      expect(result.artifacts.length).toBeGreaterThan(0);
      expect(result.totalTokensUsed).toBeGreaterThan(0);
      expect(result.totalDurationMs).toBeGreaterThan(0);
      expect(result.executionMode).toBe('simulation');

      expect(stagesVisited).toContain(PipelineStage.REQUIREMENTS_GATHERING);
      expect(stagesVisited).toContain(PipelineStage.ARCHITECTURE_DESIGN);
      expect(stagesVisited).toContain(PipelineStage.IMPLEMENTATION);

      expect(agentsUsed).toContain(AgentRole.PRODUCT_MANAGER);
      expect(agentsUsed).toContain(AgentRole.SYSTEM_ARCHITECT);
      expect(agentsUsed).toContain(AgentRole.SENIOR_DEVELOPER);
    }, 120_000);

    it('should skip optional stages when requested', async () => {
      const feature = context.createFeature('Skip test', 'Feature to test skipping stages');

      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });

      const options = buildPipelineOptions({
        skipStages: [
          PipelineStage.UI_UX_DESIGN,
          PipelineStage.SECURITY_REVIEW,
          PipelineStage.DOCUMENTATION,
          PipelineStage.DEPLOYMENT,
        ],
      });

      const result = await orchestrator.runFeaturePipeline(feature, options);

      expect(result.stagesSkipped).toContain(PipelineStage.UI_UX_DESIGN);
      expect(result.stagesSkipped).toContain(PipelineStage.SECURITY_REVIEW);
      expect(result.stagesCompleted).toContain(PipelineStage.REQUIREMENTS_GATHERING);
      expect(result.stagesCompleted).toContain(PipelineStage.IMPLEMENTATION);
    }, 120_000);

    it('should not skip mandatory stages even when requested', async () => {
      const feature = context.createFeature('Mandatory test', 'Test mandatory stages');

      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });

      const options = buildPipelineOptions({
        skipStages: [PipelineStage.REQUIREMENTS_GATHERING],
      });

      const result = await orchestrator.runFeaturePipeline(feature, options);

      expect(result.stagesSkipped).not.toContain(PipelineStage.REQUIREMENTS_GATHERING);
      expect(result.stagesCompleted).toContain(PipelineStage.REQUIREMENTS_GATHERING);
    }, 120_000);

    it('should update feature status through the pipeline', async () => {
      const feature = context.createFeature('Status tracking', 'Test status updates');
      expect(feature.status).toBe(FeatureStatus.DRAFT);

      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });

      const result = await orchestrator.runFeaturePipeline(feature, buildPipelineOptions());

      const updated = context.getFeature(feature.id);
      expect(updated).toBeDefined();

      if (result.success) {
        expect(updated!.status).toBe(FeatureStatus.COMPLETED);
        expect(updated!.currentStage).toBe(PipelineStage.COMPLETED);
      } else {
        expect(updated!.status).toBe(FeatureStatus.ON_HOLD);
      }
    }, 120_000);
  });

  // ── Pipeline resume from stage ────────────────────────────────────────────

  describe('pipeline resume (startFromStage)', () => {
    it('should skip stages before the startFromStage', async () => {
      const feature = context.createFeature('Resume test', 'Test pipeline resume');

      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });

      const result = await orchestrator.runFeaturePipeline(feature, buildPipelineOptions({
        startFromStage: PipelineStage.IMPLEMENTATION,
      }));

      expect(result.stagesSkipped).toContain(PipelineStage.REQUIREMENTS_GATHERING);
      expect(result.stagesSkipped).toContain(PipelineStage.ARCHITECTURE_DESIGN);
    }, 120_000);
  });

  // ── Agent disable via config ──────────────────────────────────────────────

  describe('agent enable/disable via config', () => {
    it('should skip stages when the primary agent is disabled', async () => {
      config.agents[AgentRole.UI_DESIGNER] = { enabled: false };
      config.agents[AgentRole.SECURITY_ENGINEER] = { enabled: false };
      config.agents[AgentRole.DEVOPS_ENGINEER] = { enabled: false };
      config.agents[AgentRole.DOCUMENTATION_WRITER] = { enabled: false };

      const feature = context.createFeature('Disabled agents', 'Test disabled agents');

      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });

      const result = await orchestrator.runFeaturePipeline(feature, buildPipelineOptions());

      expect(result.stagesSkipped).toContain(PipelineStage.UI_UX_DESIGN);
      expect(result.stagesSkipped).toContain(PipelineStage.SECURITY_REVIEW);
      expect(result.stagesSkipped).toContain(PipelineStage.DEPLOYMENT);
      expect(result.stagesSkipped).toContain(PipelineStage.DOCUMENTATION);
    }, 120_000);
  });

  // ── Pipeline callbacks ─────────────────────────────────────────────────────

  describe('pipeline callbacks', () => {
    it('should fire onStageStart and onStageComplete for every executed stage', async () => {
      const feature = context.createFeature('Callback test', 'Test callbacks');

      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, {
        executionMode: 'simulation',
      });

      const started: PipelineStage[] = [];
      const completed: PipelineStage[] = [];

      const result = await orchestrator.runFeaturePipeline(feature, buildPipelineOptions({
        onStageStart: (stage) => started.push(stage),
        onStageComplete: (stage) => completed.push(stage),
      }));

      expect(started.length).toBeGreaterThan(0);
      expect(completed.length).toBe(started.length);
      for (const stage of result.stagesCompleted) {
        expect(started).toContain(stage);
        expect(completed).toContain(stage);
      }
    }, 120_000);
  });
});

// ─── Project Context Persistence ────────────────────────────────────────────

describe('ProjectContext — E2E', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanDir(projectDir);
  });

  it('should persist project state to disk and reload it', () => {
    const ctx1 = new ProjectContext(projectDir, 'My Project');
    const project = ctx1.getProject();
    expect(project.name).toBe('My Project');

    const feature = ctx1.createFeature('Persisted feature', 'Test persistence');
    const featureId = feature.id;

    const ctx2 = new ProjectContext(projectDir);
    const reloaded = ctx2.getProject();
    expect(reloaded.name).toBe('My Project');
    expect(reloaded.id).toBe(project.id);

    const reloadedFeature = ctx2.getFeature(featureId);
    expect(reloadedFeature).toBeDefined();
    expect(reloadedFeature!.name).toBe('Persisted feature');
  });

  it('should track multiple features independently', () => {
    const ctx = new ProjectContext(projectDir);
    const f1 = ctx.createFeature('Feature One', 'First');
    const f2 = ctx.createFeature('Feature Two', 'Second');

    expect(ctx.getAllFeatures().length).toBe(2);
    expect(ctx.getFeature(f1.id)!.name).toBe('Feature One');
    expect(ctx.getFeature(f2.id)!.name).toBe('Feature Two');
  });

  it('should update feature stage correctly', () => {
    const ctx = new ProjectContext(projectDir);
    const feature = ctx.createFeature('Stage test', 'Test');
    expect(feature.currentStage).toBe(PipelineStage.REQUIREMENTS_GATHERING);

    ctx.updateFeatureStage(feature.id, PipelineStage.ARCHITECTURE_DESIGN);
    const updated = ctx.getFeature(feature.id)!;
    expect(updated.currentStage).toBe(PipelineStage.ARCHITECTURE_DESIGN);
    expect(updated.status).toBe(FeatureStatus.IN_PROGRESS);
  });

  it('should complete a feature', () => {
    const ctx = new ProjectContext(projectDir);
    const feature = ctx.createFeature('Complete test', 'Test');
    ctx.completeFeature(feature.id);

    const completed = ctx.getFeature(feature.id)!;
    expect(completed.status).toBe(FeatureStatus.COMPLETED);
    expect(completed.currentStage).toBe(PipelineStage.COMPLETED);
  });

  it('should detect project config from package.json', () => {
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-detect-'));
    try {
      fs.writeFileSync(
        path.join(freshDir, 'package.json'),
        JSON.stringify({
          name: 'react-app',
          dependencies: { react: '^18.0.0', next: '^14.0.0' },
          devDependencies: { vitest: '^1.0.0' },
        }),
        'utf-8',
      );

      const ctx = new ProjectContext(freshDir);
      const project = ctx.getProject();
      expect(project.config.language).toBe('javascript');
      expect(project.config.framework).toBe('react');
      expect(project.config.testFramework).toBe('vitest');
    } finally {
      fs.rmSync(freshDir, { recursive: true, force: true });
    }
  });
});

// ─── Artifact Store Persistence ─────────────────────────────────────────────

describe('ArtifactStore — E2E persistence', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanDir(projectDir);
  });

  it('should persist artifacts to disk and reload across instances', () => {
    const store1 = new ArtifactStore(projectDir);

    const artifact = store1.store({
      id: 'art-persist-1',
      type: ArtifactType.REQUIREMENTS_DOC,
      name: 'Persistent Requirement',
      description: 'This should survive reloads',
      filePath: 'docs/req.md',
      createdBy: AgentRole.PRODUCT_MANAGER,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      content: '# Requirements\n\nThis is a persistent requirement.',
      metadata: { test: true },
      status: 'draft' as any,
      reviewStatus: 'pending' as any,
    });

    const store2 = new ArtifactStore(projectDir);
    const reloaded = store2.get('art-persist-1');
    expect(reloaded).toBeDefined();
    expect(reloaded!.name).toBe('Persistent Requirement');
    expect(reloaded!.content).toContain('persistent requirement');
  });

  it('should support getById and getByName', () => {
    const store = new ArtifactStore(projectDir);
    store.store({
      id: 'art-find-1',
      type: ArtifactType.ARCHITECTURE_DOC,
      name: 'System Architecture',
      description: 'Main arch doc',
      filePath: 'docs/arch.md',
      createdBy: AgentRole.SYSTEM_ARCHITECT,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      content: '# Architecture',
      metadata: {},
      status: 'draft' as any,
      reviewStatus: 'pending' as any,
    });

    expect(store.getById('art-find-1')).toBeDefined();
    expect(store.getByName('System Architecture')).toBeDefined();
    expect(store.getByName('system arch')).toBeDefined();
    expect(store.getByName('nonexistent')).toBeUndefined();
  });

  it('should produce a correct summary', () => {
    const store = new ArtifactStore(projectDir);
    store.store({
      id: 'sum-1',
      type: ArtifactType.REQUIREMENTS_DOC,
      name: 'Req 1',
      description: '',
      filePath: '',
      createdBy: AgentRole.PRODUCT_MANAGER,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      content: 'content',
      metadata: {},
      status: 'draft' as any,
      reviewStatus: 'pending' as any,
    });
    store.store({
      id: 'sum-2',
      type: ArtifactType.SOURCE_CODE,
      name: 'Code 1',
      description: '',
      filePath: '',
      createdBy: AgentRole.SENIOR_DEVELOPER,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      content: 'code',
      metadata: {},
      status: 'approved' as any,
      reviewStatus: 'approved' as any,
    });

    const summary = store.getSummary();
    expect(summary.total).toBe(2);
    expect(summary.byType[ArtifactType.REQUIREMENTS_DOC]).toBe(1);
    expect(summary.byType[ArtifactType.SOURCE_CODE]).toBe(1);
    expect(summary.byStatus['draft']).toBe(1);
    expect(summary.byStatus['approved']).toBe(1);
  });
});

// ─── Claude Code Bridge ────────────────────────────────────────────────────

describe('ClaudeCodeBridge — E2E', () => {
  let projectDir: string;
  let artifactStore: ArtifactStore;
  let agentRegistry: AgentRegistry;

  beforeEach(() => {
    projectDir = createTempProject();
    artifactStore = new ArtifactStore(projectDir);
    agentRegistry = new AgentRegistry(artifactStore);
  });

  afterEach(() => {
    cleanDir(projectDir);
  });

  it('should fall back to simulation when claude CLI is not found', () => {
    const bridge = new ClaudeCodeBridge(agentRegistry, artifactStore, {
      projectPath: projectDir,
      executionMode: 'claude-cli',
      claudePath: '/nonexistent/claude-bin',
    });

    expect(bridge.isClaudeAvailable()).toBe(false);
  });

  it('should respect explicit simulation mode', () => {
    const bridge = new ClaudeCodeBridge(agentRegistry, artifactStore, {
      projectPath: projectDir,
      executionMode: 'simulation',
    });

    expect(bridge.getExecutionMode()).toBe('simulation');
  });

  it('should generate agent instruction files', () => {
    const bridge = new ClaudeCodeBridge(agentRegistry, artifactStore, {
      projectPath: projectDir,
    });

    bridge.writeAgentInstructionFiles();

    const agentsDir = path.join(projectDir, 'agents');
    expect(fs.existsSync(agentsDir)).toBe(true);
    const files = fs.readdirSync(agentsDir);
    expect(files.length).toBeGreaterThanOrEqual(11);

    const pmFile = files.find(f => f.includes('product-manager'));
    expect(pmFile).toBeDefined();

    const pmContent = fs.readFileSync(path.join(agentsDir, pmFile!), 'utf-8');
    expect(pmContent).toContain('Product Manager');
    expect(pmContent).toContain('System Prompt');
    expect(pmContent).toContain('Capabilities');
  });

  it('should generate a valid CLAUDE.md', () => {
    const bridge = new ClaudeCodeBridge(agentRegistry, artifactStore, {
      projectPath: projectDir,
    });

    const claudeMd = bridge.generateMainClaudeMd();
    expect(claudeMd).toContain('Team Structure');
    expect(claudeMd).toContain('Development Pipeline');
    expect(claudeMd).toContain('Requirements Gathering');
    expect(claudeMd).toContain('ARTIFACT_START');
    expect(claudeMd).toContain('ISSUE_START');
  });

  it('should create prompt files in .cdm/agent-prompts/', async () => {
    const bridge = new ClaudeCodeBridge(agentRegistry, artifactStore, {
      projectPath: projectDir,
      executionMode: 'simulation',
    });

    const task = {
      id: 'test-task-001',
      featureId: 'feat-001',
      stage: PipelineStage.REQUIREMENTS_GATHERING,
      assignedTo: AgentRole.PRODUCT_MANAGER,
      title: 'Requirements for Test Feature',
      description: 'Create requirements for a test feature',
      instructions: 'Analyze the feature and produce requirements',
      inputArtifacts: [],
      expectedOutputs: [ArtifactType.REQUIREMENTS_DOC],
      constraints: ['Be thorough'],
      priority: 'high' as any,
      status: 'idle' as any,
      createdAt: new Date(),
    };

    await bridge.executeAgentTask(task);

    const promptsDir = path.join(projectDir, '.cdm', 'agent-prompts', AgentRole.PRODUCT_MANAGER);
    expect(fs.existsSync(promptsDir)).toBe(true);

    const promptFiles = fs.readdirSync(promptsDir);
    expect(promptFiles.length).toBeGreaterThan(0);

    const promptContent = fs.readFileSync(path.join(promptsDir, promptFiles[0]), 'utf-8');
    expect(promptContent).toContain('Requirements for Test Feature');
    expect(promptContent).toContain('Product Manager');
  });

  it('should execute a task and return a valid AgentResult', async () => {
    const bridge = new ClaudeCodeBridge(agentRegistry, artifactStore, {
      projectPath: projectDir,
      executionMode: 'simulation',
    });

    const task = {
      id: 'test-task-002',
      featureId: 'feat-002',
      stage: PipelineStage.REQUIREMENTS_GATHERING,
      assignedTo: AgentRole.PRODUCT_MANAGER,
      title: 'Gather requirements',
      description: 'Gather requirements for a user login feature',
      instructions: 'Create comprehensive requirements',
      inputArtifacts: [],
      expectedOutputs: [ArtifactType.REQUIREMENTS_DOC, ArtifactType.USER_STORIES],
      constraints: [],
      priority: 'high' as any,
      status: 'idle' as any,
      createdAt: new Date(),
    };

    const result = await bridge.executeAgentTask(task);

    expect(result.agentRole).toBe(AgentRole.PRODUCT_MANAGER);
    expect(result.status).toBe('success');
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.metadata).toHaveProperty('taskId', 'test-task-002');
    expect(result.metadata).toHaveProperty('executionMode', 'simulation');
  });

  it('should parse artifacts from structured output', () => {
    const bridge = new ClaudeCodeBridge(agentRegistry, artifactStore, {
      projectPath: projectDir,
      executionMode: 'simulation',
    });

    const output = `
### Summary
Did some work.

---ARTIFACT_START---
Type: requirements_doc
Name: Auth Requirements
Description: Authentication requirements document
Content:
# Authentication Requirements
Users must be able to log in.
---ARTIFACT_END---

---ARTIFACT_START---
Type: user_stories
Name: Auth User Stories
Description: User stories for auth
Content:
## US-001
As a user I want to log in.
---ARTIFACT_END---
`;

    const task = {
      id: 'parse-test',
      featureId: 'feat-parse',
      stage: PipelineStage.REQUIREMENTS_GATHERING as any,
      assignedTo: AgentRole.PRODUCT_MANAGER as any,
    } as any;

    const artifacts = bridge.parseArtifacts(output, task);
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0].type).toBe(ArtifactType.REQUIREMENTS_DOC);
    expect(artifacts[0].name).toBe('Auth Requirements');
    expect(artifacts[0].content).toContain('Authentication Requirements');
    expect(artifacts[1].type).toBe(ArtifactType.USER_STORIES);
  });

  it('should parse issues from structured output', () => {
    const bridge = new ClaudeCodeBridge(agentRegistry, artifactStore, {
      projectPath: projectDir,
      executionMode: 'simulation',
    });

    const output = `
---ISSUE_START---
Type: security_vulnerability
Severity: high
Title: Missing input validation
Description: User inputs are not validated before processing.
---ISSUE_END---

---ISSUE_START---
Type: documentation_gap
Severity: low
Title: Missing API docs
Description: API endpoints lack documentation.
---ISSUE_END---
`;

    const task = {
      id: 'issue-parse',
      featureId: 'feat-issue',
      stage: PipelineStage.SECURITY_REVIEW as any,
      assignedTo: AgentRole.SECURITY_ENGINEER as any,
    } as any;

    const issues = bridge.parseIssues(output, task);
    expect(issues).toHaveLength(2);
    expect(issues[0].type).toBe('security_vulnerability');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].title).toBe('Missing input validation');
    expect(issues[1].type).toBe('documentation_gap');
    expect(issues[1].severity).toBe('low');
  });
});

// ─── Config Management ──────────────────────────────────────────────────────

describe('Config Management — E2E', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanDir(projectDir);
  });

  it('should return default config when no file exists', () => {
    const config = loadConfig(projectDir);
    expect(config.project.language).toBe('typescript');
    expect(config.pipeline.maxRetries).toBe(2);
    expect(config.agents[AgentRole.PRODUCT_MANAGER].enabled).toBe(true);
  });

  it('should save and reload config from YAML', () => {
    const config = getDefaultConfig();
    config.pipeline.maxRetries = 5;
    config.project.language = 'python';
    saveConfig(projectDir, config);

    expect(fs.existsSync(path.join(projectDir, 'cdm.config.yaml'))).toBe(true);

    const reloaded = loadConfig(projectDir);
    expect(reloaded.pipeline.maxRetries).toBe(5);
    expect(reloaded.project.language).toBe('python');
  });

  it('should merge partial config with defaults', () => {
    const configPath = path.join(projectDir, 'cdm.config.yaml');
    fs.writeFileSync(configPath, 'pipeline:\n  maxRetries: 10\n', 'utf-8');

    const loaded = loadConfig(projectDir);
    expect(loaded.pipeline.maxRetries).toBe(10);
    expect(loaded.pipeline.timeoutMinutes).toBe(30);
    expect(loaded.project.language).toBe('typescript');
  });
});

// ─── Agent Registry ─────────────────────────────────────────────────────────

describe('AgentRegistry — E2E', () => {
  let projectDir: string;
  let artifactStore: ArtifactStore;

  beforeEach(() => {
    projectDir = createTempProject();
    artifactStore = new ArtifactStore(projectDir);
  });

  afterEach(() => {
    cleanDir(projectDir);
  });

  it('should instantiate all 18 agents', () => {
    const registry = new AgentRegistry(artifactStore);
    const agents = registry.getAllAgents();
    expect(agents.length).toBe(18);
  });

  it('should return configs for all roles', () => {
    const registry = new AgentRegistry(artifactStore);
    const configs = registry.getAllConfigs();
    expect(configs.length).toBe(18);

    const roles = configs.map(c => c.role);
    expect(roles).toContain(AgentRole.PRODUCT_MANAGER);
    expect(roles).toContain(AgentRole.SENIOR_DEVELOPER);
    expect(roles).toContain(AgentRole.QA_ENGINEER);
    expect(roles).toContain(AgentRole.DEVOPS_ENGINEER);
  });

  it('should return a valid team hierarchy', () => {
    const registry = new AgentRegistry(artifactStore);
    const hierarchy = registry.getTeamHierarchy();

    const pmReports = hierarchy.get(AgentRole.PRODUCT_MANAGER);
    expect(pmReports).toBeDefined();
    expect(pmReports).toContain(AgentRole.ENGINEERING_MANAGER);

    const emReports = hierarchy.get(AgentRole.ENGINEERING_MANAGER);
    expect(emReports).toBeDefined();
    expect(emReports!.length).toBeGreaterThan(0);
  });

  it('should build a reporting chain', () => {
    const registry = new AgentRegistry(artifactStore);
    const chain = registry.getReportingChain(AgentRole.JUNIOR_DEVELOPER);
    expect(chain.length).toBeGreaterThanOrEqual(2);
    expect(chain[chain.length - 1]).toBe(AgentRole.JUNIOR_DEVELOPER);
  });

  it('should generate Claude Code prompts for every agent', () => {
    const registry = new AgentRegistry(artifactStore);

    for (const role of Object.values(AgentRole)) {
      const agent = registry.getAgent(role);
      const task = {
        id: `prompt-test-${role}`,
        featureId: 'feat-prompt',
        stage: PipelineStage.REQUIREMENTS_GATHERING,
        assignedTo: role,
        title: `Test task for ${role}`,
        description: `Testing prompt generation for ${role}`,
        instructions: 'Generate comprehensive output',
        inputArtifacts: [],
        expectedOutputs: [],
        constraints: ['Be thorough'],
        priority: 'high' as any,
        status: 'idle' as any,
        createdAt: new Date(),
      };

      const prompt = agent.buildClaudeCodePrompt(task);
      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain('Agent Role');
      expect(prompt).toContain('ARTIFACT_START');
    }
  });
});
