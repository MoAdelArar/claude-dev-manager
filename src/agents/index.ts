import { AgentRole, type AgentConfig, type Skill } from '../types';
import { BaseAgent, type ProjectContext } from './base-agent';
import { type ArtifactStore } from '../workspace/artifact-store';
import { type SkillRegistry } from '../skills/base-skill';

import { PlannerAgent, PLANNER_CONFIG } from './planner';
import { ArchitectAgent, ARCHITECT_CONFIG } from './architect';
import { DeveloperAgent, DEVELOPER_CONFIG } from './developer';
import { ReviewerAgent, REVIEWER_CONFIG } from './reviewer';
import { OperatorAgent, OPERATOR_CONFIG } from './operator';

export type AgentFactory = (artifactStore: ArtifactStore) => BaseAgent;

const AGENT_FACTORIES: Record<AgentRole, AgentFactory> = {
  [AgentRole.PLANNER]: (store) => new PlannerAgent(store),
  [AgentRole.ARCHITECT]: (store) => new ArchitectAgent(store),
  [AgentRole.DEVELOPER]: (store) => new DeveloperAgent(store),
  [AgentRole.REVIEWER]: (store) => new ReviewerAgent(store),
  [AgentRole.OPERATOR]: (store) => new OperatorAgent(store),
};

const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  [AgentRole.PLANNER]: PLANNER_CONFIG,
  [AgentRole.ARCHITECT]: ARCHITECT_CONFIG,
  [AgentRole.DEVELOPER]: DEVELOPER_CONFIG,
  [AgentRole.REVIEWER]: REVIEWER_CONFIG,
  [AgentRole.OPERATOR]: OPERATOR_CONFIG,
};

export class AgentRegistry {
  private agents: Map<AgentRole, BaseAgent> = new Map();
  private artifactStore: ArtifactStore;
  private skillRegistry: SkillRegistry | null = null;
  private projectContext: ProjectContext | null = null;

  constructor(artifactStore: ArtifactStore, skillRegistry?: SkillRegistry) {
    this.artifactStore = artifactStore;
    this.skillRegistry = skillRegistry ?? null;
  }

  setSkillRegistry(registry: SkillRegistry): void {
    this.skillRegistry = registry;
  }

  setProjectContext(context: ProjectContext): void {
    this.projectContext = context;
    for (const agent of this.agents.values()) {
      agent.setProjectContext(context);
    }
  }

  getAgent(role: AgentRole, skillIds?: string[]): BaseAgent {
    let agent = this.agents.get(role);

    if (!agent) {
      const factory = AGENT_FACTORIES[role];
      if (!factory) {
        throw new Error(`No agent registered for role: ${role}`);
      }
      agent = factory(this.artifactStore);

      if (this.projectContext) {
        agent.setProjectContext(this.projectContext);
      }

      this.agents.set(role, agent);
    }

    if (skillIds && skillIds.length > 0 && this.skillRegistry) {
      const skills = this.loadSkills(skillIds);
      agent.setActiveSkills(skills);
    } else {
      agent.setActiveSkills([]);
    }

    return agent;
  }

  getAgentWithSkills(role: AgentRole, skills: Skill[]): BaseAgent {
    const agent = this.getAgent(role);
    agent.setActiveSkills(skills);

    if (this.projectContext) {
      agent.setProjectContext(this.projectContext);
    }

    return agent;
  }

  private loadSkills(skillIds: string[]): Skill[] {
    if (!this.skillRegistry) {
      return [];
    }

    const skills: Skill[] = [];
    for (const id of skillIds) {
      const skill = this.skillRegistry.getSkill(id);
      if (skill) {
        skills.push(skill);
      }
    }
    return skills;
  }

  getConfig(role: AgentRole): AgentConfig {
    const config = AGENT_CONFIGS[role];
    if (!config) {
      throw new Error(`No config registered for role: ${role}`);
    }
    return config;
  }

  getAllAgents(): BaseAgent[] {
    for (const role of Object.values(AgentRole)) {
      this.getAgent(role);
    }
    return Array.from(this.agents.values());
  }

  getAllConfigs(): AgentConfig[] {
    return Object.values(AGENT_CONFIGS);
  }

  getAllRoles(): AgentRole[] {
    return Object.values(AgentRole);
  }

  getCompatibleSkills(role: AgentRole): string[] {
    const config = this.getConfig(role);
    return config.compatibleSkills || [];
  }

  reset(): void {
    this.agents.clear();
  }
}

export {
  BaseAgent,
  PlannerAgent,
  ArchitectAgent,
  DeveloperAgent,
  ReviewerAgent,
  OperatorAgent,
  PLANNER_CONFIG,
  ARCHITECT_CONFIG,
  DEVELOPER_CONFIG,
  REVIEWER_CONFIG,
  OPERATOR_CONFIG,
};

export type { ProjectContext };
