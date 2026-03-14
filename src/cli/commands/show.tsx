import React from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { colors } from '../utils/colors.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ArtifactStore } from '../../workspace/artifact-store.js';
import { ProjectContext } from '../../orchestrator/context.js';
import { formatDate } from '../utils/format.js';
import { getSeverityColor } from '../utils/colors.js';

export const args = z.tuple([
  z.string().describe('Artifact ID, artifact name, or feature ID to display'),
]);

export const options = z.object({
  project: z.string().default(process.cwd()).describe('Project path'),
  json: z.boolean().default(false).describe('Output as JSON'),
});

type Props = {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
};

export default function ShowCommand({ args, options }: Props): React.ReactElement {
  const [target] = args;
  const artifactStore = new ArtifactStore(options.project);
  const context = new ProjectContext(options.project);

  const artifact = artifactStore.getById(target) ?? artifactStore.getByName(target);
  
  if (artifact) {
    if (options.json) {
      console.log(JSON.stringify(artifact, null, 2));
      return <></>;
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={colors.info}>📄 Artifact: {artifact.name}</Text>
        <Text> </Text>
        <Box marginLeft={2} flexDirection="column">
          <Text color={colors.muted}>ID:          {artifact.id}</Text>
          <Text>Type:        {artifact.type}</Text>
          <Text>Status:      <StatusBadge status={artifact.status} showIcon={false} /></Text>
          <Text>Review:      <StatusBadge status={artifact.reviewStatus} showIcon={false} /></Text>
          <Text>Created by:  {artifact.createdBy}</Text>
          <Text>Version:     {artifact.version}</Text>
          <Text>Path:        {artifact.filePath}</Text>
          <Text>Created:     {formatDate(artifact.createdAt)}</Text>
        </Box>
        <Text> </Text>
        <Text color={colors.muted}>{'─'.repeat(60)}</Text>
        <Text> </Text>
        <Text>{artifact.content}</Text>
      </Box>
    );
  }

  const feature = context.getFeature(target);
  
  if (feature) {
    if (options.json) {
      const jsonFeature = {
        ...feature,
        stepResults: Object.fromEntries(feature.stepResults),
      };
      console.log(JSON.stringify(jsonFeature, null, 2));
      return <></>;
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={colors.info}>📋 Feature: {feature.name}</Text>
        <Text> </Text>
        <Box marginLeft={2} flexDirection="column">
          <Text color={colors.muted}>ID:       {feature.id}</Text>
          <Text>Status:   <StatusBadge status={feature.status} showIcon={false} /></Text>
          <Text>Step:     {feature.currentStep}</Text>
          <Text>Priority: {feature.priority}</Text>
          <Text>Created:  {formatDate(feature.createdAt)}</Text>
        </Box>

        {feature.artifacts.length > 0 && (
          <>
            <Text> </Text>
            <Text bold>  Artifacts:</Text>
            {feature.artifacts.map((a) => (
              <Text key={a.id}>    - {a.name} ({a.type}) [<StatusBadge status={a.status} showIcon={false} />]</Text>
            ))}
          </>
        )}

        {feature.issues.length > 0 && (
          <>
            <Text> </Text>
            <Text bold>  Issues:</Text>
            {feature.issues.map((i) => (
              <Box key={i.id}>
                <Text>    - </Text>
                <Text color={getSeverityColor(i.severity)}>[{i.severity}]</Text>
                <Text> {i.title}</Text>
              </Box>
            ))}
          </>
        )}

        {feature.stepResults.size > 0 && (
          <>
            <Text> </Text>
            <Text bold>  Step History:</Text>
            {Array.from(feature.stepResults.entries()).map(([stepIndex, result]) => {
              const statusIcon = result.status === 'completed' ? '✓' : result.status === 'failed' ? '✗' : '~';
              const statusColor = result.status === 'completed' ? colors.success : result.status === 'failed' ? colors.error : colors.warning;
              return (
                <Box key={stepIndex}>
                  <Text color={statusColor}>    {statusIcon}</Text>
                  <Text> Step {stepIndex}: {result.skills.join(', ')} — {result.status} ({result.artifacts.length} artifacts, {result.issues.length} issues)</Text>
                </Box>
              );
            })}
          </>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text color={colors.warning}>No artifact or feature found matching "{target}".</Text>
      <Text color={colors.muted}>Use `cdm artifacts` to list artifacts or `cdm status` to list features.</Text>
    </Box>
  );
}

export const description = 'Show details of a specific artifact or feature';
