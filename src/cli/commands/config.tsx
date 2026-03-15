import React from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { colors } from '../utils/colors.js';
import { loadConfig, saveConfig, getDefaultConfig } from '../../utils/config.js';
import { EXIT_CODES } from '../types.js';

export const options = z.object({
  project: z.string().default(process.cwd()).describe('Project path'),
  set: z.string().optional().describe('Set a configuration value (e.g. execution.maxRetries=3)'),
  reset: z.boolean().default(false).describe('Reset configuration to defaults'),
  json: z.boolean().default(false).describe('Output as JSON'),
});

type Props = {
  options: z.infer<typeof options>;
};

function setNestedValue(obj: Record<string, unknown>, keyPath: string, value: unknown): void {
  const keys = keyPath.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

function parseConfigValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;
  return value;
}

export default function ConfigCommand({ options }: Props): React.ReactElement {
  const projectPath = options.project;

  if (options.reset) {
    const config = getDefaultConfig();
    saveConfig(projectPath, config);
    return (
      <Box padding={1}>
        <Text color={colors.success}>✅ Configuration reset to defaults.</Text>
      </Box>
    );
  }

  if (options.set) {
    const config = loadConfig(projectPath);
    const [keyPath, value] = options.set.split('=');
    if (!keyPath || value === undefined) {
      console.error('Invalid format. Use --set key.path=value');
      process.exit(EXIT_CODES.INVALID_ARGS);
    }
    setNestedValue(config as unknown as Record<string, unknown>, keyPath, parseConfigValue(value));
    saveConfig(projectPath, config);
    return (
      <Box padding={1}>
        <Text color={colors.success}>✅ Set {keyPath} = {value}</Text>
      </Box>
    );
  }

  const config = loadConfig(projectPath);

  if (options.json) {
    console.log(JSON.stringify(config, null, 2));
    return <></>;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={colors.info}>⚙️  CDM Configuration</Text>
      <Text> </Text>
      
      <Text bold>Project:</Text>
      <Box marginLeft={2} flexDirection="column">
        <Text>Language:       {config.project.language}</Text>
        <Text>Framework:      {config.project.framework}</Text>
        <Text>Test framework: {config.project.testFramework}</Text>
        <Text>Build tool:     {config.project.buildTool}</Text>
        <Text>CI provider:    {config.project.ciProvider}</Text>
        <Text>Deploy target:  {config.project.deployTarget}</Text>
      </Box>
      
      <Text> </Text>
      <Text bold>Execution:</Text>
      <Box marginLeft={2} flexDirection="column">
        <Text>Max retries:    {config.execution.maxRetries}</Text>
        <Text>Timeout (min):  {config.execution.timeoutMinutes}</Text>
        <Text>Default mode:   {config.execution.defaultMode}</Text>
      </Box>
      
      <Text> </Text>
      <Text bold>Personas:</Text>
      <Box marginLeft={2} flexDirection="column">
        <Text>Divisions:      {config.personas.divisions.join(', ')}</Text>
        <Text>Overrides:      {Object.keys(config.personas.overrides).length > 0 
          ? Object.entries(config.personas.overrides).map(([k, v]) => `${k}=${v}`).join(', ')
          : 'none'}</Text>
      </Box>
      
      <Text> </Text>
      <Text color={colors.muted}>Use --set to modify values (e.g. cdm config --set execution.maxRetries=3)</Text>
    </Box>
  );
}

export const description = 'View or update CDM configuration';
