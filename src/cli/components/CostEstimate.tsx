import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../utils/colors.js';
import {
  type CostEstimate as CostEstimateData,
  formatTokenCount,
  formatCost,
  formatDuration,
} from '../../utils/cost-estimator.js';

interface CostEstimateProps {
  estimate: CostEstimateData;
  description?: string;
}

export function CostEstimate({ estimate, description }: CostEstimateProps): React.ReactElement {
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color={colors.info}>📊 Pipeline Cost Estimate</Text>
      </Box>

      {description && (
        <Box marginLeft={2} marginBottom={1}>
          <Text color={colors.muted}>Feature: </Text>
          <Text bold>{description}</Text>
        </Box>
      )}

      <Box marginLeft={2} flexDirection="column" marginBottom={1}>
        <Text>
          <Text color={colors.muted}>Template:      </Text>
          <Text bold>{estimate.templateName}</Text>
          <Text color={colors.muted}> ({estimate.steps} steps)</Text>
        </Text>
      </Box>

      <Box marginTop={1} marginBottom={1}>
        <Text color={colors.muted}>{'─'.repeat(50)}</Text>
      </Box>

      <Box marginLeft={2} flexDirection="column">
        <Text>
          <Text color={colors.muted}>Est. tokens:   </Text>
          <Text color={colors.info}>
            {formatTokenCount(estimate.tokens.min)} - {formatTokenCount(estimate.tokens.max)}
          </Text>
          <Text color={colors.muted}> (avg: {formatTokenCount(estimate.tokens.average)})</Text>
        </Text>

        <Text>
          <Text color={colors.muted}>Est. cost:     </Text>
          <Text color={colors.warning}>
            {formatCost(estimate.cost.min)} - {formatCost(estimate.cost.max)}
          </Text>
          <Text color={colors.muted}> (avg: {formatCost(estimate.cost.average)})</Text>
        </Text>

        <Text>
          <Text color={colors.muted}>Est. time:     </Text>
          <Text color={colors.success}>
            {formatDuration(estimate.time.minSeconds)} - {formatDuration(estimate.time.maxSeconds)}
          </Text>
          <Text color={colors.muted}> (avg: {formatDuration(estimate.time.averageSeconds)})</Text>
        </Text>
      </Box>

      <Box marginTop={1} marginBottom={1}>
        <Text color={colors.muted}>{'─'.repeat(50)}</Text>
      </Box>

      <Box marginLeft={2} flexDirection="column">
        <Text color={colors.muted}>Agents involved:</Text>
        <Box marginLeft={2} flexDirection="column">
          {estimate.agents.map((agent, index) => (
            <Text key={index}>
              <Text color={colors.info}>•</Text> {agent}
            </Text>
          ))}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color={colors.muted}>
          Note: Estimates based on historical averages. Actual usage may vary.
        </Text>
      </Box>
    </Box>
  );
}
