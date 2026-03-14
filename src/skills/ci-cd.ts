import { type Skill, AgentRole, ArtifactType } from '../types';

export const ciCdSkill: Skill = {
  id: 'ci-cd',
  name: 'CI/CD Pipeline',
  description: 'Configure CI/CD pipelines, build automation, and artifact publishing',
  category: 'operations',
  compatibleAgents: [AgentRole.OPERATOR],
  promptTemplate: `Configure CI/CD pipeline for the project.

Include:
1. **Build Pipeline**
   - Trigger conditions (push, PR, tag)
   - Build steps for {language} / {buildTool}
   - Dependency caching strategy
   - Parallel job execution

2. **Quality Gates**
   - Linting and formatting checks
   - Type checking (if applicable)
   - Unit test execution
   - Integration test execution
   - Coverage thresholds

3. **Artifact Management**
   - Build artifact creation
   - Version tagging strategy
   - Artifact storage/registry

4. **Environment Configuration**
   - Environment variables
   - Secrets management
   - Per-environment configs

5. **Deployment Triggers**
   - Auto-deploy to staging on merge
   - Manual approval for production
   - Rollback procedures

Output format:
- CI config file (GitHub Actions, GitLab CI, etc.)
- Environment variable documentation
- Pipeline documentation

Target: {cloudProvider} if specified, otherwise generic.
Ensure fast feedback loops — fail fast on errors.`,
  expectedArtifacts: [ArtifactType.CI_CD_CONFIG],
  requiredInputArtifacts: [ArtifactType.SOURCE_CODE],
};
