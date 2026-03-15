/**
 * Configuration management for CDM.
 * v3.0: Refactored for dynamic persona system.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { type ProjectConfig, type CLIOptions, CloudProvider } from '../types';
import {
  type PersonasConfig,
  type ExecutionConfig,
  DEFAULT_PERSONAS_CONFIG,
  DEFAULT_EXECUTION_CONFIG,
} from '../personas/types';

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
  review: false,
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
  execution: ExecutionConfig;
  personas: PersonasConfig;
  cli: Partial<CLIOptions>;
}

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
    execution: { ...DEFAULT_EXECUTION_CONFIG },
    personas: { ...DEFAULT_PERSONAS_CONFIG },
    cli: { ...DEFAULT_CLI_OPTIONS },
  };
}

function mergeWithDefaults(partial: Partial<CDMConfig>): CDMConfig {
  return {
    project: { ...DEFAULT_PROJECT_CONFIG, ...partial.project },
    execution: { ...DEFAULT_EXECUTION_CONFIG, ...partial.execution },
    personas: { ...DEFAULT_PERSONAS_CONFIG, ...partial.personas },
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

export function getDefaultCLIOptions(): CLIOptions {
  return { ...DEFAULT_CLI_OPTIONS };
}

export function getDefaultProjectConfig(): ProjectConfig {
  return { ...DEFAULT_PROJECT_CONFIG };
}
