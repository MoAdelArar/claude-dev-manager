import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../utils/colors.js';

interface ErrorDisplayProps {
  error: Error | string;
  suggestion?: string;
  showStack?: boolean;
}

export function ErrorDisplay({ error, suggestion, showStack = false }: ErrorDisplayProps): React.ReactElement {
  const message = error instanceof Error ? error.message : error;
  const stack = error instanceof Error ? error.stack : undefined;

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color={colors.error} bold>✗ Error: </Text>
        <Text color={colors.error}>{message}</Text>
      </Box>
      
      {suggestion && (
        <Box marginTop={1}>
          <Text color={colors.info}>💡 </Text>
          <Text>{suggestion}</Text>
        </Box>
      )}
      
      {showStack && stack && (
        <Box marginTop={1} flexDirection="column">
          <Text color={colors.muted} dimColor>Stack trace:</Text>
          <Text color={colors.muted} dimColor>{stack}</Text>
        </Box>
      )}
    </Box>
  );
}
