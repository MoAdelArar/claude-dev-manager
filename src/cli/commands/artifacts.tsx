import React from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { colors } from '../utils/colors.js';
import { ArtifactStore } from '../../workspace/artifact-store.js';

export const options = z.object({
  project: z.string().default(process.cwd()).describe('Project path'),
  type: z.string().optional().describe('Filter by artifact type'),
  json: z.boolean().default(false).describe('Output as JSON'),
});

type Props = {
  options: z.infer<typeof options>;
};

export default function ArtifactsCommand({ options }: Props): React.ReactElement {
  const artifactStore = new ArtifactStore(options.project);
  const summary = artifactStore.getSummary();

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return <></>;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={colors.info}>📦 Artifacts</Text>
      <Text> </Text>
      <Text>Total: {summary.total}</Text>
      <Text> </Text>
      
      {summary.total === 0 ? (
        <Text color={colors.warning}>No artifacts yet. Run `cdm start` to produce artifacts.</Text>
      ) : (
        <>
          <Text bold>By Type:</Text>
          {Object.entries(summary.byType).map(([type, count]) => (
            <Text key={type}>  {type}: {count}</Text>
          ))}
          <Text> </Text>
          <Text bold>By Status:</Text>
          {Object.entries(summary.byStatus).map(([status, count]) => (
            <Text key={status}>  {status}: {count}</Text>
          ))}
        </>
      )}
    </Box>
  );
}

export const description = 'List all artifacts produced during development';
