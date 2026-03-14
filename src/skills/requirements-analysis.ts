import { type Skill, AgentRole, ArtifactType } from '../types';

export const requirementsAnalysisSkill: Skill = {
  id: 'requirements-analysis',
  name: 'Requirements Analysis',
  description: 'Extract and document requirements, user stories, acceptance criteria, and success metrics from task descriptions',
  category: 'planning',
  compatibleAgents: [AgentRole.PLANNER],
  promptTemplate: `Analyze the task and extract structured requirements.

For each requirement:
- Write as a user story: "As a [role], I want [goal] so that [benefit]"
- Define acceptance criteria using Given/When/Then format
- Identify success metrics (quantifiable where possible)
- Flag dependencies and assumptions

Output format:
1. Requirements summary (3-5 bullet points)
2. User stories with acceptance criteria
3. Success metrics
4. Dependencies and risks

Keep requirements specific to {framework} conventions where applicable.
Focus on testable, measurable outcomes.`,
  expectedArtifacts: [
    ArtifactType.REQUIREMENTS_DOC,
    ArtifactType.USER_STORIES,
    ArtifactType.ACCEPTANCE_CRITERIA,
  ],
  requiredInputArtifacts: [],
};
