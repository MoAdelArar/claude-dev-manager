import { type Skill, AgentRole, ArtifactType } from '../types';

export const taskDecompositionSkill: Skill = {
  id: 'task-decomposition',
  name: 'Task Decomposition',
  description: 'Break work into ordered steps, estimate complexity, and identify dependencies between tasks',
  category: 'planning',
  compatibleAgents: [AgentRole.PLANNER],
  promptTemplate: `Decompose the task into executable steps.

For each step:
- Clear action description
- Expected output/deliverable
- Dependencies (which steps must complete first)
- Estimated complexity: low/medium/high
- Skills needed (from: system-design, api-design, data-modeling, ui-design, code-implementation, test-writing, documentation, code-review, security-audit, deployment)

Rules:
- Order steps by dependency graph (parallel steps at same level)
- First steps should be design/planning, then implementation, then review
- Group related work to minimize context switching
- Identify which agent (Architect, Developer, Reviewer, Operator) handles each step

Output an ordered execution plan with clear dependencies.`,
  expectedArtifacts: [ArtifactType.EXECUTION_PLAN],
  requiredInputArtifacts: [ArtifactType.REQUIREMENTS_DOC],
};
