import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../utils/colors.js';
import { formatAgentName, getAgentIcon } from '../utils/format.js';
import type { AgentRole } from '../../types.js';

export interface StreamingLine {
  id: string;
  type: 'agent' | 'file' | 'test' | 'progress';
  agent?: AgentRole;
  content: string;
  timestamp: Date;
}

export interface FileChange {
  path: string;
  type: 'created' | 'modified';
  linesChanged?: number;
}

export interface TestResults {
  passed: number;
  failed: number;
  total: number;
}

interface StreamingOutputProps {
  lines: StreamingLine[];
  fileChanges: FileChange[];
  testResults?: TestResults;
  maxLines?: number;
}

export function StreamingOutput({
  lines,
  fileChanges,
  testResults,
  maxLines = 10,
}: StreamingOutputProps): React.ReactElement {
  const visibleLines = lines.slice(-maxLines);

  return (
    <Box flexDirection="column">
      {visibleLines.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={colors.muted}>Agent Output:</Text>
          <Box marginLeft={2} flexDirection="column">
            {visibleLines.map((line) => (
              <StreamingLineDisplay key={line.id} line={line} />
            ))}
          </Box>
        </Box>
      )}

      {fileChanges.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={colors.muted}>File Changes:</Text>
          <Box marginLeft={2} flexDirection="column">
            {fileChanges.slice(-5).map((change, index) => (
              <FileChangeDisplay key={`${change.path}-${index}`} change={change} />
            ))}
            {fileChanges.length > 5 && (
              <Text color={colors.muted}>... and {fileChanges.length - 5} more files</Text>
            )}
          </Box>
        </Box>
      )}

      {testResults && (
        <Box marginTop={1}>
          <TestResultsDisplay results={testResults} />
        </Box>
      )}
    </Box>
  );
}

function StreamingLineDisplay({ line }: { line: StreamingLine }): React.ReactElement {
  switch (line.type) {
    case 'agent':
      return (
        <Text>
          <Text color={colors.info}>{line.agent ? getAgentIcon(line.agent) : '•'}</Text>
          <Text color={colors.muted}> {line.agent ? formatAgentName(line.agent) : 'Agent'}: </Text>
          <Text>{line.content}</Text>
        </Text>
      );
    case 'file':
      return (
        <Text>
          <Text color={colors.success}>📄</Text>
          <Text> {line.content}</Text>
        </Text>
      );
    case 'test':
      return (
        <Text>
          <Text color={colors.warning}>🧪</Text>
          <Text> {line.content}</Text>
        </Text>
      );
    case 'progress':
      return (
        <Text color={colors.muted}>
          <Text>⏳ {line.content}</Text>
        </Text>
      );
    default:
      return <Text>{line.content}</Text>;
  }
}

function FileChangeDisplay({ change }: { change: FileChange }): React.ReactElement {
  const icon = change.type === 'created' ? '+' : '~';
  const iconColor = change.type === 'created' ? colors.success : colors.warning;
  
  return (
    <Text>
      <Text color={iconColor}>{icon}</Text>
      <Text> {change.path}</Text>
      {change.linesChanged !== undefined && (
        <Text color={colors.muted}> ({change.linesChanged} lines)</Text>
      )}
    </Text>
  );
}

function TestResultsDisplay({ results }: { results: TestResults }): React.ReactElement {
  const allPassed = results.failed === 0;
  const statusColor = allPassed ? colors.success : colors.error;
  const statusIcon = allPassed ? '✓' : '✗';

  return (
    <Box>
      <Text color={statusColor}>{statusIcon} Tests: </Text>
      <Text color={colors.success}>{results.passed} passed</Text>
      {results.failed > 0 && (
        <>
          <Text>, </Text>
          <Text color={colors.error}>{results.failed} failed</Text>
        </>
      )}
      <Text color={colors.muted}> ({results.total} total)</Text>
    </Box>
  );
}
