import { AgentRole, type AgentConfig } from '../types';
import { BaseAgent } from './base-agent';
import { type ArtifactStore } from '../workspace/artifact-store';

import { ProductManagerAgent, productManagerConfig } from './product-manager';
import { EngineeringManagerAgent, engineeringManagerConfig } from './engineering-manager';
import SystemArchitectAgent, { SYSTEM_ARCHITECT_CONFIG } from './system-architect';
import UIDesignerAgent, { UI_DESIGNER_CONFIG } from './ui-designer';
import SeniorDeveloperAgent, { SENIOR_DEVELOPER_CONFIG } from './senior-developer';
import JuniorDeveloperAgent, { JUNIOR_DEVELOPER_CONFIG } from './junior-developer';
import CodeReviewerAgent, { codeReviewerConfig } from './code-reviewer';
import QAEngineerAgent, { qaEngineerConfig } from './qa-engineer';
import SecurityEngineerAgent, { SECURITY_ENGINEER_CONFIG } from './security-engineer';
import DevOpsEngineerAgent, { DEVOPS_ENGINEER_CONFIG } from './devops-engineer';
import DocumentationWriterAgent, { DOCUMENTATION_WRITER_CONFIG } from './documentation-writer';
import SolutionsArchitectAgent, { SOLUTIONS_ARCHITECT_CONFIG } from './solutions-architect';
import SREEngineerAgent, { SRE_ENGINEER_CONFIG } from './sre-engineer';
import DatabaseEngineerAgent, { DATABASE_ENGINEER_CONFIG } from './database-engineer';
import PerformanceEngineerAgent, { PERFORMANCE_ENGINEER_CONFIG } from './performance-engineer';
import ComplianceOfficerAgent, { COMPLIANCE_OFFICER_CONFIG } from './compliance-officer';
import BusinessAnalystAgent, { BUSINESS_ANALYST_CONFIG } from './business-analyst';
import AccessibilitySpecialistAgent, { ACCESSIBILITY_SPECIALIST_CONFIG } from './accessibility-specialist';

export type AgentFactory = (artifactStore: ArtifactStore) => BaseAgent;

const AGENT_FACTORIES: Record<AgentRole, AgentFactory> = {
  [AgentRole.PRODUCT_MANAGER]: (store) => new ProductManagerAgent(store),
  [AgentRole.ENGINEERING_MANAGER]: (store) => new EngineeringManagerAgent(store),
  [AgentRole.SYSTEM_ARCHITECT]: (store) => new SystemArchitectAgent(store),
  [AgentRole.UI_DESIGNER]: (store) => new UIDesignerAgent(store),
  [AgentRole.SENIOR_DEVELOPER]: (store) => new SeniorDeveloperAgent(SENIOR_DEVELOPER_CONFIG, store),
  [AgentRole.JUNIOR_DEVELOPER]: (store) => new JuniorDeveloperAgent(JUNIOR_DEVELOPER_CONFIG, store),
  [AgentRole.CODE_REVIEWER]: (store) => new CodeReviewerAgent(store),
  [AgentRole.QA_ENGINEER]: (store) => new QAEngineerAgent(store),
  [AgentRole.SECURITY_ENGINEER]: (store) => new SecurityEngineerAgent(store),
  [AgentRole.DEVOPS_ENGINEER]: (store) => new DevOpsEngineerAgent(store),
  [AgentRole.DOCUMENTATION_WRITER]: (store) => new DocumentationWriterAgent(store),
  [AgentRole.SOLUTIONS_ARCHITECT]: (store) => new SolutionsArchitectAgent(store),
  [AgentRole.SRE_ENGINEER]: (store) => new SREEngineerAgent(store),
  [AgentRole.DATABASE_ENGINEER]: (store) => new DatabaseEngineerAgent(store),
  [AgentRole.PERFORMANCE_ENGINEER]: (store) => new PerformanceEngineerAgent(store),
  [AgentRole.COMPLIANCE_OFFICER]: (store) => new ComplianceOfficerAgent(store),
  [AgentRole.BUSINESS_ANALYST]: (store) => new BusinessAnalystAgent(store),
  [AgentRole.ACCESSIBILITY_SPECIALIST]: (store) => new AccessibilitySpecialistAgent(store),
};

