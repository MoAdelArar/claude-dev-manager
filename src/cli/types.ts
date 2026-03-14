import type {
  AgentRole,
  Feature,
  FeatureStatus,
  Artifact,
  ArtifactType,
  Issue,
  PipelineResult,
  Project,
  ExecutionStep,
  StepStatus,
  Skill,
  SkillCategory,
} from '../types.js';

export type { AgentRole, Feature, FeatureStatus, Artifact, ArtifactType, Issue, PipelineResult, Project, ExecutionStep, StepStatus, Skill, SkillCategory };

export interface AgentInfo {
  role: AgentRole;
  icon: string;
  title: string;
  description: string;
  skills: string[];
}

export interface SkillInfo {
  id: string;
  name: string;
  category: SkillCategory;
  agents: string[];
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  steps: string[];
}

export interface PipelineStepUI {
  index: number;
  description: string;
  status: StepStatus;
  agent: AgentRole;
  skills: string[];
}

export interface CommandFlags {
  json?: boolean;
  verbose?: boolean;
  project?: string;
}

export interface StartFlags extends CommandFlags {
  priority?: string;
  template?: string;
  skipSteps?: string;
  maxRetries?: string;
  dryRun?: boolean;
  interactive?: boolean;
  mode?: string;
  model?: string;
}

export interface ResumeFlags extends CommandFlags {
  skipSteps?: string;
  maxRetries?: string;
  mode?: string;
  model?: string;
}

export interface SkillsFlags extends CommandFlags {
  category?: string;
}

export interface PipelineFlags extends CommandFlags {
  template?: string;
}

export interface ConfigFlags extends CommandFlags {
  set?: string;
  reset?: boolean;
}

export interface AnalyzeFlags extends CommandFlags {
  output?: string;
}

export interface HistoryFlags extends CommandFlags {
  feature?: string;
  last?: string;
  export?: boolean;
}

export interface ArtifactsFlags extends CommandFlags {
  type?: string;
}

export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_ARGS: 2,
  PIPELINE_FAILURE: 3,
  USER_INTERRUPT: 130,
} as const;

export type ExitCode = typeof EXIT_CODES[keyof typeof EXIT_CODES];
