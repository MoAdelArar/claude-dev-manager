import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import {
  type ProjectConfig,
  type CLIOptions,
  PipelineStage,
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
  skipStages: [],
  maxBudget: 100000,
  interactive: true,
  outputFormat: 'text',
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
  cli: Partial<CLIOptions>;
}

export interface PipelineConfig {
  stages: PipelineStage[];
  skipStages: PipelineStage[];
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

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  stages: [
    PipelineStage.REQUIREMENTS_GATHERING,
    PipelineStage.ARCHITECTURE_DESIGN,
    PipelineStage.UI_UX_DESIGN,
    PipelineStage.TASK_BREAKDOWN,
    PipelineStage.IMPLEMENTATION,
    PipelineStage.CODE_REVIEW,
    PipelineStage.TESTING,
    PipelineStage.SECURITY_REVIEW,
    PipelineStage.DOCUMENTATION,
    PipelineStage.DEPLOYMENT,
  ],
  skipStages: [],
  maxRetries: 2,
  timeoutMinutes: 30,
  requireApprovals: false,
  parallelExecution: false,
};

const DEFAULT_AGENT_OVERRIDES: AgentOverrides = Object.fromEntries(
  Object.values(AgentRole).map((role) => [role, { enabled: true }]),
);

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
    cli: { ...DEFAULT_CLI_OPTIONS },
  };
}

function mergeWithDefaults(partial: Partial<CDMConfig>): CDMConfig {
  return {
    project: { ...DEFAULT_PROJECT_CONFIG, ...partial.project },
    pipeline: { ...DEFAULT_PIPELINE_CONFIG, ...partial.pipeline },
    agents: { ...DEFAULT_AGENT_OVERRIDES, ...partial.agents },
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
