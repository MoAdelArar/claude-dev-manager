/**
 * Core type definitions for the Claude Dev Manager multi-agent system.
 * These types define the contracts between all components.
 *
 * v2.0: Redesigned from 18 agents to 5 agents + 17 skills + adaptive pipeline.
 */

// ─── Agent Roles (5 broad agents) ─────────────────────────────────────────────

export enum AgentRole {
  PLANNER = 'planner',
  ARCHITECT = 'architect',
  DEVELOPER = 'developer',
  REVIEWER = 'reviewer',
  OPERATOR = 'operator',
}

export enum AgentStatus {
  IDLE = 'idle',
  WORKING = 'working',
  WAITING_FOR_INPUT = 'waiting_for_input',
  BLOCKED = 'blocked',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface AgentCapability {
  name: string;
  description: string;
  allowedTools: string[];
  filePatterns: string[];
}

export interface AgentConfig {
  role: AgentRole;
  name: string;
  title: string;
  description: string;
  systemPrompt: string;
  capabilities: AgentCapability[];
  maxTokenBudget: number;
  allowedFilePatterns: string[];
  blockedFilePatterns: string[];
  compatibleSkills: string[];
  requiredInputArtifacts: ArtifactType[];
  outputArtifacts: ArtifactType[];
}

// ─── Skills (composable prompt modules) ───────────────────────────────────────

export type SkillCategory = 'planning' | 'design' | 'build' | 'review' | 'operations';

export interface SkillProjectFilter {
  languages?: string[];
  hasUI?: boolean;
  hasAPI?: boolean;
  cloudProvider?: string[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  compatibleAgents: AgentRole[];
  promptTemplate: string;
  expectedArtifacts: ArtifactType[];
  requiredInputArtifacts?: ArtifactType[];
  projectFilter?: SkillProjectFilter;
}

// ─── Execution Plan (adaptive pipeline) ───────────────────────────────────────

export interface ExecutionStep {
  index: number;
  agent: AgentRole;
  skills: string[];
  description: string;
  dependsOn?: number[];
  canSkip?: boolean;
  gateCondition?: string;
}

export interface ExecutionPlan {
  id: string;
  taskType: string;
  templateId: string;
  steps: ExecutionStep[];
  reasoning: string;
}

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  steps: ExecutionStep[];
  applicableWhen: string;
}

export interface StepResult {
  stepIndex: number;
  agent: AgentRole;
  skills: string[];
  status: StepStatus;
  startedAt: Date;
  completedAt?: Date;
  artifacts: Artifact[];
  issues: Issue[];
  tokensUsed: number;
  durationMs: number;
}

export enum StepStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

// ─── Cloud Providers ──────────────────────────────────────────────────────────

export enum CloudProvider {
  AWS = 'aws',
  GCP = 'gcp',
  AZURE = 'azure',
  MULTI_CLOUD = 'multi_cloud',
  NONE = 'none',
}

// ─── Artifacts ────────────────────────────────────────────────────────────────

export enum ArtifactType {
  // Planning
  REQUIREMENTS_DOC = 'requirements_doc',
  USER_STORIES = 'user_stories',
  ACCEPTANCE_CRITERIA = 'acceptance_criteria',
  EXECUTION_PLAN = 'execution_plan',
  TASK_LIST = 'task_list',

  // Design
  ARCHITECTURE_DOC = 'architecture_doc',
  SYSTEM_DIAGRAM = 'system_diagram',
  API_SPEC = 'api_spec',
  DATA_MODEL = 'data_model',
  DATABASE_SCHEMA = 'database_schema',
  UI_SPEC = 'ui_spec',
  WIREFRAME = 'wireframe',
  COMPONENT_SPEC = 'component_spec',

  // Development
  SOURCE_CODE = 'source_code',
  UNIT_TESTS = 'unit_tests',
  INTEGRATION_TESTS = 'integration_tests',
  E2E_TESTS = 'e2e_tests',
  API_DOCUMENTATION = 'api_documentation',
  DEVELOPER_DOCUMENTATION = 'developer_documentation',
  USER_DOCUMENTATION = 'user_documentation',
  CHANGELOG = 'changelog',

  // Review
  CODE_REVIEW_REPORT = 'code_review_report',
  SECURITY_REPORT = 'security_report',
  PERFORMANCE_REPORT = 'performance_report',
  ACCESSIBILITY_REPORT = 'accessibility_report',
  TEST_REPORT = 'test_report',

