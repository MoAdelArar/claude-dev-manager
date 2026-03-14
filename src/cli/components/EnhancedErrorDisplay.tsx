import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../utils/colors.js';
import { getErrorSuggestion, getErrorSuggestionForStep, type EnhancedErrorInfo } from '../../utils/error-suggestions.js';
import { formatAgentName } from '../utils/format.js';
import type { AgentRole } from '../../types.js';

interface EnhancedErrorDisplayProps {
  error: Error | string;
  step?: number;
  agent?: AgentRole;
  showDetails?: boolean;
}

export function EnhancedErrorDisplay({
  error,
  step,
  agent,
  showDetails = false,
}: EnhancedErrorDisplayProps): React.ReactElement {
  const errorInfo: EnhancedErrorInfo = step !== undefined
    ? getErrorSuggestionForStep(error, step, agent)
    : getErrorSuggestion(error);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color={colors.error}>❌ {errorInfo.title}</Text>
      </Box>

      {(errorInfo.step !== undefined || errorInfo.agent) && (
        <Box marginBottom={1} marginLeft={2}>
          {errorInfo.step !== undefined && (
            <Text color={colors.muted}>Step {errorInfo.step}</Text>
          )}
          {errorInfo.agent && (
            <Text color={colors.muted}>
              {errorInfo.step !== undefined && ' | '}
              Agent: {formatAgentName(errorInfo.agent)}
            </Text>
          )}
        </Box>
      )}

      <Box marginLeft={2} marginBottom={1} flexDirection="column">
        <Text color={colors.error}>{errorInfo.message}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text bold color={colors.info}>💡 Suggestion:</Text>
      </Box>
      <Box marginLeft={2} marginBottom={1}>
        <Text>{errorInfo.suggestion}</Text>
      </Box>

      {errorInfo.actions.length > 0 && (
        <>
          <Box marginBottom={1}>
            <Text bold color={colors.info}>📋 Actions:</Text>
          </Box>
          <Box marginLeft={2} flexDirection="column" marginBottom={1}>
            {errorInfo.actions.map((action, index) => (
              <Box key={index} marginBottom={index < errorInfo.actions.length - 1 ? 1 : 0}>
                <Text color={colors.success}>• </Text>
                <Text color={colors.info}>{action.command}</Text>
                <Text color={colors.muted}> — {action.description}</Text>
              </Box>
            ))}
          </Box>
        </>
      )}

      {showDetails && errorInfo.details && (
        <>
          <Box marginTop={1}>
            <Text color={colors.muted}>{'─'.repeat(60)}</Text>
          </Box>
          <Box marginTop={1}>
            <Text bold color={colors.muted}>Stack Trace:</Text>
          </Box>
          <Box marginLeft={2} marginTop={1}>
            <Text color={colors.muted}>
              {errorInfo.details.split('\n').slice(0, 10).join('\n')}
              {errorInfo.details.split('\n').length > 10 && '\n... (truncated)'}
            </Text>
          </Box>
        </>
      )}
    </Box>
  );
}