const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  [AgentRole.PRODUCT_MANAGER]: productManagerConfig,
  [AgentRole.ENGINEERING_MANAGER]: engineeringManagerConfig,
  [AgentRole.SYSTEM_ARCHITECT]: SYSTEM_ARCHITECT_CONFIG,
  [AgentRole.UI_DESIGNER]: UI_DESIGNER_CONFIG,
  [AgentRole.SENIOR_DEVELOPER]: SENIOR_DEVELOPER_CONFIG,
  [AgentRole.JUNIOR_DEVELOPER]: JUNIOR_DEVELOPER_CONFIG,
  [AgentRole.CODE_REVIEWER]: codeReviewerConfig,
  [AgentRole.QA_ENGINEER]: qaEngineerConfig,
  [AgentRole.SECURITY_ENGINEER]: SECURITY_ENGINEER_CONFIG,
  [AgentRole.DEVOPS_ENGINEER]: DEVOPS_ENGINEER_CONFIG,
  [AgentRole.DOCUMENTATION_WRITER]: DOCUMENTATION_WRITER_CONFIG,
  [AgentRole.SOLUTIONS_ARCHITECT]: SOLUTIONS_ARCHITECT_CONFIG,
  [AgentRole.SRE_ENGINEER]: SRE_ENGINEER_CONFIG,
  [AgentRole.DATABASE_ENGINEER]: DATABASE_ENGINEER_CONFIG,
  [AgentRole.PERFORMANCE_ENGINEER]: PERFORMANCE_ENGINEER_CONFIG,
  [AgentRole.COMPLIANCE_OFFICER]: COMPLIANCE_OFFICER_CONFIG,
  [AgentRole.BUSINESS_ANALYST]: BUSINESS_ANALYST_CONFIG,
  [AgentRole.ACCESSIBILITY_SPECIALIST]: ACCESSIBILITY_SPECIALIST_CONFIG,
};

export class AgentRegistry {
  private agents: Map<AgentRole, BaseAgent> = new Map();
  private artifactStore: ArtifactStore;

  constructor(artifactStore: ArtifactStore) {
    this.artifactStore = artifactStore;
  }

  getAgent(role: AgentRole): BaseAgent {
    let agent = this.agents.get(role);
    if (!agent) {
      const factory = AGENT_FACTORIES[role];
      if (!factory) {
        throw new Error(`No agent registered for role: ${role}`);
      }
      agent = factory(this.artifactStore);
      this.agents.set(role, agent);
    }
    return agent;
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

  getTeamHierarchy(): Map<AgentRole, AgentRole[]> {
    const hierarchy = new Map<AgentRole, AgentRole[]>();
    for (const config of Object.values(AGENT_CONFIGS)) {
      hierarchy.set(config.role, config.directReports);
    }
    return hierarchy;
  }

  getReportingChain(role: AgentRole): AgentRole[] {
    const chain: AgentRole[] = [role];
    let current = AGENT_CONFIGS[role];
    while (current.reportsTo) {
      chain.unshift(current.reportsTo);
      current = AGENT_CONFIGS[current.reportsTo];
    }
    return chain;
  }

  reset(): void {
    this.agents.clear();
  }
}

export {
  BaseAgent,
  ProductManagerAgent,
  EngineeringManagerAgent,
  SystemArchitectAgent,
  UIDesignerAgent,
  SeniorDeveloperAgent,
  JuniorDeveloperAgent,
  CodeReviewerAgent,
  QAEngineerAgent,
  SecurityEngineerAgent,
  DevOpsEngineerAgent,
  DocumentationWriterAgent,
  SolutionsArchitectAgent,
  SREEngineerAgent,
  DatabaseEngineerAgent,
  PerformanceEngineerAgent,
  ComplianceOfficerAgent,
  BusinessAnalystAgent,
  AccessibilitySpecialistAgent,
};