  // Operations
  DEPLOYMENT_PLAN = 'deployment_plan',
  CI_CD_CONFIG = 'ci_cd_config',
  INFRASTRUCTURE_CONFIG = 'infrastructure_config',
  MONITORING_CONFIG = 'monitoring_config',
  RUNBOOK = 'runbook',
}

export interface Artifact {
  id: string;
  type: ArtifactType;
  name: string;
  description: string;
  filePath: string;
  createdBy: AgentRole;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  content: string;
  metadata: Record<string, unknown>;
  status: ArtifactStatus;
  reviewStatus: ReviewStatus;
}

export enum ArtifactStatus {
  DRAFT = 'draft',
  IN_REVIEW = 'in_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  FINAL = 'final',
}

export enum ReviewStatus {
  PENDING = 'pending',
  IN_REVIEW = 'in_review',
  APPROVED = 'approved',
  CHANGES_REQUESTED = 'changes_requested',
  REJECTED = 'rejected',
}

// ─── Communication ────────────────────────────────────────────────────────────

export enum MessageType {
  TASK_ASSIGNMENT = 'task_assignment',
  TASK_COMPLETION = 'task_completion',
  REVIEW_REQUEST = 'review_request',
  REVIEW_RESPONSE = 'review_response',
  QUESTION = 'question',
  ANSWER = 'answer',
  ESCALATION = 'escalation',
  STATUS_UPDATE = 'status_update',
  BLOCKER = 'blocker',
  ARTIFACT_HANDOFF = 'artifact_handoff',
  FEEDBACK = 'feedback',
  APPROVAL = 'approval',
  REJECTION = 'rejection',
}

export enum MessagePriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface AgentMessage {
  id: string;
  type: MessageType;
  from: AgentRole;
  to: AgentRole;
  subject: string;
  body: string;
  priority: MessagePriority;
  timestamp: Date;
  replyTo?: string;
  artifacts?: string[];
  metadata: Record<string, unknown>;
}

export interface HandoffPayload {
  fromAgent: AgentRole;
  toAgent: AgentRole;
  step: string;
  context: string;
  artifacts: Artifact[];
  instructions: string;
  constraints: string[];
  previousFeedback?: string[];
}

// ─── Project & Feature ────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string;
  rootPath: string;
  createdAt: Date;
  updatedAt: Date;
  config: ProjectConfig;
  features: Feature[];
}

export interface ProjectConfig {
  language: string;
  framework: string;
  testFramework: string;
  buildTool: string;
  ciProvider: string;
  deployTarget: string;
  cloudProvider: CloudProvider;
  codeStyle: string;
  branchStrategy: string;
  customInstructions: string;
}

export interface Feature {
  id: string;
  projectId: string;
  name: string;
  description: string;
  requestedBy: string;
  createdAt: Date;
  updatedAt: Date;
  currentStep: string;
  currentStepIndex?: number;
  executionPlan?: ExecutionPlan;
  stepResults: Map<number, StepResult>;
  artifacts: Artifact[];
  issues: Issue[];
  status: FeatureStatus;
  priority: FeaturePriority;
  metadata: Record<string, unknown>;
}

export enum FeatureStatus {
  DRAFT = 'draft',
  IN_PROGRESS = 'in_progress',
  ON_HOLD = 'on_hold',
  IN_REVIEW = 'in_review',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum FeaturePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// ─── Issues ───────────────────────────────────────────────────────────────────

export interface Issue {
  id: string;
  featureId: string;
  type: IssueType;
  severity: IssueSeverity;
  title: string;
  description: string;
  reportedBy: AgentRole;
  assignedTo?: AgentRole;
  step: string;
  stepIndex?: number;
  status: IssueStatus;
  createdAt: Date;
  resolvedAt?: Date;
  resolution?: string;
}

export enum IssueType {
  BUG = 'bug',
  DESIGN_FLAW = 'design_flaw',
  SECURITY_VULNERABILITY = 'security_vulnerability',
  PERFORMANCE = 'performance',
  CODE_QUALITY = 'code_quality',
  MISSING_TEST = 'missing_test',
  DOCUMENTATION_GAP = 'documentation_gap',
  DEPENDENCY_ISSUE = 'dependency_issue',
  ARCHITECTURE_CONCERN = 'architecture_concern',
  ACCESSIBILITY_VIOLATION = 'accessibility_violation',
  SCALABILITY = 'scalability',
  OBSERVABILITY = 'observability',
  RELIABILITY = 'reliability',
  COST_OPTIMIZATION = 'cost_optimization',
  COMPLIANCE_VIOLATION = 'compliance_violation',
  DATA_PRIVACY_CONCERN = 'data_privacy_concern',
}

export enum IssueSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum IssueStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  WONT_FIX = 'wont_fix',
  DEFERRED = 'deferred',
}

