import React from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { colors } from '../utils/colors.js';
import { getCategoryIcon } from '../utils/format.js';
import type { SkillInfo } from '../types.js';

export const options = z.object({
  category: z.string().optional().describe('Filter by category (planning|design|build|review|operations)'),
  json: z.boolean().default(false).describe('Output as JSON'),
});

type Props = {
  options: z.infer<typeof options>;
};

const skills: SkillInfo[] = [
  { id: 'requirements-analysis', name: 'Requirements Analysis', category: 'planning', agents: ['planner'] },
  { id: 'task-decomposition', name: 'Task Decomposition', category: 'planning', agents: ['planner'] },
  { id: 'system-design', name: 'System Design', category: 'design', agents: ['architect'] },
  { id: 'api-design', name: 'API Design', category: 'design', agents: ['architect'] },
  { id: 'data-modeling', name: 'Data Modeling', category: 'design', agents: ['architect'] },
  { id: 'ui-design', name: 'UI Design', category: 'design', agents: ['architect'] },
  { id: 'code-implementation', name: 'Code Implementation', category: 'build', agents: ['developer'] },
  { id: 'test-writing', name: 'Test Writing', category: 'build', agents: ['developer'] },
  { id: 'documentation', name: 'Documentation', category: 'build', agents: ['developer'] },
  { id: 'code-review', name: 'Code Review', category: 'review', agents: ['reviewer'] },
  { id: 'security-audit', name: 'Security Audit', category: 'review', agents: ['reviewer'] },
  { id: 'performance-analysis', name: 'Performance Analysis', category: 'review', agents: ['reviewer'] },
  { id: 'accessibility-audit', name: 'Accessibility Audit', category: 'review', agents: ['reviewer'] },
  { id: 'test-validation', name: 'Test Validation', category: 'review', agents: ['reviewer'] },
  { id: 'ci-cd', name: 'CI/CD Pipeline', category: 'operations', agents: ['operator'] },
  { id: 'deployment', name: 'Deployment', category: 'operations', agents: ['operator'] },
  { id: 'monitoring', name: 'Monitoring', category: 'operations', agents: ['operator'] },
];

const categories = ['planning', 'design', 'build', 'review', 'operations'] as const;

export default function SkillsCommand({ options }: Props): React.ReactElement | null {
  let filtered = skills;
  if (options.category) {
    filtered = skills.filter((s) => s.category === options.category);
  }

  if (options.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return null;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={colors.info}>🧩 Available Skills</Text>
      <Text> </Text>
      {categories.map((cat) => {
        if (options.category && options.category !== cat) return null;
        const catSkills = filtered.filter((s) => s.category === cat);
        if (catSkills.length === 0) return null;

        return (
          <Box key={cat} flexDirection="column" marginBottom={1}>
            <Text bold>  {getCategoryIcon(cat)} {cat.charAt(0).toUpperCase() + cat.slice(1)}</Text>
            {catSkills.map((skill) => (
              <Box key={skill.id} marginLeft={5}>
                <Text color={colors.info}>{skill.id}</Text>
                <Text color={colors.muted}> — {skill.name}</Text>
              </Box>
            ))}
          </Box>
        );
      })}
      <Text color={colors.muted}>  Total: {filtered.length} skills</Text>
    </Box>
  );
}

export const description = 'List all available skills';
