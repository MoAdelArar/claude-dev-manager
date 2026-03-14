import { type Skill, AgentRole, ArtifactType } from '../types';

export const uiDesignSkill: Skill = {
  id: 'ui-design',
  name: 'UI Design',
  description: 'Design user interfaces with wireframes, component hierarchy, and WCAG 2.1 AA accessibility compliance',
  category: 'design',
  compatibleAgents: [AgentRole.ARCHITECT],
  promptTemplate: `Design the user interface for the requested feature.

Include:
1. **User Flow**
   - Step-by-step user journey
   - Entry and exit points
   - Error states and recovery

2. **Component Hierarchy**
   - Page/screen structure
   - Reusable components
   - Props/inputs for each component
   - State management needs

3. **Wireframe Description**
   - Layout structure (describe visually)
   - Key UI elements and placement
   - Responsive breakpoints

4. **Accessibility (WCAG 2.1 AA)**
   - Keyboard navigation plan
   - Screen reader considerations
   - Color contrast requirements
   - Focus management
   - ARIA labels and roles

5. **Interaction Design**
   - Loading states
   - Success/error feedback
   - Animations and transitions
   - Form validation behavior

Follow {framework} component patterns.
Ensure all interactive elements are keyboard accessible.
Provide text alternatives for non-text content.`,
  expectedArtifacts: [ArtifactType.UI_SPEC, ArtifactType.WIREFRAME, ArtifactType.COMPONENT_SPEC],
  requiredInputArtifacts: [ArtifactType.REQUIREMENTS_DOC],
  projectFilter: {
    hasUI: true,
  },
};
