import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../utils/colors.js';
import type { AgentInfo } from '../types.js';

interface AgentCardProps {
  agent: AgentInfo;
  showSkills?: boolean;
}

export function AgentCard({ agent, showSkills = true }: AgentCardProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text>{agent.icon} </Text>
        <Text bold>{agent.title}</Text>
      </Box>
      <Box marginLeft={3}>
        <Text color={colors.muted}>{agent.description}</Text>
      </Box>
      {showSkills && agent.skills.length > 0 && (
        <Box marginLeft={3}>
          <Text>Skills: </Text>
          <Text color={colors.info}>{agent.skills.join(', ')}</Text>
        </Box>
      )}
    </Box>
  );
}
