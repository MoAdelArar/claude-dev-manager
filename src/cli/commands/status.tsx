import React from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { colors } from '../utils/colors.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ProjectContext } from '../../orchestrator/context.js';
import { formatDate } from '../utils/format.js';

export const options = z.object({
  project: z.string().default(process.cwd()).describe('Project path'),
  json: z.boolean().default(false).describe('Output as JSON'),
});

type Props = {
  options: z.infer<typeof options>;
};

export default function StatusCommand({ options }: Props): React.ReactElement {
  const context = new ProjectContext(options.project);
  const features = context.getAllFeatures();

  if (features.length === 0) {
    return (
      <Box padding={1}>
        <Text color={colors.warning}>No features found. Run `cdm start` to begin.</Text>
      </Box>
    );
  }

  if (options.json) {
    const jsonFeatures = features.map((f) => ({
      id: f.id,
      name: f.name,
      status: f.status,
      currentStep: f.currentStep,
      createdAt: f.createdAt,
      artifactsCount: f.artifacts.length,
      issuesCount: f.issues.length,
      personas: f.personas,
    }));
    console.log(JSON.stringify(jsonFeatures, null, 2));
    return <></>;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={colors.info}>📊 Feature Status</Text>
      <Text> </Text>
      {features.map((feature) => (
        <Box key={feature.id} flexDirection="column" marginBottom={1} marginLeft={2}>
          <Box>
            <StatusBadge status={feature.status} showIcon={true} />
            <Text bold> {feature.name}</Text>
          </Box>
          <Box marginLeft={2} flexDirection="column">
            <Text color={colors.muted}>ID: {feature.id}</Text>
            <Text>Status: <StatusBadge status={feature.status} showIcon={false} /></Text>
            <Text>Step: {feature.currentStep}</Text>
            <Text>Created: {formatDate(feature.createdAt)}</Text>
            <Text>Artifacts: {feature.artifacts.length}</Text>
            <Text>Issues: {feature.issues.length}</Text>
            {feature.personas && (
              <Text>Persona: <Text color={colors.info}>{feature.personas.primary}</Text></Text>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export const description = 'Show the status of current features';
