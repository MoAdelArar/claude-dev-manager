import { v4 as uuidv4 } from 'uuid';
import {
  type AgentConfig,
  AgentRole,
  type AgentTask,
  type Artifact,
  ArtifactType,
  type Issue,
  IssueType,
  IssueSeverity,
  ArtifactStatus,
  ReviewStatus,
} from '../types';
import { BaseAgent } from './base-agent';
import { type ArtifactStore } from '../workspace/artifact-store';
import { agentLog } from '../utils/logger';

const OPERATOR_SYSTEM_PROMPT = `You handle deployment, infrastructure, and operational readiness.
You produce configs, runbooks, and monitoring setups. You think about reliability,
scalability, and observability. You ensure systems are production-ready.`;

export const OPERATOR_CONFIG: AgentConfig = {
  role: AgentRole.OPERATOR,
  name: 'operator',
  title: 'Operator',
  description: 'Handles CI/CD, deployment, infrastructure, and monitoring configuration',
  systemPrompt: OPERATOR_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'ci_cd',
      description: 'Configures CI/CD pipelines',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['.github/**/*', '.gitlab-ci.yml', 'Jenkinsfile', 'azure-pipelines.yml'],
    },
    {
      name: 'deployment',
      description: 'Creates deployment configurations',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['deploy/**/*', 'k8s/**/*', 'terraform/**/*', 'docker-compose*'],
    },
    {
      name: 'monitoring',
      description: 'Configures monitoring and alerting',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['monitoring/**/*', 'grafana/**/*', 'prometheus/**/*'],
    },
  ],
  maxTokenBudget: 30000,
  allowedFilePatterns: [
    '.github/**/*',
    'deploy/**/*',
    'k8s/**/*',
    'terraform/**/*',
    'monitoring/**/*',
    'docs/**/*',
  ],
  blockedFilePatterns: ['src/**/*', 'test/**/*'],
  compatibleSkills: ['ci-cd', 'deployment', 'monitoring'],
  requiredInputArtifacts: [ArtifactType.SOURCE_CODE],
  outputArtifacts: [
    ArtifactType.CI_CD_CONFIG,
    ArtifactType.DEPLOYMENT_PLAN,
    ArtifactType.INFRASTRUCTURE_CONFIG,
    ArtifactType.MONITORING_CONFIG,
    ArtifactType.RUNBOOK,
  ],
};

interface ParsedArtifact {
  type: string;
  name: string;
  description: string;
  content: string;
  filePath?: string;
}

interface ParsedIssue {
  type: string;
  severity: string;
  title: string;
  description: string;
}

