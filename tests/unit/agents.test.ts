import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  AgentRole,
  PipelineStage,
  type AgentTask,
  type AgentConfig,
} from '../../src/types';
import { AgentRegistry, BaseAgent } from '../../src/agents/index';
import { ArtifactStore } from '../../src/workspace/artifact-store';

const ALL_ROLES = Object.values(AgentRole);

describe('All 18 Agents', () => {
  let registry: AgentRegistry;
  let artifactStore: ArtifactStore;
  let tempDir: string;

  function makeTask(role: AgentRole): AgentTask {
    return {
      id: 'test-task',
      featureId: 'test-feature',
      stage: PipelineStage.REQUIREMENTS_GATHERING,
      assignedTo: role,
      title: 'Test task',
      description: 'Test feature description',
      instructions: 'Generate output',
      inputArtifacts: [],
      expectedOutputs: [],
      constraints: [],
      priority: 'high' as any,
      status: 'idle' as any,
      createdAt: new Date(),
    };
  }

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-agents-test-'));
    artifactStore = new ArtifactStore(tempDir);
    registry = new AgentRegistry(artifactStore);
  });

  afterAll(() => {
    registry.reset();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('registry contains exactly 18 roles', () => {
    expect(ALL_ROLES).toHaveLength(18);
  });

  describe.each(ALL_ROLES)('Agent: %s', (role) => {
    let agent: BaseAgent;
    let config: AgentConfig;

    beforeAll(() => {
      agent = registry.getAgent(role);
      config = registry.getConfig(role);
    });

    it('can be instantiated from the registry', () => {
      expect(agent).toBeDefined();
      expect(agent).toBeInstanceOf(BaseAgent);
    });

    it('has a valid role matching the registry key', () => {
      expect(agent.role).toBe(role);
      expect(config.role).toBe(role);
    });

    it('has non-empty name', () => {
      expect(config.name).toBeTruthy();
      expect(config.name.length).toBeGreaterThan(0);
    });

    it('has non-empty title', () => {
      expect(config.title).toBeTruthy();
      expect(config.title.length).toBeGreaterThan(0);
      expect(agent.title).toBe(config.title);
    });

    it('has non-empty description', () => {
      expect(config.description).toBeTruthy();
      expect(config.description.length).toBeGreaterThan(0);
    });

    it('has systemPrompt longer than 100 characters', () => {
      expect(config.systemPrompt).toBeTruthy();
      expect(config.systemPrompt.length).toBeGreaterThan(100);
    });

    it('has at least 1 capability', () => {
      expect(config.capabilities.length).toBeGreaterThanOrEqual(1);
      for (const cap of config.capabilities) {
        expect(cap.name).toBeTruthy();
        expect(cap.description).toBeTruthy();
        expect(cap.allowedTools.length).toBeGreaterThan(0);
      }
    });

    it('has maxTokenBudget > 0', () => {
      expect(config.maxTokenBudget).toBeGreaterThan(0);
    });

    it('has at least 1 outputArtifact', () => {
      expect(config.outputArtifacts.length).toBeGreaterThanOrEqual(1);
    });

    it('execute() returns a valid AgentResult with status "success"', async () => {
      const task = makeTask(role);
      const result = await agent.execute(task);

      expect(result).toBeDefined();
      expect(result.agentRole).toBe(role);
      expect(result.status).toBe('success');
      expect(typeof result.output).toBe('string');
      expect(result.output.length).toBeGreaterThan(0);
      expect(result.tokensUsed).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.taskId).toBe('test-task');
    });

    it('execute() produces at least 1 artifact', async () => {
      const task = makeTask(role);
      const result = await agent.execute(task);

      expect(Array.isArray(result.artifacts)).toBe(true);
      expect(result.artifacts.length).toBeGreaterThanOrEqual(1);

      for (const artifact of result.artifacts) {
        expect(artifact.id).toBeTruthy();
        expect(artifact.name).toBeTruthy();
        expect(artifact.type).toBeTruthy();
        expect(artifact.content).toBeTruthy();
        expect(artifact.createdBy).toBe(role);
      }
    });

    it('buildClaudeCodePrompt() returns a non-empty string containing the title and ARTIFACT_START', () => {
      const task = makeTask(role);
      const prompt = agent.buildClaudeCodePrompt(task);

      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(config.title);
      expect(prompt).toContain('ARTIFACT_START');
    });

    it('prepareHandoff() returns a valid HandoffPayload', () => {
      const toAgent =
        role === AgentRole.ENGINEERING_MANAGER
          ? AgentRole.SYSTEM_ARCHITECT
          : AgentRole.ENGINEERING_MANAGER;

      const handoff = agent.prepareHandoff(
        toAgent,
        PipelineStage.ARCHITECTURE_DESIGN,
        [],
      );

      expect(handoff).toBeDefined();
      expect(handoff.fromAgent).toBe(role);
      expect(handoff.toAgent).toBe(toAgent);
      expect(handoff.stage).toBe(PipelineStage.ARCHITECTURE_DESIGN);
      expect(typeof handoff.context).toBe('string');
      expect(typeof handoff.instructions).toBe('string');
      expect(handoff.instructions.length).toBeGreaterThan(0);
      expect(Array.isArray(handoff.constraints)).toBe(true);
      expect(handoff.constraints.length).toBeGreaterThan(0);
      expect(Array.isArray(handoff.artifacts)).toBe(true);
    });
  });

  describe('Cross-agent consistency checks', () => {
    it('every role in AgentRole enum has a factory and config', () => {
      for (const role of ALL_ROLES) {
        expect(() => registry.getAgent(role)).not.toThrow();
        expect(() => registry.getConfig(role)).not.toThrow();
      }
    });

    it('getAllAgents returns 18 distinct agents', () => {
      const agents = registry.getAllAgents();
      expect(agents).toHaveLength(18);
      const roles = agents.map((a) => a.role);
      expect(new Set(roles).size).toBe(18);
    });

    it('getAllConfigs returns 18 distinct configs', () => {
      const configs = registry.getAllConfigs();
      expect(configs).toHaveLength(18);
      const roles = configs.map((c) => c.role);
      expect(new Set(roles).size).toBe(18);
    });

    it('agent name property matches config name', () => {
      for (const role of ALL_ROLES) {
        const agent = registry.getAgent(role);
        const config = registry.getConfig(role);
        expect(agent.name).toBe(config.name);
      }
    });

    it('getSystemPrompt returns the config systemPrompt', () => {
      for (const role of ALL_ROLES) {
        const agent = registry.getAgent(role);
        const config = registry.getConfig(role);
        expect(agent.getSystemPrompt()).toBe(config.systemPrompt);
      }
    });

    it('getCapabilities returns capability names', () => {
      for (const role of ALL_ROLES) {
        const agent = registry.getAgent(role);
        const caps = agent.getCapabilities();
        expect(caps.length).toBeGreaterThan(0);
        for (const name of caps) {
          expect(typeof name).toBe('string');
          expect(name.length).toBeGreaterThan(0);
        }
      }
    });

    it('getMaxTokenBudget returns a positive number', () => {
      for (const role of ALL_ROLES) {
        const agent = registry.getAgent(role);
        expect(agent.getMaxTokenBudget()).toBeGreaterThan(0);
      }
    });
  });
});
