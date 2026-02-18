import {
  type StageConfig,
  PipelineStage,
  AgentRole,
  ArtifactType,
  GateCondition,
} from '../types';

const STAGE_CONFIGS: StageConfig[] = [
  {
    stage: PipelineStage.REQUIREMENTS_GATHERING,
    name: 'Requirements Gathering',
    description: 'Product Manager analyzes the feature request with business analyst support, creates requirements, user stories, acceptance criteria, and business case',
    primaryAgent: AgentRole.PRODUCT_MANAGER,
    supportingAgents: [AgentRole.BUSINESS_ANALYST],
    reviewers: [],
    requiredArtifacts: [],
    producedArtifacts: [
      ArtifactType.REQUIREMENTS_DOC,
      ArtifactType.USER_STORIES,
      ArtifactType.ACCEPTANCE_CRITERIA,
    ],
    canBeSkipped: false,
    maxRetries: 2,
    timeoutMinutes: 15,
    gateConditions: [
      {
        name: 'requirements_complete',
        description: 'Requirements document must be produced',
        validator: 'hasArtifact:requirements_doc',
        required: true,
      },
      {
        name: 'user_stories_present',
        description: 'At least one user story must be defined',
        validator: 'hasArtifact:user_stories',
        required: true,
      },
    ],
  },
  {
    stage: PipelineStage.ARCHITECTURE_DESIGN,
    name: 'Architecture Design',
    description: 'System Architect designs the system architecture, APIs, and data models. Solutions Architect evaluates technology choices. Database Engineer designs the schema.',
    primaryAgent: AgentRole.SYSTEM_ARCHITECT,
    supportingAgents: [AgentRole.SOLUTIONS_ARCHITECT, AgentRole.DATABASE_ENGINEER, AgentRole.ENGINEERING_MANAGER],
    reviewers: [AgentRole.ENGINEERING_MANAGER],
    requiredArtifacts: [
      ArtifactType.REQUIREMENTS_DOC,
      ArtifactType.USER_STORIES,
    ],
    producedArtifacts: [
      ArtifactType.ARCHITECTURE_DOC,
      ArtifactType.API_SPEC,
      ArtifactType.DATA_MODEL,
    ],
    canBeSkipped: false,
    maxRetries: 2,
    timeoutMinutes: 20,
    gateConditions: [
      {
        name: 'architecture_documented',
        description: 'Architecture document must be produced',
        validator: 'hasArtifact:architecture_doc',
        required: true,
      },
      {
        name: 'no_critical_concerns',
        description: 'No critical architecture concerns flagged',
        validator: 'noCriticalIssues',
        required: true,
      },
    ],
  },
  {
    stage: PipelineStage.UI_UX_DESIGN,
    name: 'UI/UX Design',
    description: 'UI Designer creates interface specifications, wireframes, and component specs. Accessibility Specialist reviews for WCAG compliance.',
    primaryAgent: AgentRole.UI_DESIGNER,
    supportingAgents: [AgentRole.ACCESSIBILITY_SPECIALIST],
    reviewers: [AgentRole.PRODUCT_MANAGER],
    requiredArtifacts: [
      ArtifactType.REQUIREMENTS_DOC,
      ArtifactType.USER_STORIES,
      ArtifactType.ACCEPTANCE_CRITERIA,
    ],
    producedArtifacts: [
      ArtifactType.UI_SPEC,
      ArtifactType.WIREFRAME,
      ArtifactType.COMPONENT_SPEC,
    ],
    canBeSkipped: true,
    maxRetries: 2,
    timeoutMinutes: 15,
    gateConditions: [
      {
        name: 'ui_spec_present',
        description: 'UI specification must be produced',
        validator: 'hasArtifact:ui_spec',
        required: true,
      },
    ],
  },
  {
    stage: PipelineStage.TASK_BREAKDOWN,
    name: 'Task Breakdown',
    description: 'Engineering Manager breaks work into tasks, estimates effort, and creates sprint plan',
    primaryAgent: AgentRole.ENGINEERING_MANAGER,
    supportingAgents: [AgentRole.SENIOR_DEVELOPER],
    reviewers: [],
    requiredArtifacts: [
      ArtifactType.REQUIREMENTS_DOC,
      ArtifactType.ARCHITECTURE_DOC,
    ],
    producedArtifacts: [
      ArtifactType.TASK_LIST,
      ArtifactType.SPRINT_PLAN,
    ],
    canBeSkipped: false,
    maxRetries: 2,
    timeoutMinutes: 10,
    gateConditions: [
      {
        name: 'tasks_defined',
        description: 'Task list must be produced',
        validator: 'hasArtifact:task_list',
        required: true,
      },
    ],
  },
  {
    stage: PipelineStage.IMPLEMENTATION,
    name: 'Implementation',
    description: 'Senior and Junior Developers implement the feature according to architecture and task breakdown',
    primaryAgent: AgentRole.SENIOR_DEVELOPER,
    supportingAgents: [AgentRole.JUNIOR_DEVELOPER],
    reviewers: [],
    requiredArtifacts: [
      ArtifactType.ARCHITECTURE_DOC,
      ArtifactType.API_SPEC,
      ArtifactType.DATA_MODEL,
      ArtifactType.TASK_LIST,
    ],
    producedArtifacts: [
      ArtifactType.SOURCE_CODE,
    ],
    canBeSkipped: false,
    maxRetries: 3,
    timeoutMinutes: 30,
    gateConditions: [
      {
        name: 'code_produced',
        description: 'Source code artifacts must be produced',
        validator: 'hasArtifact:source_code',
        required: true,
      },
    ],
  },
  {
    stage: PipelineStage.CODE_REVIEW,
    name: 'Code Review',
    description: 'Code Reviewer performs thorough review of all produced code',
    primaryAgent: AgentRole.CODE_REVIEWER,
    supportingAgents: [],
    reviewers: [AgentRole.SENIOR_DEVELOPER],
    requiredArtifacts: [
      ArtifactType.SOURCE_CODE,
      ArtifactType.ARCHITECTURE_DOC,
    ],
    producedArtifacts: [
      ArtifactType.CODE_REVIEW_REPORT,
    ],
    canBeSkipped: false,
    maxRetries: 3,
    timeoutMinutes: 15,
    gateConditions: [
      {
        name: 'review_completed',
        description: 'Code review report must be produced',
        validator: 'hasArtifact:code_review_report',
        required: true,
      },
      {
        name: 'no_critical_code_issues',
        description: 'No critical code quality issues',
        validator: 'noCriticalIssues',
        required: true,
      },
    ],
  },
  {
    stage: PipelineStage.TESTING,
    name: 'Testing',
    description: 'QA Engineer creates test plans and writes tests. Performance Engineer designs load tests. Accessibility Specialist audits for WCAG compliance.',
    primaryAgent: AgentRole.QA_ENGINEER,
    supportingAgents: [AgentRole.JUNIOR_DEVELOPER, AgentRole.PERFORMANCE_ENGINEER, AgentRole.ACCESSIBILITY_SPECIALIST],
    reviewers: [AgentRole.ENGINEERING_MANAGER],
    requiredArtifacts: [
      ArtifactType.SOURCE_CODE,
      ArtifactType.REQUIREMENTS_DOC,
      ArtifactType.ACCEPTANCE_CRITERIA,
    ],
    producedArtifacts: [
      ArtifactType.TEST_PLAN,
      ArtifactType.UNIT_TESTS,
      ArtifactType.INTEGRATION_TESTS,
      ArtifactType.TEST_REPORT,
    ],
    canBeSkipped: false,
    maxRetries: 3,
    timeoutMinutes: 20,
    gateConditions: [
      {
        name: 'tests_written',
        description: 'Test artifacts must be produced',
        validator: 'hasArtifact:test_plan',
        required: true,
      },
      {
        name: 'no_critical_bugs',
        description: 'No critical bugs found during testing',
        validator: 'noCriticalIssues',
        required: true,
      },
    ],
  },
  {
    stage: PipelineStage.SECURITY_REVIEW,
    name: 'Security & Compliance Review',
    description: 'Security Engineer performs security audit. Compliance Officer reviews for regulatory compliance (GDPR, HIPAA, SOC2, PCI-DSS).',
    primaryAgent: AgentRole.SECURITY_ENGINEER,
    supportingAgents: [AgentRole.COMPLIANCE_OFFICER],
    reviewers: [AgentRole.SENIOR_DEVELOPER, AgentRole.ENGINEERING_MANAGER],
    requiredArtifacts: [
      ArtifactType.SOURCE_CODE,
      ArtifactType.ARCHITECTURE_DOC,
      ArtifactType.API_SPEC,
    ],
    producedArtifacts: [
      ArtifactType.SECURITY_REPORT,
    ],
    canBeSkipped: true,
    maxRetries: 2,
    timeoutMinutes: 15,
    gateConditions: [
      {
        name: 'security_report_produced',
        description: 'Security report must be produced',
        validator: 'hasArtifact:security_report',
        required: true,
      },
      {
        name: 'no_critical_vulnerabilities',
        description: 'No critical security vulnerabilities',
        validator: 'noCriticalIssues',
        required: true,
      },
    ],
  },
  {
    stage: PipelineStage.DOCUMENTATION,
    name: 'Documentation',
    description: 'Documentation Writer creates API docs, developer guides, user docs, and changelog',
    primaryAgent: AgentRole.DOCUMENTATION_WRITER,
    supportingAgents: [],
    reviewers: [AgentRole.PRODUCT_MANAGER],
    requiredArtifacts: [
      ArtifactType.REQUIREMENTS_DOC,
      ArtifactType.API_SPEC,
      ArtifactType.SOURCE_CODE,
    ],
    producedArtifacts: [
      ArtifactType.API_DOCUMENTATION,
      ArtifactType.DEVELOPER_DOCUMENTATION,
      ArtifactType.CHANGELOG,
    ],
    canBeSkipped: true,
    maxRetries: 2,
    timeoutMinutes: 15,
    gateConditions: [
      {
        name: 'docs_produced',
        description: 'At least developer documentation must be produced',
        validator: 'hasArtifact:developer_documentation',
        required: true,
      },
    ],
  },
  {
    stage: PipelineStage.DEPLOYMENT,
    name: 'Deployment & NFR',
    description: 'DevOps Engineer creates deployment plan, CI/CD, and cloud-specific NFR artifacts. SRE Engineer handles reliability, incident response, and capacity planning.',
    primaryAgent: AgentRole.DEVOPS_ENGINEER,
    supportingAgents: [AgentRole.SRE_ENGINEER],
    reviewers: [AgentRole.ENGINEERING_MANAGER, AgentRole.SECURITY_ENGINEER],
    requiredArtifacts: [
      ArtifactType.SOURCE_CODE,
      ArtifactType.ARCHITECTURE_DOC,
    ],
    producedArtifacts: [
      ArtifactType.DEPLOYMENT_PLAN,
      ArtifactType.CI_CD_CONFIG,
      ArtifactType.INFRASTRUCTURE_CONFIG,
      ArtifactType.MONITORING_CONFIG,
      ArtifactType.ALERTING_RULES,
      ArtifactType.SCALING_POLICY,
      ArtifactType.COST_ANALYSIS,
      ArtifactType.SLA_DEFINITION,
      ArtifactType.DISASTER_RECOVERY_PLAN,
      ArtifactType.PERFORMANCE_BENCHMARK,
      ArtifactType.RUNBOOK,
    ],
    canBeSkipped: true,
    maxRetries: 2,
    timeoutMinutes: 20,
    gateConditions: [
      {
        name: 'deployment_plan_produced',
        description: 'Deployment plan must be produced',
        validator: 'hasArtifact:deployment_plan',
        required: true,
      },
    ],
  },
];

export function getStageConfig(stage: PipelineStage): StageConfig | undefined {
  return STAGE_CONFIGS.find((s) => s.stage === stage);
}

export function getAllStageConfigs(): StageConfig[] {
  return [...STAGE_CONFIGS];
}

export function getStagesInOrder(): PipelineStage[] {
  return STAGE_CONFIGS.map((s) => s.stage);
}

export function getNextStage(current: PipelineStage): PipelineStage | null {
  const stages = getStagesInOrder();
  const idx = stages.indexOf(current);
  if (idx === -1 || idx === stages.length - 1) return null;
  return stages[idx + 1];
}

export function getPreviousStage(current: PipelineStage): PipelineStage | null {
  const stages = getStagesInOrder();
  const idx = stages.indexOf(current);
  if (idx <= 0) return null;
  return stages[idx - 1];
}

export function isTerminalStage(stage: PipelineStage): boolean {
  return stage === PipelineStage.DEPLOYMENT || stage === PipelineStage.COMPLETED;
}
