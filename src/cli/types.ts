/**
 * CLI type definitions for CDM.
 * Refactored for dynamic persona system.
 */

import type {
  Feature,
  FeatureStatus,
  Artifact,
  ArtifactType,
  Issue,
  PipelineResult,
  Project,
} from '../types.js';

export type { Feature, FeatureStatus, Artifact, ArtifactType, Issue, PipelineResult, Project };

export interface PersonaInfo {
  id: string;
  name: string;
  emoji: string;
  division: string;
  description: string;
  tags: string[];
}

export interface CommandFlags {
  json?: boolean;
  verbose?: boolean;
  project?: string;
}

export interface StartFlags extends CommandFlags {
  priority?: string;
  persona?: string;
  review?: boolean;
  dryRun?: boolean;
  interactive?: boolean;
  mode?: string;
  model?: string;
  estimate?: boolean;
}

export interface ResumeFlags extends CommandFlags {
  review?: boolean;
  mode?: string;
  model?: string;
}

export interface PersonasFlags extends CommandFlags {
  division?: string;
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
  EXECUTION_FAILURE: 3,
  USER_INTERRUPT: 130,
} as const;

export type ExitCode = typeof EXIT_CODES[keyof typeof EXIT_CODES];
