import { type Skill, AgentRole, ArtifactType } from '../types';

export const codeImplementationSkill: Skill = {
  id: 'code-implementation',
  name: 'Code Implementation',
  description: 'Write production-quality code following project conventions and best practices',
  category: 'build',
  compatibleAgents: [AgentRole.DEVELOPER],
  promptTemplate: `Implement the feature according to the design artifacts.

Requirements:
1. **Code Quality**
   - Follow existing project patterns exactly
   - Match naming conventions: files, functions, variables, classes
   - Use proper {language} idioms and {framework} patterns
   - Handle errors gracefully with meaningful messages

2. **Structure**
   - One responsibility per function/class
   - Functions under 40 lines
   - Files under 300 lines — split if larger
   - Clear module boundaries

3. **Implementation**
   - Validate all inputs
   - Handle edge cases (null, empty, boundary values)
   - Include logging at key decision points
   - No hardcoded values — use config/constants

4. **Documentation**
   - JSDoc/docstrings for public APIs
   - Only explain "why", not "what"
   - No TODO comments — create issues instead

5. **Dependencies**
   - Use existing dependencies where possible
   - Justify any new dependencies
   - Import with {language} conventions

Output complete, runnable code files.
Do not produce skeleton/placeholder code.`,
  expectedArtifacts: [ArtifactType.SOURCE_CODE],
  requiredInputArtifacts: [ArtifactType.ARCHITECTURE_DOC],
};
