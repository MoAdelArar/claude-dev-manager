/**
 * Type definitions for the dynamic persona system.
 * Personas are fetched from msitarzewski/agency-agents repo.
 */

export interface PersonaFrontmatter {
  name: string;
  description: string;
  color: string;
  emoji: string;
  vibe: string;
}

export interface AgentPersona {
  id: string;
  division: string;
  frontmatter: PersonaFrontmatter;
  fullContent: string;
  tags: string[];
  filePath: string;
}

export interface PersonaCatalogData {
  personas: AgentPersona[];
  divisions: string[];
  lastUpdated: string;
  sourceRepo: string;
  sourceCommit: string;
}

export interface ResolvedPersonas {
  primary: AgentPersona;
  supporting: AgentPersona[];
  reviewLens: AgentPersona[];
  reason: string;
  needsReviewPass: boolean;
}

export interface PersonasConfig {
  source: 'github' | 'local';
  repo: string;
  branch: string;
  divisions: string[];
  autoResolve: boolean;
  overrides: Record<string, string>;
}

export interface ExecutionConfig {
  mode: 'dynamic';
  reviewPass: 'auto' | 'always' | 'never';
  model?: string;
  maxTokens?: number;
  timeout?: number;
  maxRetries: number;
  timeoutMinutes: number;
  defaultMode: 'claude-cli' | 'simulation';
}

export const DEFAULT_PERSONAS_CONFIG: PersonasConfig = {
  source: 'github',
  repo: 'msitarzewski/agency-agents',
  branch: 'main',
  divisions: [
    'engineering',
    'design',
    'testing',
    'product',
    'project-management',
    'support',
    'specialized',
  ],
  autoResolve: true,
  overrides: {},
};

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  mode: 'dynamic',
  reviewPass: 'auto',
  timeout: 600,
  maxRetries: 2,
  timeoutMinutes: 120,
  defaultMode: 'claude-cli',
};

export interface PersonaMatchScore {
  persona: AgentPersona;
  score: number;
  reasons: string[];
}

export interface SignalExtraction {
  frameworks: string[];
  domains: string[];
  actions: string[];
  risks: string[];
  keywords: string[];
}
