import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import {
  type ProjectConfig,
  type CLIOptions,
  AgentRole,
  CloudProvider,
} from '../types';

const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  language: 'auto',
  framework: 'auto',
  testFramework: 'auto',
  buildTool: 'auto',
  ciProvider: 'auto',
  deployTarget: 'auto',
  cloudProvider: CloudProvider.NONE,
  codeStyle: 'standard',
  branchStrategy: 'auto',
  customInstructions: '',
};

const DEFAULT_CLI_OPTIONS: CLIOptions = {
  projectPath: process.cwd(),
  verbose: false,
  dryRun: false,
  skipSteps: [],
  maxBudget: 100000,
  interactive: true,
  outputFormat: 'text',
  rtkEnabled: true,
  rtkPath: 'rtk',
};

const CONFIG_FILE_NAMES = [
  'cdm.config.yaml',
  'cdm.config.yml',
  'cdm.config.json',
  '.cdmrc',
];

export interface CDMConfig {
  project: ProjectConfig;
  pipeline: PipelineConfig;
  agents: AgentOverrides;
  skills: SkillOverrides;
  cli: Partial<CLIOptions>;
}

export interface PipelineConfig {
  defaultTemplate: string;
  skipSteps: string[];
  maxRetries: number;
  timeoutMinutes: number;
  requireApprovals: boolean;
  parallelExecution: boolean;
}

export interface AgentOverrides {
  [key: string]: {
    enabled: boolean;
    maxTokenBudget?: number;
    customInstructions?: string;
  };
}

export interface SkillOverrides {
  [skillId: string]: {
    enabled: boolean;
    customPromptAdditions?: string;
  };
}

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  defaultTemplate: 'auto',
  skipSteps: [],
  maxRetries: 2,
  timeoutMinutes: 30,
  requireApprovals: false,
  parallelExecution: false,
};

const DEFAULT_AGENT_OVERRIDES: AgentOverrides = Object.fromEntries(
  Object.values(AgentRole).map((role) => [role, { enabled: true }]),
);

const DEFAULT_SKILL_OVERRIDES: SkillOverrides = {};

export function loadConfig(projectPath: string): CDMConfig {
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = path.join(projectPath, fileName);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = fileName.endsWith('.json')
        ? JSON.parse(content)
        : yaml.parse(content);
      return mergeWithDefaults(parsed);
    }
  }
  return getDefaultConfig();
}

export function getDefaultConfig(): CDMConfig {
  return {
    project: { ...DEFAULT_PROJECT_CONFIG },
    pipeline: { ...DEFAULT_PIPELINE_CONFIG },
    agents: { ...DEFAULT_AGENT_OVERRIDES },
    skills: { ...DEFAULT_SKILL_OVERRIDES },
    cli: { ...DEFAULT_CLI_OPTIONS },
  };
}

function mergeWithDefaults(partial: Partial<CDMConfig>): CDMConfig {
  return {
    project: { ...DEFAULT_PROJECT_CONFIG, ...partial.project },
    pipeline: { ...DEFAULT_PIPELINE_CONFIG, ...partial.pipeline },
    agents: { ...DEFAULT_AGENT_OVERRIDES, ...partial.agents },
    skills: { ...DEFAULT_SKILL_OVERRIDES, ...partial.skills },
    cli: { ...DEFAULT_CLI_OPTIONS, ...partial.cli },
  };
}

export function saveConfig(projectPath: string, config: CDMConfig): void {
  const filePath = path.join(projectPath, 'cdm.config.yaml');
  const content = yaml.stringify(config);
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function resolveOptions(
  cliArgs: Partial<CLIOptions>,
  config: CDMConfig,
): CLIOptions {
  return {
    ...DEFAULT_CLI_OPTIONS,
    ...config.cli,
    ...cliArgs,
  };
}