// ─── Agent Execution ──────────────────────────────────────────────────────────

export interface AgentResult {
  agentRole: AgentRole;
  skills?: string[];
  status: 'success' | 'failure' | 'partial';
  output: string;
  artifacts: Artifact[];
  issues: Issue[];
  tokensUsed: number;
  durationMs: number;
  metadata: Record<string, unknown>;
}

export interface AgentTask {
  id: string;
  featureId: string;
  step: string;
  stepIndex?: number;
  assignedTo: AgentRole;
  activeSkills?: string[];
  title: string;
  description: string;
  instructions: string;
  inputArtifacts: Artifact[];
  expectedOutputs: ArtifactType[];
  constraints: string[];
  priority: MessagePriority;
  status: AgentStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: AgentResult;
}

// ─── Development Tracking ─────────────────────────────────────────────────────

export enum TrackingEventType {
  FEATURE_CREATED = 'feature_created',
  PIPELINE_STARTED = 'pipeline_started',
  PIPELINE_COMPLETED = 'pipeline_completed',
  PIPELINE_FAILED = 'pipeline_failed',
  STEP_STARTED = 'step_started',
  STEP_COMPLETED = 'step_completed',
  STEP_FAILED = 'step_failed',
  STEP_SKIPPED = 'step_skipped',
  STEP_RETRIED = 'step_retried',
  AGENT_TASK_STARTED = 'agent_task_started',
  AGENT_TASK_COMPLETED = 'agent_task_completed',
  AGENT_TASK_FAILED = 'agent_task_failed',
  ARTIFACT_PRODUCED = 'artifact_produced',
  ISSUE_FOUND = 'issue_found',
  ISSUE_RESOLVED = 'issue_resolved',
  GATE_EVALUATED = 'gate_evaluated',
  HANDOFF_COMPLETED = 'handoff_completed',
  CONFIG_CHANGED = 'config_changed',
  ANALYSIS_GENERATED = 'analysis_generated',
}

export interface TrackingEvent {
  id: string;
  timestamp: Date;
  type: TrackingEventType;
  featureId?: string;
  featureName?: string;
  step?: string;
  stepIndex?: number;
  agentRole?: AgentRole;
  skills?: string[];
  message: string;
  details: Record<string, unknown>;
  durationMs?: number;
  tokensUsed?: number;
}

export interface DevelopmentHistory {
  projectId: string;
  projectName: string;
  generatedAt: string;
  events: TrackingEvent[];
  summary: HistorySummary;
}

export interface HistorySummary {
  totalFeatures: number;
  completedFeatures: number;
  failedFeatures: number;
  totalStepsExecuted: number;
  totalArtifactsProduced: number;
  totalIssuesFound: number;
  totalIssuesResolved: number;
  totalTokensUsed: number;
  totalDurationMs: number;
  agentActivity: Record<string, { tasks: number; tokensUsed: number; durationMs: number }>;
  stepMetrics: Record<string, { runs: number; avgDurationMs: number; avgTokens: number; failureRate: number }>;
  templateUsage: Record<string, number>;
}

// ─── CLI Types ────────────────────────────────────────────────────────────────

export interface CLIOptions {
  projectPath: string;
  verbose: boolean;
  dryRun: boolean;
  template?: string;
  skipSteps: string[];
  maxBudget: number;
  interactive: boolean;
  outputFormat: 'text' | 'json' | 'markdown';
  rtkEnabled: boolean;
  rtkPath: string;
}

export interface CLIContext {
  project: Project;
  feature: Feature;
  options: CLIOptions;
  startTime: Date;
}

// ─── Pipeline Result ──────────────────────────────────────────────────────────

export interface PipelineResult {
  featureId: string;
  success: boolean;
  templateUsed: string;
  stepsCompleted: number[];
  stepsFailed: number[];
  stepsSkipped: number[];
  totalTokensUsed: number;
  totalDurationMs: number;
  artifacts: Artifact[];
  issues: Issue[];
  executionMode: string;
}
