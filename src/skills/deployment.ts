import { type Skill, AgentRole, ArtifactType } from '../types';

export const deploymentSkill: Skill = {
  id: 'deployment',
  name: 'Deployment',
  description: 'Plan deployments, infrastructure configuration, release strategies, and rollback procedures',
  category: 'operations',
  compatibleAgents: [AgentRole.OPERATOR],
  promptTemplate: `Create deployment plan and infrastructure configuration.

Include:
1. **Deployment Strategy**
   - Rolling update / Blue-green / Canary
   - Traffic shifting approach
   - Health check configuration
   - Rollback triggers and procedure

2. **Infrastructure**
   - Required resources (compute, storage, network)
   - Scaling configuration (min/max instances)
   - Load balancer setup
   - Database/cache connections

3. **Configuration Management**
   - Environment-specific configs
   - Secrets and credentials
   - Feature flags

4. **Pre-deployment Checklist**
   - Database migrations
   - Cache warming
   - Dependency verification
   - Smoke test plan

5. **Post-deployment**
   - Verification steps
   - Monitoring dashboards
   - Alert thresholds
   - Runbook links

6. **Rollback Plan**
   - Rollback triggers
   - Step-by-step rollback procedure
   - Data rollback considerations
   - Communication plan

Target: {cloudProvider}
Output IaC (Terraform, CloudFormation, or similar) where applicable.
Include deployment documentation.`,
  expectedArtifacts: [ArtifactType.DEPLOYMENT_PLAN, ArtifactType.INFRASTRUCTURE_CONFIG],
  requiredInputArtifacts: [ArtifactType.SOURCE_CODE],
};
