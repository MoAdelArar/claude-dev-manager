import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../utils/colors.js';

interface HeaderProps {
  version: string;
  title?: string;
}

export function Header({ version, title }: HeaderProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={colors.info}>
        🚀 Claude Dev Manager v{version}
      </Text>
      {title && (
        <Text color={colors.muted}>
          {title}
        </Text>
      )}
    </Box>
  );
}
