import {
  type AgentConfig,
  AgentRole,
  type AgentTask,
  type Artifact,
  ArtifactType,
  type Issue,
  IssueType,
  IssueSeverity,
  PipelineStage,
} from '../types';
import { BaseAgent } from './base-agent';
import { type ArtifactStore } from '../workspace/artifact-store';
import { agentLog } from '../utils/logger';

interface ParsedArtifact {
  type: string;
  name: string;
  description: string;
  content: string;
}

interface ParsedIssue {
  type: string;
  severity: string;
  title: string;
  description: string;
}

interface ParsedOutput {
  summary: string;
  artifacts: ParsedArtifact[];
  issues: ParsedIssue[];
  recommendations: string;
}

const SRE_ENGINEER_SYSTEM_PROMPT = `SRE Engineer. Defines reliability targets, designs monitoring, and manages incident response.

SLO/SLI: define SLIs (availability, p50/p95/p99 latency, error rate, throughput), set SLOs with error budgets and budget policy (what triggers when exhausted), multi-window multi-burn-rate alerting (fast+slow burns). SLOs must be stricter than SLAs.
Incidents: severity matrix SEV1 (full outage/data loss) → SEV4 (no user impact). Roles: IC, Comms Lead, Ops Lead, SME. Mitigation: rollback, feature flag, traffic shedding, scaling, failover. Blameless post-mortem within 48h, action items with owners+dates, follow-up in 2 weeks.
Chaos: failure injection (instance termination, network partition, CPU saturation, dependency timeouts), game day planning with blast radius and abort criteria, steady-state hypothesis, progressive complexity.
Capacity: demand forecasting, utilization baselines, 30-40% headroom, scaling thresholds, cost-aware right-sizing.
On-call: max 2 pages/12h shift, primary/secondary rotation, every alert must have linked runbook, documented handoff.
Output: SLO definitions + Incident Response Plan (severity matrix, escalation, comms templates) + Capacity Plan (baselines, projections, triggers) + Chaos Test Plan (scenarios, blast radius, abort criteria).`;


