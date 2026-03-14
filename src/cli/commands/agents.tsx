import React from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { AgentCard } from '../components/AgentCard.js';
import { colors } from '../utils/colors.js';
import { AgentRole } from '../../types.js';
import type { AgentInfo } from '../types.js';

export const options = z.object({
  json: z.boolean().default(false).describe('Output as JSON'),
});

type Props = {
  options: z.infer<typeof options>;
};

const agents: AgentInfo[] = [
  {
    role: AgentRole.PLANNER,
    icon: '📋',
    title: 'Planner',
    description: 'Analyzes tasks, creates execution plans, classifies work type',
    skills: ['requirements-analysis', 'task-decomposition'],
  },
  {
    role: AgentRole.ARCHITECT,
    icon: '🏗️',
    title: 'Architect',
    description: 'Designs systems, APIs, data models, and UI specifications',
    skills: ['system-design', 'api-design', 'data-modeling', 'ui-design'],
  },
  {
    role: AgentRole.DEVELOPER,
    icon: '💻',
    title: 'Developer',
    description: 'Writes production code, tests, and documentation',
    skills: ['code-implementation', 'test-writing', 'documentation'],
  },
  {
    role: AgentRole.REVIEWER,
    icon: '🔍',
    title: 'Reviewer',
    description: 'Reviews code quality, security, performance, and accessibility',
    skills: ['code-review', 'security-audit', 'performance-analysis', 'accessibility-audit', 'test-validation'],
  },
  {
    role: AgentRole.OPERATOR,
    icon: '🚀',
    title: 'Operator',
    description: 'Handles CI/CD, deployment, and monitoring configuration',
    skills: ['ci-cd', 'deployment', 'monitoring'],
  },
];

export default function AgentsCommand({ options }: Props): React.ReactElement | null {
  if (options.json) {
    console.log(JSON.stringify(agents, null, 2));
    return null;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={colors.info}>👥 Agent Team (5 Agents + 17 Skills)</Text>
      <Text> </Text>
      {agents.map((agent) => (
        <AgentCard key={agent.role} agent={agent} />
      ))}
      <Text color={colors.muted}>Run `cdm skills` to see all available skills.</Text>
    </Box>
  );
}

export const description = 'List all available agents and their skills';
