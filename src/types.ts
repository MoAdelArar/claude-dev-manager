/**
 * Core type definitions for the Claude Dev Manager multi-agent system.
 * These types define the contracts between all components.
 */

// ─── Agent Roles ─────────────────────────────────────────────────────────────

export enum AgentRole {
  PRODUCT_MANAGER = 'product_manager',
  ENGINEERING_MANAGER = 'engineering_manager',
  SYSTEM_ARCHITECT = 'system_architect',
  UI_DESIGNER = 'ui_designer',
  SENIOR_DEVELOPER = 'senior_developer',
  JUNIOR_DEVELOPER = 'junior_developer',
  CODE_REVIEWER = 'code_reviewer',
  QA_ENGINEER = 'qa_engineer',
  SECURITY_ENGINEER = 'security_engineer',
  DEVOPS_ENGINEER = 'devops_engineer',
  DOCUMENTATION_WRITER = 'documentation_writer',
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
  reportsTo: AgentRole | null;
  directReports: AgentRole[];
  requiredInputArtifacts: ArtifactType[];
  outputArtifacts: ArtifactType[];
}

// ─── Pipeline Stages ─────────────────────────────────────────────────────────

export enum PipelineStage {
  REQUIREMENTS_GATHERING = 'requirements_gathering',
  ARCHITECTURE_DESIGN = 'architecture_design',
  UI_UX_DESIGN = 'ui_ux_design',
  TASK_BREAKDOWN = 'task_breakdown',
  IMPLEMENTATION = 'implementation',
  CODE_REVIEW = 'code_review',
  TESTING = 'testing',
  SECURITY_REVIEW = 'security_review',
  DOCUMENTATION = 'documentation',
  DEPLOYMENT = 'deployment',
  COMPLETED = 'completed',
}

export enum StageStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  AWAITING_REVIEW = 'awaiting_review',
  REVISION_NEEDED = 'revision_needed',
  APPROVED = 'approved',
  SKIPPED = 'skipped',
  FAILED = 'failed',
}

export interface StageConfig {
  stage: PipelineStage;
  name: string;
  description: string;
  primaryAgent: AgentRole;
  supportingAgents: AgentRole[];
  reviewers: AgentRole[];
  requiredArtifacts: ArtifactType[];
  producedArtifacts: ArtifactType[];
  canBeSkipped: boolean;
  maxRetries: number;
  timeoutMinutes: number;
  gateConditions: GateCondition[];
}

export interface GateCondition {
  name: string;
  description: string;
  validator: string;
  required: boolean;
}

export interface StageTransition {
  from: PipelineStage;
  to: PipelineStage;
  conditions: string[];
  requiredApprovals: AgentRole[];
}

export interface StageResult {
  stage: PipelineStage;
  status: StageStatus;
  startedAt: Date;
  completedAt?: Date;
  agentResults: AgentResult[];
  artifacts: Artifact[];
  issues: Issue[];
  metrics: StageMetrics;
}

export interface StageMetrics {
  tokensUsed: number;
  durationMs: number;
  retryCount: number;
  artifactsProduced: number;
  issuesFound: number;
  issuesResolved: number;
}

// ─── Artifacts ───────────────────────────────────────────────────────────────

export enum ArtifactType {
  REQUIREMENTS_DOC = 'requirements_doc',
  USER_STORIES = 'user_stories',
  ACCEPTANCE_CRITERIA = 'acceptance_criteria',
  ARCHITECTURE_DOC = 'architecture_doc',
  SYSTEM_DIAGRAM = 'system_diagram',
  API_SPEC = 'api_spec',
  DATA_MODEL = 'data_model',
  UI_SPEC = 'ui_spec',
  WIREFRAME = 'wireframe',
  COMPONENT_SPEC = 'component_spec',
  TASK_LIST = 'task_list',
  SPRINT_PLAN = 'sprint_plan',
  SOURCE_CODE = 'source_code',
  UNIT_TESTS = 'unit_tests',
  INTEGRATION_TESTS = 'integration_tests',
  E2E_TESTS = 'e2e_tests',
  TEST_PLAN = 'test_plan',
  TEST_REPORT = 'test_report',
  CODE_REVIEW_REPORT = 'code_review_report',
  SECURITY_REPORT = 'security_report',
  DEPLOYMENT_PLAN = 'deployment_plan',
  INFRASTRUCTURE_CONFIG = 'infrastructure_config',
  CI_CD_CONFIG = 'ci_cd_config',
  API_DOCUMENTATION = 'api_documentation',
  USER_DOCUMENTATION = 'user_documentation',
  DEVELOPER_DOCUMENTATION = 'developer_documentation',
  CHANGELOG = 'changelog',
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

// ─── Communication ───────────────────────────────────────────────────────────

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
  stage: PipelineStage;
  context: string;
  artifacts: Artifact[];
  instructions: string;
  constraints: string[];
  previousFeedback?: string[];
}

// ─── Project & Feature ───────────────────────────────────────────────────────

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
  currentStage: PipelineStage;
  stageResults: Map<PipelineStage, StageResult>;
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

// ─── Issues & Tracking ───────────────────────────────────────────────────────

export interface Issue {
  id: string;
  featureId: string;
  type: IssueType;
  severity: IssueSeverity;
  title: string;
  description: string;
  reportedBy: AgentRole;
  assignedTo?: AgentRole;
  stage: PipelineStage;
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

// ─── Agent Execution ─────────────────────────────────────────────────────────

export interface AgentResult {
  agentRole: AgentRole;
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
  stage: PipelineStage;
  assignedTo: AgentRole;
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

// ─── CLI Types ───────────────────────────────────────────────────────────────

export interface CLIOptions {
  projectPath: string;
  verbose: boolean;
  dryRun: boolean;
  skipStages: PipelineStage[];
  maxBudget: number;
  interactive: boolean;
  outputFormat: 'text' | 'json' | 'markdown';
}

export interface CLIContext {
  project: Project;
  feature: Feature;
  options: CLIOptions;
  startTime: Date;
}
