import React from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { colors } from '../utils/colors.js';
import { ProjectContext } from '../../orchestrator/context.js';
import { DevelopmentTracker } from '../../tracker/development-tracker.js';
import { formatDuration, formatTokens, formatTime } from '../utils/format.js';

export const options = z.object({
  project: z.string().default(process.cwd()).describe('Project path'),
  feature: z.string().optional().describe('Filter by feature ID'),
  last: z.string().optional().describe('Show only the last N events'),
  export: z.boolean().default(false).describe('Export history to .cdm/history/ as markdown and JSON'),
  json: z.boolean().default(false).describe('Output as JSON'),
});

type Props = {
  options: z.infer<typeof options>;
};

export default function HistoryCommand({ options }: Props): React.ReactElement {
  const projectPath = options.project;
  const context = new ProjectContext(projectPath);
  const project = context.getProject();
  const tracker = new DevelopmentTracker(projectPath, project.id, project.name);

  const events = options.feature
    ? tracker.getEventsForFeature(options.feature)
    : tracker.getEvents();

  if (events.length === 0) {
    return (
      <Box padding={1}>
        <Text color={colors.warning}>No development history found. Run `cdm start` to generate events.</Text>
      </Box>
    );
  }

  if (options.export) {
    const { markdownPath, jsonPath } = tracker.saveHistory();
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={colors.success}>✅ History exported:</Text>
        <Text>  Markdown: {markdownPath}</Text>
        <Text>  JSON:     {jsonPath}</Text>
        <Text>  Events:   {events.length}</Text>
      </Box>
    );
  }

  const summary = tracker.buildSummary();

  if (options.json) {
    console.log(JSON.stringify({ summary, events }, null, 2));
    return <></>;
  }

  const lastN = options.last ? parseInt(options.last, 10) : 30;
  const displayEvents = events.slice(-lastN);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={colors.info}>📜 Development History: {project.name}</Text>
      <Text> </Text>
      
      <Text bold>Summary:</Text>
      <Box marginLeft={2} flexDirection="column">
        <Box>
          <Text>Features:     {summary.totalFeatures} (</Text>
          <Text color={colors.success}>{summary.completedFeatures}</Text>
          <Text> completed, </Text>
          <Text color={colors.error}>{summary.failedFeatures}</Text>
          <Text> failed)</Text>
        </Box>
        <Text>Executions:   {summary.totalExecutions}</Text>
        <Text>Artifacts:    {summary.totalArtifactsProduced}</Text>
        <Text>Issues:       {summary.totalIssuesFound} found, {summary.totalIssuesResolved} resolved</Text>
        <Text>Tokens:       {formatTokens(summary.totalTokensUsed)}</Text>
        <Text>Duration:     {formatDuration(summary.totalDurationMs)}</Text>
      </Box>

      {Object.keys(summary.personaUsage).length > 0 && (
        <>
          <Text> </Text>
          <Text bold>Persona Usage:</Text>
          <Box marginLeft={2} flexDirection="column">
            {Object.entries(summary.personaUsage).map(([personaId, data]) => (
              <Text key={personaId}>
                {personaId}: {data.executions} executions, {formatTokens(data.tokensUsed)} tokens, {formatDuration(data.durationMs)}
              </Text>
            ))}
          </Box>
        </>
      )}

      <Text> </Text>
      <Text bold>Timeline (last {displayEvents.length} events):</Text>
      <Box marginLeft={2} flexDirection="column">
        {displayEvents.map((event) => {
          const tokenStr = event.tokensUsed ? ` (${formatTokens(event.tokensUsed)} tok)` : '';
          const durStr = event.durationMs ? ` [${formatDuration(event.durationMs)}]` : '';
          const typeColor = event.type.includes('failed') ? colors.error
            : event.type.includes('completed') ? colors.success
            : event.type.includes('skipped') ? colors.warning
            : undefined;
          
          return (
            <Box key={event.id}>
              <Text color={colors.muted}>{formatTime(event.timestamp)} </Text>
              <Text color={typeColor}>{event.message}</Text>
              <Text color={colors.muted}>{tokenStr}{durStr}</Text>
            </Box>
          );
        })}
      </Box>

      {events.length > displayEvents.length && (
        <Text color={colors.muted}>
          ... {events.length - displayEvents.length} earlier events (use --last &lt;n&gt; to see more)
        </Text>
      )}

      <Text> </Text>
      <Text color={colors.muted}>Use --export to save full history as markdown and JSON.</Text>
    </Box>
  );
}

export const description = 'Show the development history timeline and metrics';
