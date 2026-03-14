import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';
import { colors } from '../utils/colors.js';

interface SpinnerProps {
  label: string;
  type?: 'dots' | 'line' | 'arc' | 'circle';
}

export function Spinner({ label, type = 'dots' }: SpinnerProps): React.ReactElement {
  return (
    <Box>
      <Text color={colors.info}>
        <InkSpinner type={type} />
      </Text>
      <Text> {label}</Text>
    </Box>
  );
}