export const SRE_ENGINEER_CONFIG: AgentConfig = {
  role: AgentRole.SRE_ENGINEER,
  name: 'sre-engineer',
  title: 'Site Reliability Engineer',
  description: 'Ensures production reliability through SLO management, incident response procedures, chaos engineering, capacity planning, and toil reduction.',
  systemPrompt: SRE_ENGINEER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'reliability_engineering',
      description: 'SLO management, error budgets, and reliability practices',
      allowedTools: ['Read', 'Write', 'Shell'],
      filePatterns: ['**/monitoring/**', '**/sre/**'],
    },
    {
      name: 'incident_management',
      description: 'Incident response plans, runbooks, and post-mortem processes',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/runbooks/**', '**/incidents/**'],
    },
    {
      name: 'capacity_planning',
      description: 'Demand forecasting, resource sizing, and scaling strategies',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/capacity/**'],
    },
  ],
  maxTokenBudget: 25000,
  allowedFilePatterns: ['docs/**', '**/*.md', 'infrastructure/**', 'monitoring/**'],
  blockedFilePatterns: [],
  reportsTo: AgentRole.ENGINEERING_MANAGER,
  directReports: [],
  requiredInputArtifacts: [
    ArtifactType.ARCHITECTURE_DOC,
    ArtifactType.DEPLOYMENT_PLAN,
    ArtifactType.MONITORING_CONFIG,
  ],
  outputArtifacts: [
    ArtifactType.INCIDENT_RESPONSE_PLAN,
    ArtifactType.CAPACITY_PLAN,
    ArtifactType.CHAOS_TEST_PLAN,
    ArtifactType.SLA_DEFINITION,
  ],
};

export default class SREEngineerAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(SRE_ENGINEER_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Beginning site reliability assessment', task.stage);

    const sections: string[] = [];
    sections.push('# Site Reliability Engineering Assessment\n');

    const archDoc = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.ARCHITECTURE_DOC,
    );
    const deployPlan = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.DEPLOYMENT_PLAN,
    );
    const monitoringConfig = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.MONITORING_CONFIG,
    );

    sections.push('## Input Analysis\n');
    sections.push(`- Architecture document: ${archDoc ? 'Available' : 'Not provided'}`);
    sections.push(`- Deployment plan: ${deployPlan ? 'Available' : 'Not provided'}`);
    sections.push(`- Monitoring config: ${monitoringConfig ? 'Available' : 'Not provided'}`);

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: INCIDENT_RESPONSE_PLAN');
    sections.push('Name: Incident Response Plan');
    sections.push('Description: Severity matrix, escalation paths, communication templates, and role assignments');
    sections.push('Content:');
    sections.push(this.generateIncidentResponsePlan(archDoc, deployPlan));
    sections.push('---ARTIFACT_END---\n');

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: CAPACITY_PLAN');
    sections.push('Name: Capacity Plan');
    sections.push('Description: Growth projections, resource baselines, and scaling triggers');
    sections.push('Content:');
    sections.push(this.generateCapacityPlan(archDoc, deployPlan));
    sections.push('---ARTIFACT_END---\n');

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: CHAOS_TEST_PLAN');
    sections.push('Name: Chaos Test Plan');
    sections.push('Description: Failure injection scenarios with blast radius and abort criteria');
    sections.push('Content:');
    sections.push(this.generateChaosTestPlan(archDoc));
    sections.push('---ARTIFACT_END---\n');

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: SLA_DEFINITION');
    sections.push('Name: SLA Definition');
    sections.push('Description: SLIs, SLO targets, error budgets, and measurement methodology');
    sections.push('Content:');
    sections.push(this.generateSLADefinition(archDoc));
    sections.push('---ARTIFACT_END---\n');

    agentLog(this.role, 'SRE assessment complete', task.stage);
    return sections.join('\n');
  }

  protected async produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]> {
    const parsed = this.parseClaudeOutput(output);
    const artifacts: Artifact[] = [];

    if (parsed.artifacts.length > 0) {
      for (const pa of parsed.artifacts) {
        const artifactType = this.resolveArtifactType(pa.type);
        if (artifactType) {
          const artifact = this.createArtifact(
            artifactType,
            pa.name,
            pa.description,
            pa.content,
            `.cdm/sre/${pa.name.toLowerCase().replace(/\s+/g, '-')}.md`,
          );
          this.artifactStore.store(artifact);
          artifacts.push(artifact);
        }
      }
    }

    if (!artifacts.some((a) => a.type === ArtifactType.INCIDENT_RESPONSE_PLAN)) {
      const plan = this.createArtifact(
        ArtifactType.INCIDENT_RESPONSE_PLAN,
        'Incident Response Plan',
        'Severity matrix, escalation paths, and communication templates',
        output,
        '.cdm/sre/incident-response-plan.md',
      );
      this.artifactStore.store(plan);
      artifacts.push(plan);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.CAPACITY_PLAN)) {
      const plan = this.createArtifact(
        ArtifactType.CAPACITY_PLAN,
        'Capacity Plan',
        'Growth projections, resource baselines, and scaling triggers',
        output,
        '.cdm/sre/capacity-plan.md',
      );
      this.artifactStore.store(plan);
      artifacts.push(plan);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.CHAOS_TEST_PLAN)) {
      const plan = this.createArtifact(
        ArtifactType.CHAOS_TEST_PLAN,
        'Chaos Test Plan',
        'Failure injection scenarios with blast radius and abort criteria',
        output,
        '.cdm/sre/chaos-test-plan.md',
      );
      this.artifactStore.store(plan);
      artifacts.push(plan);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.SLA_DEFINITION)) {
      const sla = this.createArtifact(
        ArtifactType.SLA_DEFINITION,
        'SLA Definition',
        'SLIs, SLO targets, error budgets, and measurement methodology',
        output,
        '.cdm/sre/sla-definition.md',
      );
      this.artifactStore.store(sla);
      artifacts.push(sla);
    }

    return artifacts;
  }

  protected async identifyIssues(task: AgentTask, output: string): Promise<Issue[]> {
    const parsed = this.parseClaudeOutput(output);
    const issues: Issue[] = [];

    for (const pi of parsed.issues) {
      const severity = this.resolveIssueSeverity(pi.severity);
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.RELIABILITY,
          severity,
          pi.title,
          pi.description,
          task.stage,
        ),
      );
    }

    const archDoc = task.inputArtifacts.find((a) => a.type === ArtifactType.ARCHITECTURE_DOC);
    if (archDoc) {
      const content = archDoc.content.toLowerCase();

      if (this.detectSinglePointsOfFailure(content)) {
        issues.push(this.createIssue(
          task.featureId, IssueType.RELIABILITY, IssueSeverity.CRITICAL,
          'Single points of failure detected',
          'Architecture contains components without redundancy or failover. Every critical path component must have a redundancy strategy (active-active, active-passive, or automated recovery).',
          task.stage,
        ));
      }

      if (!content.includes('slo') && !content.includes('service level') && !content.includes('availability target')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.RELIABILITY, IssueSeverity.HIGH,
          'No SLOs defined',
          'Architecture lacks Service Level Objectives. Define SLIs and SLOs for each user-facing service to enable error budget-based decision making.',
          task.stage,
        ));
      }

      if (!content.includes('incident') && !content.includes('runbook') && !content.includes('on-call')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.RELIABILITY, IssueSeverity.HIGH,
          'No incident response procedures',
          'Architecture does not reference incident management. Define severity matrix, escalation paths, and runbooks before production deployment.',
          task.stage,
        ));
      }

      if (!content.includes('capacity') && !content.includes('scaling') && !content.includes('auto-scal')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.RELIABILITY, IssueSeverity.MEDIUM,
          'Missing capacity projections',
          'No capacity planning or scaling strategy defined. Establish resource baselines and growth projections to prevent capacity-related outages.',
          task.stage,
        ));
      }
    }

    const monitoringConfig = task.inputArtifacts.find((a) => a.type === ArtifactType.MONITORING_CONFIG);
    if (!monitoringConfig) {
      issues.push(this.createIssue(
        task.featureId, IssueType.OBSERVABILITY, IssueSeverity.HIGH,
        'No monitoring configuration provided',
        'Monitoring configuration is missing. Without proper observability, incidents cannot be detected or triaged effectively. Define metrics, logs, traces, and alerting rules.',
        task.stage,
      ));
    } else {
      const monContent = monitoringConfig.content.toLowerCase();
      if (!monContent.includes('alert') && !monContent.includes('pager') && !monContent.includes('notification')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.OBSERVABILITY, IssueSeverity.MEDIUM,
          'Monitoring without alerting',
          'Monitoring configuration does not include alerting rules. Metrics without alerts mean nobody is notified when things break.',
          task.stage,
        ));
      }
    }

    const deployPlan = task.inputArtifacts.find((a) => a.type === ArtifactType.DEPLOYMENT_PLAN);
    if (deployPlan) {
      const deployContent = deployPlan.content.toLowerCase();
      if (!deployContent.includes('rollback') && !deployContent.includes('canary') && !deployContent.includes('blue-green')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.RELIABILITY, IssueSeverity.HIGH,
          'No deployment rollback strategy',
          'Deployment plan lacks rollback procedures. Define automated rollback triggers and manual rollback runbooks for each deployment stage.',
          task.stage,
        ));
      }
    }

    return issues;
  }

  private generateIncidentResponsePlan(archDoc?: Artifact, deployPlan?: Artifact): string {
    const sections: string[] = [
      '# Incident Response Plan',
      '',
      '## Severity Matrix',
      '| Severity | Criteria | Response Time | Escalation |',
      '|----------|----------|---------------|------------|',
      '| SEV1 | Complete outage, data loss, security breach | 5 min | All hands, VP notified |',
      '| SEV2 | Major feature degraded, >10% users affected | 15 min | On-call + backup |',
      '| SEV3 | Minor feature degraded, <10% users affected | 30 min | On-call during hours |',
      '| SEV4 | No user impact, monitoring alert | Next business day | On-call triage |',
      '',
      '## Roles and Responsibilities',
      '- **Incident Commander (IC)**: Coordinates response, makes decisions, owns communication',
      '- **Communications Lead**: Manages internal/external updates',
      '- **Operations Lead**: Executes mitigation steps',
      '- **Subject Matter Experts**: Provide domain-specific guidance',
      '',
      '## Escalation Paths',
      '1. Primary on-call engineer (0 min)',
      '2. Secondary on-call / team lead (15 min for SEV1, 30 min for SEV2)',
      '3. Engineering Manager (30 min for SEV1)',
      '4. VP Engineering (1 hour for SEV1)',
      '',
      '## Communication Templates',
      '### Internal Update',
      '> **Incident**: [title] | **Severity**: [SEV] | **Status**: [investigating/mitigating/resolved]',
      '> **Impact**: [description] | **Next Update**: [time]',
      '',
      '### External Customer Communication',
      '> We are aware of an issue affecting [service]. Our team is actively working on resolution.',
      '> We will provide an update within [timeframe].',
      '',
      '## Post-Incident Process',
      '- Blameless post-mortem within 48 hours',
      '- Action items with owners and due dates',
      '- Follow-up review in 2 weeks',
    ];
    return sections.join('\n');
  }

  private generateCapacityPlan(archDoc?: Artifact, deployPlan?: Artifact): string {
    const sections: string[] = [
      '# Capacity Plan',
      '',
      '## Current Baselines',
      '- CPU utilization: to be measured',
      '- Memory utilization: to be measured',
      '- Disk I/O: to be measured',
      '- Network throughput: to be measured',
      '- Connection pool utilization: to be measured',
      '',
      '## Growth Projections',
      '- 3-month forecast: baseline × 1.2',
      '- 6-month forecast: baseline × 1.5',
      '- 12-month forecast: baseline × 2.0',
      '',
      '## Scaling Triggers',
      '| Resource | Warning | Critical | Action |',
      '|----------|---------|----------|--------|',
      '| CPU | 60% | 80% | Horizontal scale-out |',
      '| Memory | 70% | 85% | Vertical scale-up or add nodes |',
      '| Disk | 75% | 90% | Expand storage, archive old data |',
      '| Connections | 60% | 80% | Increase pool size, add read replicas |',
      '',
      '## Headroom Policy',
      '- Maintain 30-40% headroom on all critical resources',
      '- Pre-scale before known traffic events (launches, promotions)',
      '',
      '## Cost Estimates',
      '- Current monthly infrastructure cost: to be calculated',
      '- Projected monthly cost at 2× scale: to be calculated',
      '- Reserved vs. on-demand optimization opportunities: to be identified',
    ];
    return sections.join('\n');
  }

  private generateChaosTestPlan(archDoc?: Artifact): string {
    const sections: string[] = [
      '# Chaos Test Plan',
      '',
      '## Principles',
      '- Build a hypothesis around steady-state behavior',
      '- Vary real-world events (server failure, network issues, dependency outage)',
      '- Run in production with safeguards (blast radius limits, abort criteria)',
      '- Automate and run continuously',
      '',
      '## Failure Scenarios',
      '',
      '### Infrastructure Failures',
      '| Scenario | Method | Blast Radius | Abort Criteria |',
      '|----------|--------|--------------|----------------|',
      '| Instance termination | Kill random instance | Single AZ | Error rate >5% |',
      '| AZ failure | Block AZ traffic | One availability zone | Service unavailable |',
      '| Network partition | iptables rules | Between services | Data inconsistency |',
      '',
      '### Application Failures',
      '| Scenario | Method | Blast Radius | Abort Criteria |',
      '|----------|--------|--------------|----------------|',
      '| Memory leak | Allocate without free | Single instance | OOM kill |',
      '| CPU saturation | Stress-ng | Single instance | Latency p99 >5s |',
      '| Disk full | dd fill | Single instance | Write failures |',
      '',
      '### Dependency Failures',
      '| Scenario | Method | Blast Radius | Abort Criteria |',
      '|----------|--------|--------------|----------------|',
      '| Database unavailable | Block DB port | Application tier | Error rate >1% |',
      '| Cache failure | Restart Redis | Application tier | Latency p99 >2s |',
      '| External API timeout | Toxiproxy delay | Single service | Circuit breaker open >5min |',
      '',
      '## Game Day Schedule',
      '- Week 1-2: Single instance failures',
      '- Week 3-4: Dependency failures',
      '- Week 5-6: AZ-level failures',
      '- Quarterly: Multi-failure combination scenarios',
    ];
    return sections.join('\n');
  }

  private generateSLADefinition(archDoc?: Artifact): string {
    const sections: string[] = [
      '# SLA Definition',
      '',
      '## Service Level Indicators (SLIs)',
      '- **Availability**: Percentage of successful requests (HTTP 2xx/3xx)',
      '- **Latency**: Request duration at p50, p95, p99',
      '- **Throughput**: Requests per second capacity',
      '- **Error Rate**: Percentage of 5xx responses',
      '',
      '## Service Level Objectives (SLOs)',
      '| SLI | Target | Measurement Window |',
      '|-----|--------|--------------------|',
      '| Availability | 99.9% | Rolling 28 days |',
      '| Latency (p99) | <500ms | Rolling 28 days |',
      '| Error Rate | <0.1% | Rolling 28 days |',
      '',
      '## Error Budgets',
      '- 99.9% availability = 43.2 min downtime per 30 days',
      '- Budget consumption tracked daily',
      '- When >80% consumed: halt non-critical deploys, prioritize reliability',
      '- When exhausted: feature freeze until budget recovers',
      '',
      '## Measurement Methodology',
      '- Server-side metrics collected at load balancer / API gateway',
      '- Synthetic monitoring from multiple regions every 60 seconds',
      '- Real User Monitoring (RUM) for client-side performance',
    ];
    return sections.join('\n');
  }

  private detectSinglePointsOfFailure(content: string): boolean {
    const spofIndicators = [
      /single\s+instance/,
      /single\s+server/,
      /one\s+database/,
      /no\s+redundan/,
      /single\s+region/,
    ];
    const hasRedundancy = content.includes('replica') || content.includes('redundan') ||
      content.includes('failover') || content.includes('multi-az') || content.includes('cluster');
    return spofIndicators.some((p) => p.test(content)) || !hasRedundancy;
  }

  private parseClaudeOutput(raw: string): ParsedOutput {
    const artifacts: ParsedArtifact[] = [];
    const issues: ParsedIssue[] = [];

    const artifactRegex = /---ARTIFACT_START---([\s\S]*?)---ARTIFACT_END---/g;
    let match: RegExpExecArray | null;
    while ((match = artifactRegex.exec(raw)) !== null) {
      const block = match[1].trim();
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const nameMatch = block.match(/^Name:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*(.+)$/m);
      const contentMatch = block.match(/Content:\s*([\s\S]*)$/m);
      if (typeMatch && nameMatch) {
        artifacts.push({
          type: typeMatch[1].trim(),
          name: nameMatch[1].trim(),
          description: descMatch?.[1]?.trim() ?? '',
          content: contentMatch?.[1]?.trim() ?? '',
        });
      }
    }

    const issueRegex = /---ISSUE_START---([\s\S]*?)---ISSUE_END---/g;
    while ((match = issueRegex.exec(raw)) !== null) {
      const block = match[1].trim();
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const sevMatch = block.match(/^Severity:\s*(.+)$/m);
      const titleMatch = block.match(/^Title:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*([\s\S]*)$/m);
      if (typeMatch && titleMatch) {
        issues.push({
          type: typeMatch[1].trim(),
          severity: sevMatch?.[1]?.trim() ?? 'medium',
          title: titleMatch[1].trim(),
          description: descMatch?.[1]?.trim() ?? '',
        });
      }
    }

    const summaryMatch = raw.match(/### Summary\s*([\s\S]*?)(?=###|---ARTIFACT_START|$)/);
    const recsMatch = raw.match(/### Recommendations\s*([\s\S]*?)$/);

    return {
      summary: summaryMatch?.[1]?.trim() ?? '',
      artifacts,
      issues,
      recommendations: recsMatch?.[1]?.trim() ?? '',
    };
  }

  private resolveArtifactType(typeStr: string): ArtifactType | null {
    const normalized = typeStr.toLowerCase().replace(/[\s_-]+/g, '_');
    const mapping: Record<string, ArtifactType> = {
      incident_response_plan: ArtifactType.INCIDENT_RESPONSE_PLAN,
      capacity_plan: ArtifactType.CAPACITY_PLAN,
      chaos_test_plan: ArtifactType.CHAOS_TEST_PLAN,
      sla_definition: ArtifactType.SLA_DEFINITION,
    };
    return mapping[normalized] ?? null;
  }

  private resolveIssueSeverity(sevStr: string): IssueSeverity {
    const mapping: Record<string, IssueSeverity> = {
      critical: IssueSeverity.CRITICAL,
      high: IssueSeverity.HIGH,
      medium: IssueSeverity.MEDIUM,
      low: IssueSeverity.LOW,
      info: IssueSeverity.INFO,
    };
    return mapping[sevStr.toLowerCase()] ?? IssueSeverity.MEDIUM;
  }
}
