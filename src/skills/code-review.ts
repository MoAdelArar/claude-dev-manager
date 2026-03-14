import { type Skill, AgentRole, ArtifactType } from '../types';

export const codeReviewSkill: Skill = {
  id: 'code-review',
  name: 'Code Review',
  description: 'Review code for quality, patterns, best practices, and maintainability',
  category: 'review',
  compatibleAgents: [AgentRole.REVIEWER],
  promptTemplate: `Review the code for quality and correctness.

Evaluate:
1. **Correctness**
   - Does the code do what it's supposed to?
   - Are edge cases handled?
   - Are there logic errors?

2. **Code Quality**
   - Follows {language} idioms and {framework} patterns
   - Consistent naming conventions
   - Appropriate abstraction level
   - No code duplication (DRY)

3. **Maintainability**
   - Easy to understand and modify
   - Well-organized structure
   - Appropriate comments (why, not what)
   - Reasonable function/file sizes

4. **Error Handling**
   - Errors caught and handled appropriately
   - Meaningful error messages
   - No silent failures

5. **Performance**
   - No obvious inefficiencies
   - Appropriate data structures
   - No unnecessary allocations

For each issue found:
- Severity: critical / high / medium / low / info
- Location: file and line reference
- Problem: what's wrong
- Suggestion: how to fix it

Do not rewrite code. Provide actionable feedback only.`,
  expectedArtifacts: [ArtifactType.CODE_REVIEW_REPORT],
  requiredInputArtifacts: [ArtifactType.SOURCE_CODE],
};