export class OperatorAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(OPERATOR_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, `Starting operations work: ${task.title}`, task.step);

    const sections: string[] = [];
    sections.push('# Operations Output\n');

    sections.push('## Context\n');
    sections.push(`- Active Skills: ${task.activeSkills?.join(', ') || 'None'}`);

    if (task.activeSkills?.includes('ci-cd')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: ci_cd_config');
      sections.push('Name: CI/CD Configuration');
      sections.push('Description: Continuous integration and deployment pipeline');
      sections.push('FilePath: .github/workflows/ci.yml');
      sections.push('Content:');
      sections.push(this.generateCiCdConfig(task));
      sections.push('---ARTIFACT_END---\n');
    }

    if (task.activeSkills?.includes('deployment')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: deployment_plan');
      sections.push('Name: Deployment Plan');
      sections.push('Description: Deployment strategy and configuration');
      sections.push('Content:');
      sections.push(this.generateDeploymentPlan(task));
      sections.push('---ARTIFACT_END---\n');

      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: infrastructure_config');
      sections.push('Name: Infrastructure Configuration');
      sections.push('Description: Infrastructure as code configuration');
      sections.push('Content:');
      sections.push(this.generateInfraConfig(task));
      sections.push('---ARTIFACT_END---\n');
    }

    if (task.activeSkills?.includes('monitoring')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: monitoring_config');
      sections.push('Name: Monitoring Configuration');
      sections.push('Description: Monitoring and alerting setup');
      sections.push('Content:');
      sections.push(this.generateMonitoringConfig(task));
      sections.push('---ARTIFACT_END---\n');

      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: runbook');
      sections.push('Name: Operations Runbook');
      sections.push('Description: Operational procedures and incident response');
      sections.push('Content:');
      sections.push(this.generateRunbook(task));
      sections.push('---ARTIFACT_END---\n');
    }

    sections.push('\n## Summary\n');
    sections.push('Operations configuration completed.');

    agentLog(this.role, `Completed operations work: ${task.title}`, task.step);
    return sections.join('\n');
  }

  protected async produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]> {
    const parsed = this.parseOutput(output);
    const artifacts: Artifact[] = [];

    for (const pa of parsed.artifacts) {
      const artifactType = this.resolveArtifactType(pa.type);
      if (artifactType) {
        const artifact: Artifact = {
          id: uuidv4(),
          type: artifactType,
          name: pa.name,
          description: pa.description,
          filePath: pa.filePath || `.cdm/operations/${pa.name.toLowerCase().replace(/\s+/g, '-')}.md`,
          createdBy: this.role,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
          content: pa.content,
          metadata: {
            taskId: task.id,
            featureId: task.featureId,
            skills: task.activeSkills,
          },
          status: ArtifactStatus.DRAFT,
          reviewStatus: ReviewStatus.PENDING,
        };
        this.artifactStore.store(artifact);
        artifacts.push(artifact);
      }
    }

    return artifacts;
  }

  protected async identifyIssues(task: AgentTask, output: string): Promise<Issue[]> {
    const parsed = this.parseOutput(output);
    const issues: Issue[] = [];

    for (const pi of parsed.issues) {
      issues.push(
        this.createIssue(
          task.featureId,
          this.resolveIssueType(pi.type),
          this.resolveSeverity(pi.severity),
          pi.title,
          pi.description,
          task.step,
        ),
      );
    }

    return issues;
  }

  private generateCiCdConfig(_task: AgentTask): string {
    return `name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to staging
        run: echo "Deploy to staging environment"
`;
  }

  private generateDeploymentPlan(task: AgentTask): string {
    return `# Deployment Plan

## Overview
Deployment strategy for: ${task.title}

## Deployment Strategy
- **Type**: Rolling Update
- **Health Check**: HTTP /health endpoint
- **Rollback**: Automatic on failure

## Pre-deployment Checklist
- [ ] All tests passing
- [ ] Database migrations prepared
- [ ] Environment variables configured
- [ ] Monitoring alerts configured

## Deployment Steps
1. Run database migrations (if any)
2. Deploy to staging environment
3. Run smoke tests
4. Deploy to production (canary 10%)
5. Monitor metrics for 15 minutes
6. Full rollout if healthy

## Rollback Procedure
1. Identify issue trigger
2. Execute rollback command
3. Verify previous version healthy
4. Investigate and fix
5. Re-deploy when ready

## Post-deployment
- [ ] Verify health checks passing
- [ ] Check error rates
- [ ] Monitor performance metrics
- [ ] Update status page
`;
  }

  private generateInfraConfig(_task: AgentTask): string {
    return `# Infrastructure Configuration

## Resources

### Compute
- Type: Container/Serverless
- Scaling: Auto-scaling based on CPU/memory

### Database
- Type: Managed database service
- Backup: Daily automated backups
- Replication: Multi-AZ for production

### Network
- Load Balancer: Application load balancer
- CDN: For static assets
- SSL: Managed certificates

## Environment Variables
\`\`\`
NODE_ENV=production
LOG_LEVEL=info
DATABASE_URL=<secret>
\`\`\`

## Security Groups
- Ingress: 80, 443 from internet
- Egress: All traffic allowed
- Internal: Service-to-service communication
`;
  }

  private generateMonitoringConfig(_task: AgentTask): string {
    return `# Monitoring Configuration

## Metrics

### Application Metrics
- Request latency (p50, p95, p99)
- Error rate
- Request throughput
- Active connections

### Infrastructure Metrics
- CPU utilization
- Memory usage
- Disk I/O
- Network traffic

## SLOs

| SLI | Target | Measurement |
|-----|--------|-------------|
| Availability | 99.9% | Uptime over 30 days |
| Latency p95 | < 200ms | Request duration |
| Error Rate | < 0.1% | 5xx responses |

## Alerts

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| High Error Rate | > 1% for 5min | Critical | Page on-call |
| High Latency | p95 > 500ms for 10min | Warning | Investigate |
| Low Disk Space | < 20% free | Warning | Expand storage |

## Dashboards
- Overview: Health, traffic, errors
- Performance: Latency distribution, throughput
- Infrastructure: Resource utilization
`;
  }

  private generateRunbook(task: AgentTask): string {
    return `# Operations Runbook

## Service Overview
- **Service**: ${task.title}
- **On-call**: Refer to rotation schedule
- **Escalation**: See escalation matrix

## Common Issues

### High Error Rate
**Symptoms**: Error rate > 1%, alerts firing
**Steps**:
1. Check recent deployments
2. Review error logs
3. Check dependent services
4. Consider rollback if deploy-related

### High Latency
**Symptoms**: p95 latency > 500ms
**Steps**:
1. Check database query performance
2. Review cache hit rates
3. Check for resource contention
4. Scale horizontally if needed

### Service Unavailable
**Symptoms**: Health check failures
**Steps**:
1. Check instance health
2. Verify network connectivity
3. Check database connection
4. Review recent changes

## Incident Response

### Severity Levels
- **SEV1**: Complete outage, all customers affected
- **SEV2**: Partial outage, major feature unavailable
- **SEV3**: Degraded performance, minor impact
- **SEV4**: Cosmetic issues, no customer impact

### Communication
- Update status page
- Notify stakeholders
- Post-incident review within 48h

## Contacts
- Engineering Lead: [Contact]
- Platform Team: [Contact]
- Security Team: [Contact]
`;
  }

  private parseOutput(output: string): { artifacts: ParsedArtifact[]; issues: ParsedIssue[] } {
    const artifacts: ParsedArtifact[] = [];
    const issues: ParsedIssue[] = [];

    const artifactRegex = /---ARTIFACT_START---([\s\S]*?)---ARTIFACT_END---/g;
    let match: RegExpExecArray | null;

    while ((match = artifactRegex.exec(output)) !== null) {
      const block = match[1].trim();
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const nameMatch = block.match(/^Name:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*(.+)$/m);
      const filePathMatch = block.match(/^FilePath:\s*(.+)$/m);
      const contentMatch = block.match(/Content:\s*([\s\S]*)$/m);

      if (typeMatch && nameMatch) {
        artifacts.push({
          type: typeMatch[1].trim(),
          name: nameMatch[1].trim(),
          description: descMatch?.[1]?.trim() ?? '',
          content: contentMatch?.[1]?.trim() ?? '',
          filePath: filePathMatch?.[1]?.trim(),
        });
      }
    }

    const issueRegex = /---ISSUE_START---([\s\S]*?)---ISSUE_END---/g;
    while ((match = issueRegex.exec(output)) !== null) {
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

    return { artifacts, issues };
  }

  private resolveArtifactType(typeStr: string): ArtifactType | null {
    const normalized = typeStr.toLowerCase().replace(/[\s_-]+/g, '_');
    const mapping: Record<string, ArtifactType> = {
      ci_cd_config: ArtifactType.CI_CD_CONFIG,
      deployment_plan: ArtifactType.DEPLOYMENT_PLAN,
      infrastructure_config: ArtifactType.INFRASTRUCTURE_CONFIG,
      monitoring_config: ArtifactType.MONITORING_CONFIG,
      runbook: ArtifactType.RUNBOOK,
    };
    return mapping[normalized] ?? null;
  }

  private resolveIssueType(typeStr: string): IssueType {
    const normalized = typeStr.toLowerCase().replace(/[\s_-]+/g, '_');
    const mapping: Record<string, IssueType> = {
      reliability: IssueType.RELIABILITY,
      scalability: IssueType.SCALABILITY,
      observability: IssueType.OBSERVABILITY,
    };
    return mapping[normalized] ?? IssueType.RELIABILITY;
  }

  private resolveSeverity(sevStr: string): IssueSeverity {
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
