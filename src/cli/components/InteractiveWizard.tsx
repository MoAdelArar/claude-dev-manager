import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { colors } from '../utils/colors.js';

type WizardStep = 'description' | 'template' | 'priority' | 'confirm';

interface WizardResult {
  description: string;
  template: string;
  priority: string;
}

interface InteractiveWizardProps {
  onComplete: (result: WizardResult) => void;
  onCancel: () => void;
}

const TEMPLATES = [
  { label: 'feature      - Standard feature development (4 steps)', value: 'feature' },
  { label: 'full-feature - Feature with security and deployment (6 steps)', value: 'full-feature' },
  { label: 'quick-fix    - For bugs, typos, and small tweaks (2 steps)', value: 'quick-fix' },
  { label: 'review-only  - For audits and assessments (1 step)', value: 'review-only' },
  { label: 'design-only  - Architecture spike or RFC (2 steps)', value: 'design-only' },
  { label: 'deploy       - Deploy existing code (1 step)', value: 'deploy' },
  { label: 'auto         - Let Planner agent decide based on task', value: 'auto' },
];

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
  const [template, setTemplate] = useState('feature');
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
      setStep('template');
    }
  };

  const handleTemplateSelect = (item: { value: string }): void => {
    setTemplate(item.value);
    setStep('priority');
  };

  const handlePrioritySelect = (item: { value: string }): void => {
    setPriority(item.value);
    setStep('confirm');
  };

  const handleConfirm = (item: { value: string }): void => {
    if (item.value === 'yes') {
      onComplete({ description, template: template === 'auto' ? '' : template, priority });
    } else if (item.value === 'back') {
      setStep('priority');
    } else {
      onCancel();
      exit();
    }
  };

  const renderStepIndicator = (): React.ReactElement => {
    const steps = ['Description', 'Template', 'Priority', 'Confirm'];
    const currentIndex = ['description', 'template', 'priority', 'confirm'].indexOf(step);
    
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
        </Box>
      )}

      {step === 'template' && (
        <Box flexDirection="column">
          <Text color={colors.info}>? Select a pipeline template:</Text>
          <Box marginTop={1}>
            <SelectInput items={TEMPLATES} onSelect={handleTemplateSelect} />
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
              <Text color={colors.muted}>Template:    </Text>
              <Text bold>{template === 'auto' ? 'auto (Planner decides)' : template}</Text>
            </Text>
            <Text>
              <Text color={colors.muted}>Priority:    </Text>
              <Text bold>{priority}</Text>
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={colors.info}>? Start pipeline?</Text>
          </Box>
          <Box marginTop={1}>
            <SelectInput
              items={[
                { label: 'Yes, start the pipeline', value: 'yes' },
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
