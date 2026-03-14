import { type Skill, AgentRole, ArtifactType } from '../types';

export const systemDesignSkill: Skill = {
  id: 'system-design',
  name: 'System Design',
  description: 'Design system architecture, component structure, and data flows',
  category: 'design',
  compatibleAgents: [AgentRole.ARCHITECT],
  promptTemplate: `Design the system architecture for the requested feature.

Include:
1. **Component Overview**
   - List all components/modules needed
   - Define responsibilities for each
   - Identify boundaries and interfaces

2. **Data Flow**
   - How data moves through the system
   - Input/output for each component
   - State management approach

3. **Integration Points**
   - External services/APIs
   - Database interactions
   - Event/message flows

4. **Technology Decisions**
   - Justify choices for {framework} patterns
   - Note alternatives considered
   - Document trade-offs

Follow {language} and {framework} idioms.
Design for testability and maintainability.
Consider error handling and edge cases.

Output a structured architecture document with diagrams described in text (mermaid syntax if helpful).`,
  expectedArtifacts: [ArtifactType.ARCHITECTURE_DOC, ArtifactType.SYSTEM_DIAGRAM],
  requiredInputArtifacts: [ArtifactType.REQUIREMENTS_DOC],
};
