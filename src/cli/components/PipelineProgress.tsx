import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';
import { colors } from '../utils/colors.js';
import { formatAgentName, getAgentIcon } from '../utils/format.js';
import type { PipelineStepUI } from '../types.js';
import { StepStatus } from '../../types.js';

interface PipelineProgressProps {
  steps: PipelineStepUI[];
  currentStep: number;
}

function getStepIcon(status: StepStatus, isCurrent: boolean): React.ReactElement {
  switch (status) {
    case StepStatus.COMPLETED:
      return <Text color={colors.success}>✓</Text>;
    case StepStatus.FAILED:
      return <Text color={colors.error}>✗</Text>;
    case StepStatus.SKIPPED:
      return <Text color={colors.warning}>−</Text>;
    case StepStatus.IN_PROGRESS:
      return <Text color={colors.info}><InkSpinner type="dots" /></Text>;
    case StepStatus.NOT_STARTED:
    default:
      return <Text color={colors.muted}>○</Text>;
  }
}

export function PipelineProgress({ steps, currentStep }: PipelineProgressProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text bold>📋 Pipeline Progress</Text></Box>
      {steps.map((step) => {
        const isCurrent = step.index === currentStep;
        const icon = getStepIcon(step.status, isCurrent);
        const agentIcon = getAgentIcon(step.agent);
        
        return (
          <Box key={step.index} marginLeft={2}>
            {icon}
            <Text> Step {step.index}: </Text>
            <Text color={isCurrent ? colors.info : undefined}>
              {agentIcon} {formatAgentName(step.agent)}
            </Text>
            <Text color={colors.muted}> — {step.description}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
