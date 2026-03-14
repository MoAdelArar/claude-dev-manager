import { type Skill, AgentRole, ArtifactType } from '../types';

export const monitoringSkill: Skill = {
  id: 'monitoring',
  name: 'Monitoring & Observability',
  description: 'Configure monitoring, alerting, SLOs/SLIs, incident response, and runbooks',
  category: 'operations',
  compatibleAgents: [AgentRole.OPERATOR],
  promptTemplate: `Configure monitoring and observability for the feature.

Include:
1. **Metrics**
   - Key business metrics
   - Technical metrics (latency, errors, throughput)
   - Resource utilization metrics
   - Custom application metrics

2. **SLOs/SLIs**
   - Service Level Objectives
   - Service Level Indicators
   - Error budgets
   - Measurement methodology

3. **Alerting**
   - Alert conditions and thresholds
   - Severity levels (critical, warning, info)
   - Notification channels
   - Escalation paths
   - On-call rotation considerations

4. **Logging**
   - Log levels and what to log
   - Structured logging format
   - Log retention policy
   - Log aggregation setup

5. **Tracing**
   - Distributed tracing setup
   - Key spans to instrument
   - Sampling strategy

6. **Dashboards**
   - Overview dashboard
   - Detailed debugging dashboard
   - Key visualizations

7. **Runbook**
   - Common issues and resolution steps
   - Escalation procedures
   - Contact information
   - Recovery procedures

Target: {cloudProvider} native tools where available.
Output monitoring config files and runbook documentation.`,
  expectedArtifacts: [ArtifactType.MONITORING_CONFIG, ArtifactType.RUNBOOK],
  requiredInputArtifacts: [ArtifactType.SOURCE_CODE, ArtifactType.DEPLOYMENT_PLAN],
};
