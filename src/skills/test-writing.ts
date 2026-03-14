import { type Skill, AgentRole, ArtifactType } from '../types';

export const testWritingSkill: Skill = {
  id: 'test-writing',
  name: 'Test Writing',
  description: 'Write comprehensive unit, integration, and e2e tests with high coverage',
  category: 'build',
  compatibleAgents: [AgentRole.DEVELOPER],
  promptTemplate: `Write tests for the implemented code.

Use {testFramework} for testing.

Requirements:
1. **Test Structure**
   - Arrange-Act-Assert (AAA) pattern
   - One assertion per test case
   - Descriptive test names: "should [behavior] when [condition]"

2. **Coverage**
   - Happy path for all public functions
   - Error paths and exception handling
   - Edge cases: null, undefined, empty, boundary values
   - Target 80%+ line coverage

3. **Test Types**
   - Unit tests: pure logic, no external deps
   - Integration tests: component interactions
   - E2E tests: full user flows (if applicable)

4. **Mocking**
   - Mock external services and I/O
   - Use dependency injection for testability
   - Reset mocks between tests

5. **Test Data**
   - Use factories/fixtures for test data
   - Avoid hardcoded magic values
   - Test with realistic data shapes

Do not use test.skip or test.todo.
Ensure tests are deterministic and isolated.`,
  expectedArtifacts: [ArtifactType.UNIT_TESTS, ArtifactType.INTEGRATION_TESTS],
  requiredInputArtifacts: [ArtifactType.SOURCE_CODE],
};
