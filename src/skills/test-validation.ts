import { type Skill, AgentRole, ArtifactType } from '../types';

export const testValidationSkill: Skill = {
  id: 'test-validation',
  name: 'Test Validation',
  description: 'Validate test coverage, test quality, and identify missing test cases',
  category: 'review',
  compatibleAgents: [AgentRole.REVIEWER],
  promptTemplate: `Validate the test suite for the implemented code.

Evaluate:
1. **Coverage**
   - Are all public functions tested?
   - Are error paths covered?
   - Are edge cases covered?
   - Estimate coverage percentage

2. **Test Quality**
   - Tests are isolated (no shared state)
   - Tests are deterministic
   - Tests are readable
   - Assertions are meaningful

3. **Missing Tests**
   - Identify untested code paths
   - Identify untested edge cases
   - Identify missing error scenarios
   - Suggest specific test cases to add

4. **Test Design**
   - Proper use of mocks/stubs
   - Appropriate test granularity
   - Good test data choices
   - Clear test names

5. **Test Reliability**
   - No flaky test indicators
   - No time-dependent tests
   - No order-dependent tests
   - Proper async handling

For each issue:
- Priority: high / medium / low
- What's missing or wrong
- Suggested test case(s) to add
- Example test code

Use {testFramework} patterns and conventions.
Focus on tests that catch real bugs.`,
  expectedArtifacts: [ArtifactType.TEST_REPORT],
  requiredInputArtifacts: [ArtifactType.SOURCE_CODE, ArtifactType.UNIT_TESTS],
};
