import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AgentRole } from '../../src/types';
import { AgentRegistry } from '../../src/agents/index';
import { ArtifactStore } from '../../src/workspace/artifact-store';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;
  let artifactStore: ArtifactStore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-reg-test-'));
    artifactStore = new ArtifactStore(tempDir);
    registry = new AgentRegistry(artifactStore);
  });

  afterEach(() => {
    registry.reset();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getAgent', () => {
    it('should create and return agent for each role', () => {
      for (const role of Object.values(AgentRole)) {
        const agent = registry.getAgent(role);
        expect(agent).toBeDefined();
        expect(agent.role).toBe(role);
      }
    });

    it('should return the same agent instance on subsequent calls', () => {
      const agent1 = registry.getAgent(AgentRole.PRODUCT_MANAGER);
      const agent2 = registry.getAgent(AgentRole.PRODUCT_MANAGER);
      expect(agent1).toBe(agent2);
    });
  });

  describe('getConfig', () => {
    it('should return config for each role', () => {
      for (const role of Object.values(AgentRole)) {
        const config = registry.getConfig(role);
        expect(config).toBeDefined();
        expect(config.role).toBe(role);
        expect(config.name).toBeTruthy();
        expect(config.title).toBeTruthy();
        expect(config.systemPrompt).toBeTruthy();
      }
    });

    it('should have valid capabilities for each agent', () => {
      for (const role of Object.values(AgentRole)) {
        const config = registry.getConfig(role);
        expect(config.capabilities.length).toBeGreaterThan(0);
        for (const cap of config.capabilities) {
          expect(cap.name).toBeTruthy();
          expect(cap.allowedTools.length).toBeGreaterThan(0);
        }
      }
    });

    it('should have system prompts of substantial length', () => {
      for (const role of Object.values(AgentRole)) {
        const config = registry.getConfig(role);
        expect(config.systemPrompt.length).toBeGreaterThan(200);
      }
    });
  });

  describe('getAllAgents', () => {
    it('should return all 11 agents', () => {
      const agents = registry.getAllAgents();
      expect(agents).toHaveLength(11);
    });
  });

  describe('getAllConfigs', () => {
    it('should return all 11 configs', () => {
      const configs = registry.getAllConfigs();
      expect(configs).toHaveLength(11);
    });
  });

  describe('getTeamHierarchy', () => {
    it('should return valid hierarchy', () => {
      const hierarchy = registry.getTeamHierarchy();
      expect(hierarchy.size).toBe(11);

      const pmReports = hierarchy.get(AgentRole.PRODUCT_MANAGER);
      expect(pmReports).toBeDefined();
      expect(pmReports).toContain(AgentRole.ENGINEERING_MANAGER);
    });
  });

  describe('getReportingChain', () => {
    it('should return chain from top to agent', () => {
      const chain = registry.getReportingChain(AgentRole.JUNIOR_DEVELOPER);
      expect(chain.length).toBeGreaterThan(1);
      expect(chain[chain.length - 1]).toBe(AgentRole.JUNIOR_DEVELOPER);
    });

    it('should return single-element chain for top-level agent', () => {
      const chain = registry.getReportingChain(AgentRole.PRODUCT_MANAGER);
      expect(chain).toContain(AgentRole.PRODUCT_MANAGER);
    });
  });

  describe('reset', () => {
    it('should clear all cached agents', () => {
      registry.getAgent(AgentRole.PRODUCT_MANAGER);
      registry.reset();

      const agent = registry.getAgent(AgentRole.PRODUCT_MANAGER);
      expect(agent).toBeDefined();
    });
  });

  describe('agent output artifacts', () => {
    it('each agent should have defined output artifacts', () => {
      for (const role of Object.values(AgentRole)) {
        const config = registry.getConfig(role);
        expect(config.outputArtifacts.length).toBeGreaterThan(0);
      }
    });
  });

  describe('agent token budgets', () => {
    it('each agent should have a positive token budget', () => {
      for (const role of Object.values(AgentRole)) {
        const config = registry.getConfig(role);
        expect(config.maxTokenBudget).toBeGreaterThan(0);
      }
    });
  });
});
