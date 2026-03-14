import React from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { colors } from '../utils/colors.js';
import type { TemplateInfo } from '../types.js';
import { EXIT_CODES } from '../types.js';

export const options = z.object({
  template: z.string().optional().describe('Show details for a specific template'),
  json: z.boolean().default(false).describe('Output as JSON'),
});

type Props = {
  options: z.infer<typeof options>;
};

const templates: TemplateInfo[] = [
  {
    id: 'quick-fix',
    name: 'Quick Fix',
    description: 'For bugs, typos, and small tweaks',
    steps: ['Developer[code-implementation]', 'Reviewer[code-review]'],
  },
  {
    id: 'feature',
    name: 'Feature',
    description: 'Standard feature development',
    steps: ['Planner[requirements-analysis]', 'Architect[system-design, api-design]', 'Developer[code-implementation, test-writing]', 'Reviewer[code-review]'],
  },
  {
    id: 'full-feature',
    name: 'Full Feature',
    description: 'Feature with security and deployment',
    steps: ['Planner[requirements-analysis]', 'Architect[system-design, api-design, data-modeling]', 'Developer[code-implementation, test-writing, documentation]', 'Reviewer[code-review]', 'Reviewer[security-audit]', 'Operator[deployment, monitoring]'],
  },
  {
    id: 'review-only',
    name: 'Review Only',
    description: 'For audits and assessments',
    steps: ['Reviewer[code-review, security-audit, performance-analysis]'],
  },
  {
    id: 'design-only',
    name: 'Design Only',
    description: 'Architecture spike or RFC',
    steps: ['Planner[requirements-analysis]', 'Architect[system-design, data-modeling]'],
  },
  {
    id: 'deploy',
    name: 'Deploy',
    description: 'Deploy existing code',
    steps: ['Operator[ci-cd, deployment, monitoring]'],
  },
];

export default function PipelineCommand({ options }: Props): React.ReactElement | null {
  if (options.json) {
    console.log(JSON.stringify(templates, null, 2));
    return null;
  }

  if (options.template) {
    const t = templates.find((t) => t.id === options.template);
    if (!t) {
      console.error(`Template "${options.template}" not found.`);
      console.error(`Available: ${templates.map((t) => t.id).join(', ')}`);
      process.exit(EXIT_CODES.INVALID_ARGS);
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={colors.info}>🔄 Pipeline Template: {t.name}</Text>
        <Text> </Text>
        <Box marginLeft={2} flexDirection="column">
          <Text bold>{t.name} ({t.id})</Text>
          <Text color={colors.muted}>{t.description}</Text>
          <Text> </Text>
          <Text bold>Steps:</Text>
          {t.steps.map((step, i) => (
            <Text key={i}>  {i}. {step}</Text>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={colors.info}>🔄 Pipeline Templates</Text>
      <Text> </Text>
      {templates.map((t) => (
        <Box key={t.id} flexDirection="column" marginBottom={1} marginLeft={2}>
          <Box>
            <Text bold>{t.id.padEnd(15)}</Text>
            <Text>{t.name}</Text>
          </Box>
          <Box marginLeft={15}>
            <Text color={colors.muted}>{t.description}</Text>
          </Box>
          <Box marginLeft={15}>
            <Text color={colors.info}>{t.steps.length} steps</Text>
          </Box>
        </Box>
      ))}
      <Text> </Text>
      <Text color={colors.muted}>  Use --template &lt;name&gt; to see template details.</Text>
      <Text color={colors.muted}>  Use `cdm start "task" --template &lt;name&gt;` to use a specific template.</Text>
    </Box>
  );
}

export const description = 'Show available pipeline templates';
