import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { colors } from '../utils/colors.js';

type WizardStep = 'description' | 'priority' | 'confirm';

interface WizardResult {
  description: string;
  priority: string;
}

interface InteractiveWizardProps {
  onComplete: (result: WizardResult) => void;
  onCancel: () => void;
}

const PRIORITIES = [
  { label: 'low      - Can wait, no urgency', value: 'low' },
  { label: 'medium   - Normal priority (default)', value: 'medium' },
  { label: 'high     - Important, needs attention soon', value: 'high' },
  { label: 'critical - Urgent, drop everything', value: 'critical' },
];

export function InteractiveWizard({ onComplete, onCancel }: InteractiveWizardProps): React.ReactElement {
  const { exit } = useApp();
  const [step, setStep] = useState<WizardStep>('description');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      onCancel();
      exit();
    }
  });

  const handleDescriptionSubmit = (value: string): void => {
    if (value.trim()) {
      setDescription(value.trim());
      setStep('priority');
    }
  };

  const handlePrioritySelect = (item: { value: string }): void => {
    setPriority(item.value);
    setStep('confirm');
  };

  const handleConfirm = (item: { value: string }): void => {
    if (item.value === 'yes') {
      onComplete({ description, priority });
    } else if (item.value === 'back') {
      setStep('priority');
    } else {
      onCancel();
      exit();
    }
  };

  const renderStepIndicator = (): React.ReactElement => {
    const steps = ['Description', 'Priority', 'Confirm'];
    const currentIndex = ['description', 'priority', 'confirm'].indexOf(step);
    
    return (
      <Box marginBottom={1}>
        <Text color={colors.muted}>
          {steps.map((s, i) => {
            const isComplete = i < currentIndex;
            const isCurrent = i === currentIndex;
            const icon = isComplete ? '✓' : isCurrent ? '›' : '○';
            const color = isComplete ? colors.success : isCurrent ? colors.info : colors.muted;
            return (
              <Text key={s}>
                <Text color={color}>{icon} {s}</Text>
                {i < steps.length - 1 && <Text color={colors.muted}> → </Text>}
              </Text>
            );
          })}
        </Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color={colors.info}>🚀 CDM Interactive Setup</Text>
      </Box>
      
      {renderStepIndicator()}

      {step === 'description' && (
        <Box flexDirection="column">
          <Text color={colors.info}>? What are you building?</Text>
          <Box marginTop={1}>
            <Text color={colors.muted}>› </Text>
            <TextInput
              value={description}
              onChange={setDescription}
              onSubmit={handleDescriptionSubmit}
              placeholder="Describe your feature or task..."
            />
          </Box>
          <Box marginTop={1}>
            <Text color={colors.muted}>Press Enter to continue, Esc to cancel</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={colors.muted}>Personas will be automatically selected based on your description.</Text>
          </Box>
        </Box>
      )}

      {step === 'priority' && (
        <Box flexDirection="column">
          <Text color={colors.info}>? Priority level:</Text>
          <Box marginTop={1}>
            <SelectInput 
              items={PRIORITIES} 
              onSelect={handlePrioritySelect}
              initialIndex={1}
            />
          </Box>
        </Box>
      )}

      {step === 'confirm' && (
        <Box flexDirection="column">
          <Text bold color={colors.info}>Review your configuration:</Text>
          <Box marginTop={1} marginLeft={2} flexDirection="column">
            <Text>
              <Text color={colors.muted}>Description: </Text>
              <Text bold>{description}</Text>
            </Text>
            <Text>
              <Text color={colors.muted}>Priority:    </Text>
              <Text bold>{priority}</Text>
            </Text>
            <Text>
              <Text color={colors.muted}>Personas:    </Text>
              <Text bold>Auto-selected based on task</Text>
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={colors.info}>? Start execution?</Text>
          </Box>
          <Box marginTop={1}>
            <SelectInput
              items={[
                { label: 'Yes, start execution', value: 'yes' },
                { label: 'Go back and change settings', value: 'back' },
                { label: 'Cancel', value: 'cancel' },
              ]}
              onSelect={handleConfirm}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
