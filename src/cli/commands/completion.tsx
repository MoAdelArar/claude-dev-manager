import React from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { colors } from '../utils/colors.js';
import {
  generateBashCompletion,
  generateZshCompletion,
  generateFishCompletion,
} from '../utils/completions.js';
import { EXIT_CODES } from '../types.js';

export const args = z.tuple([
  z.enum(['bash', 'zsh', 'fish']).optional().describe('Shell type (bash, zsh, or fish)'),
]);

export const options = z.object({});

type Props = {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
};

export default function CompletionCommand({ args }: Props): React.ReactElement {
  const [shell] = args;

  if (!shell) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color={colors.info}>🔧 Shell Completion</Text>
        </Box>
        <Text>Generate shell completion scripts for CDM.</Text>
        <Text> </Text>
        <Text bold>Usage:</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text color={colors.muted}>cdm completion bash  # Generate Bash completions</Text>
          <Text color={colors.muted}>cdm completion zsh   # Generate Zsh completions</Text>
          <Text color={colors.muted}>cdm completion fish  # Generate Fish completions</Text>
        </Box>
        <Text> </Text>
        <Text bold>Installation:</Text>
        <Box marginLeft={2} flexDirection="column" marginBottom={1}>
          <Text color={colors.muted}># Bash</Text>
          <Text color={colors.info}>cdm completion bash {'>'} /etc/bash_completion.d/cdm</Text>
          <Text color={colors.muted}># Or add to ~/.bashrc:</Text>
          <Text color={colors.info}>source {'<'}(cdm completion bash)</Text>
        </Box>
        <Box marginLeft={2} flexDirection="column" marginBottom={1}>
          <Text color={colors.muted}># Zsh</Text>
          <Text color={colors.info}>cdm completion zsh {'>'} ~/.zsh/completions/_cdm</Text>
          <Text color={colors.muted}># Or add to ~/.zshrc:</Text>
          <Text color={colors.info}>source {'<'}(cdm completion zsh)</Text>
        </Box>
        <Box marginLeft={2} flexDirection="column">
          <Text color={colors.muted}># Fish</Text>
          <Text color={colors.info}>cdm completion fish {'>'} ~/.config/fish/completions/cdm.fish</Text>
        </Box>
      </Box>
    );
  }

  let completionScript: string;
  switch (shell) {
    case 'bash':
      completionScript = generateBashCompletion();
      break;
    case 'zsh':
      completionScript = generateZshCompletion();
      break;
    case 'fish':
      completionScript = generateFishCompletion();
      break;
    default:
      process.exitCode = EXIT_CODES.INVALID_ARGS;
      return (
        <Box padding={1}>
          <Text color={colors.error}>Unknown shell: {shell}. Use bash, zsh, or fish.</Text>
        </Box>
      );
  }

  console.log(completionScript);
  return <></>;
}

export const description = 'Generate shell completion scripts (bash, zsh, fish)';
