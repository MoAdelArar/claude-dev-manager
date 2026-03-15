/**
 * Core type definitions for the Claude Dev Manager.
 * v3.0: Dynamic persona system - fetches specialized personas from agency-agents repo.
 */

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
  createdBy: string;
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
  personas?: ResolvedPersonasRef;
  artifacts: Artifact[];
  issues: Issue[];
  status: FeatureStatus;
  priority: FeaturePriority;
  metadata: Record<string, unknown>;
}

export interface ResolvedPersonasRef {
  primary: string;
  supporting: string[];
  reviewLens: string[];
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
  reportedBy: string;
  assignedTo?: string;
  step: string;
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

// ─── Development Tracking ─────────────────────────────────────────────────────

export enum TrackingEventType {
  FEATURE_CREATED = 'feature_created',
  EXECUTION_STARTED = 'execution_started',
  EXECUTION_COMPLETED = 'execution_completed',
  EXECUTION_FAILED = 'execution_failed',
  REVIEW_PASS_STARTED = 'review_pass_started',
  REVIEW_PASS_COMPLETED = 'review_pass_completed',
  ARTIFACT_PRODUCED = 'artifact_produced',
  ISSUE_FOUND = 'issue_found',
  ISSUE_RESOLVED = 'issue_resolved',
  CONFIG_CHANGED = 'config_changed',
  ANALYSIS_GENERATED = 'analysis_generated',
  PERSONAS_FETCHED = 'personas_fetched',
  PERSONAS_RESOLVED = 'personas_resolved',
}

export interface TrackingEvent {
  id: string;
  timestamp: Date;
  type: TrackingEventType;
  featureId?: string;
  featureName?: string;
  personaId?: string;
  personaIds?: string[];
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
  totalExecutions: number;
  totalArtifactsProduced: number;
  totalIssuesFound: number;
  totalIssuesResolved: number;
  totalTokensUsed: number;
  totalDurationMs: number;
  personaUsage: Record<string, { executions: number; tokensUsed: number; durationMs: number }>;
}

// ─── CLI Types ────────────────────────────────────────────────────────────────

export interface CLIOptions {
  projectPath: string;
  verbose: boolean;
  dryRun: boolean;
  persona?: string;
  review: boolean;
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

// ─── Dynamic Execution Result ─────────────────────────────────────────────────

export interface DynamicResult {
  featureId: string;
  success: boolean;
  personas: ResolvedPersonasRef;
  output: string;
  reviewOutput?: string;
  artifacts: Artifact[];
  issues: Issue[];
  totalTokensUsed: number;
  totalDurationMs: number;
  hadReviewPass: boolean;
  executionMode: string;
}

export type PipelineResult = DynamicResult;
