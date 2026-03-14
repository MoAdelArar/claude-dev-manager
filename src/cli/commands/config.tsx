import React from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { colors } from '../utils/colors.js';
import { loadConfig, saveConfig, getDefaultConfig } from '../../utils/config.js';
import { formatAgentName } from '../utils/format.js';
import { AgentRole } from '../../types.js';
import { EXIT_CODES } from '../types.js';

export const options = z.object({
  project: z.string().default(process.cwd()).describe('Project path'),
  set: z.string().optional().describe('Set a configuration value (e.g. pipeline.maxRetries=3)'),
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
      <Text bold>Pipeline:</Text>
      <Box marginLeft={2} flexDirection="column">
        <Text>Max retries:    {config.pipeline.maxRetries}</Text>
        <Text>Timeout (min):  {config.pipeline.timeoutMinutes}</Text>
        <Text>Approvals:      {String(config.pipeline.requireApprovals)}</Text>
        <Text>Skip steps:     {config.pipeline.skipSteps.join(', ') || 'none'}</Text>
      </Box>
      
      <Text> </Text>
      <Text bold>Agents:</Text>
      <Box marginLeft={2} flexDirection="column">
        {Object.entries(config.agents).map(([role, override]) => {
          const status = override.enabled ? 'enabled' : 'disabled';
          const statusColor = override.enabled ? colors.success : colors.error;
          const extra = override.maxTokenBudget ? ` (budget: ${override.maxTokenBudget})` : '';
          return (
            <Box key={role}>
              <Text>{formatAgentName(role as AgentRole)}: </Text>
              <Text color={statusColor}>{status}</Text>
              <Text>{extra}</Text>
            </Box>
          );
        })}
      </Box>
      
      <Text> </Text>
      <Text color={colors.muted}>Use --set to modify values (e.g. cdm config --set pipeline.maxRetries=3)</Text>
    </Box>
  );
}

export const description = 'View or update CDM configuration';
