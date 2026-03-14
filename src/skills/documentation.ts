import { type Skill, AgentRole, ArtifactType } from '../types';

export const documentationSkill: Skill = {
  id: 'documentation',
  name: 'Documentation',
  description: 'Write API documentation, developer guides, and README updates',
  category: 'build',
  compatibleAgents: [AgentRole.DEVELOPER],
  promptTemplate: `Write documentation for the implemented feature.

Include:
1. **API Documentation**
   - Function/method signatures
   - Parameter descriptions with types
   - Return values and exceptions
   - Usage examples

2. **Developer Guide**
   - How to use the feature
   - Configuration options
   - Common patterns and best practices
   - Troubleshooting guide

3. **README Updates**
   - Feature overview
   - Quick start example
   - Link to detailed docs

4. **Code Comments**
   - JSDoc/docstrings for public APIs
   - Explain complex algorithms
   - Document non-obvious decisions

Format:
- Use Markdown for docs
- Include code examples with syntax highlighting
- Keep language simple and direct
- Include diagrams where helpful (mermaid)

Follow {framework} documentation conventions.
Keep examples runnable and up-to-date with the code.`,
  expectedArtifacts: [ArtifactType.API_DOCUMENTATION, ArtifactType.DEVELOPER_DOCUMENTATION],
  requiredInputArtifacts: [ArtifactType.SOURCE_CODE],
};
