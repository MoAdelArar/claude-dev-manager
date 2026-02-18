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
  CloudProvider,
} from '../types';
import { BaseAgent } from './base-agent';
import { type ArtifactStore } from '../workspace/artifact-store';
import { agentLog } from '../utils/logger';
import { getCloudProvider, type NFRContext } from '../cloud/index';

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

const DEVOPS_ENGINEER_SYSTEM_PROMPT = `You are a Senior DevOps/Platform Engineer with 12+ years of experience building
and maintaining production infrastructure, CI/CD pipelines, and deployment automation.
You are certified in AWS, GCP, and Kubernetes (CKA/CKAD).

## Core Responsibilities

### CI/CD Pipeline Design
- Design multi-stage pipelines: lint → test → build → security scan → deploy
- Implement proper branching strategies (GitFlow, trunk-based) with corresponding pipeline triggers
- Configure parallel test execution for faster feedback
- Implement artifact versioning and immutable builds
- Set up automated rollback mechanisms
- Configure pipeline caching for dependencies and build outputs
- Implement proper secret injection (never store secrets in pipeline config)

### Infrastructure as Code
- Use Terraform, CloudFormation, or Pulumi for infrastructure provisioning
- Implement proper state management (remote state, locking)
- Use modules for reusable infrastructure components
- Tag all resources for cost tracking and ownership
- Implement drift detection and remediation

### Container Orchestration
- Design Dockerfiles following best practices:
  - Multi-stage builds for minimal image size
  - Non-root user execution
  - Specific base image tags (never use :latest)
  - Proper layer ordering for cache optimization
  - Health check instructions
- Kubernetes manifests:
  - Resource limits and requests on all containers
  - Liveness, readiness, and startup probes
  - Pod disruption budgets for high availability
  - Horizontal Pod Autoscaler configuration
  - Network policies for pod-to-pod communication
  - Proper namespace isolation

### Monitoring & Observability
- Implement the three pillars: metrics, logs, traces
- Configure alerting with proper severity levels and escalation
- Set up dashboards for key business and infrastructure metrics
- Implement structured logging with correlation IDs
- Configure distributed tracing across services

### Deployment Strategies
- Blue-green deployments for zero-downtime releases
- Canary deployments for gradual rollouts
- Feature flags for controlled feature releases
- Database migration strategies (expand-contract pattern)
- Rollback procedures and automated health checks

### Security in DevOps
- Implement container image scanning in CI
- Configure SAST and DAST in pipeline
- Implement least-privilege IAM policies
- Set up secrets management (HashiCorp Vault, AWS Secrets Manager)
- Configure network segmentation and firewall rules
- Implement audit logging for infrastructure changes

## Output Standards

For deployment plans, include:
1. Pre-deployment checklist
2. Deployment steps with rollback plan for each
3. Post-deployment verification steps
4. Monitoring and alerting configuration
5. Disaster recovery procedures

For CI/CD configurations, provide:
- Complete pipeline YAML/configuration files
- Environment-specific configurations (dev, staging, prod)
- Secret references (never actual secret values)
- Cache configuration for optimal build times`;

export const DEVOPS_ENGINEER_CONFIG: AgentConfig = {
  role: AgentRole.DEVOPS_ENGINEER,
  name: 'devops-engineer',
  title: 'DevOps Engineer',
  description: 'Designs and implements CI/CD pipelines, infrastructure, deployment automation, and monitoring',
  systemPrompt: DEVOPS_ENGINEER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'cicd_pipeline',
      description: 'Design and implement CI/CD pipelines',
      allowedTools: ['Read', 'Write', 'Shell', 'Grep', 'Glob'],
      filePatterns: ['**/.github/**', '**/Dockerfile*', '**/docker-compose*', '**/*.yaml', '**/*.yml'],
    },
    {
      name: 'infrastructure',
      description: 'Infrastructure as Code and cloud configuration',
      allowedTools: ['Read', 'Write', 'Shell', 'Grep', 'Glob'],
      filePatterns: ['**/terraform/**', '**/infra/**', '**/k8s/**', '**/deploy/**'],
    },
    {
      name: 'monitoring',
      description: 'Monitoring, logging, and observability setup',
      allowedTools: ['Read', 'Write', 'Shell'],
      filePatterns: ['**/monitoring/**', '**/grafana/**', '**/prometheus/**'],
    },
  ],
  maxTokenBudget: 25000,
  allowedFilePatterns: ['**/*'],
  blockedFilePatterns: ['**/.env', '**/*.pem', '**/*.key'],
  reportsTo: AgentRole.ENGINEERING_MANAGER,
  directReports: [],
  requiredInputArtifacts: [
    ArtifactType.ARCHITECTURE_DOC,
    ArtifactType.SOURCE_CODE,
    ArtifactType.SECURITY_REPORT,
  ],
  outputArtifacts: [
    ArtifactType.DEPLOYMENT_PLAN,
    ArtifactType.INFRASTRUCTURE_CONFIG,
    ArtifactType.CI_CD_CONFIG,
    ArtifactType.MONITORING_CONFIG,
    ArtifactType.ALERTING_RULES,
    ArtifactType.SCALING_POLICY,
    ArtifactType.COST_ANALYSIS,
    ArtifactType.SLA_DEFINITION,
    ArtifactType.DISASTER_RECOVERY_PLAN,
    ArtifactType.PERFORMANCE_BENCHMARK,
    ArtifactType.RUNBOOK,
  ],
};

export default class DevOpsEngineerAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(DEVOPS_ENGINEER_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Beginning deployment and infrastructure planning', task.stage);

    const sections: string[] = [];

    const archDoc = task.inputArtifacts.find((a) => a.type === ArtifactType.ARCHITECTURE_DOC);
    const sourceCode = task.inputArtifacts.filter((a) => a.type === ArtifactType.SOURCE_CODE);
    const secReport = task.inputArtifacts.find((a) => a.type === ArtifactType.SECURITY_REPORT);

    const cloudProvider = this.detectCloudProvider(task);

    sections.push('# Deployment & Infrastructure Plan\n');
    sections.push(`**Cloud Provider:** ${cloudProvider}\n`);

    sections.push('## 1. CI/CD Pipeline Configuration\n');
    sections.push(this.generateCICDConfig(archDoc, sourceCode));

    sections.push('\n## 2. Dockerfile\n');
    sections.push(this.generateDockerfile(archDoc, sourceCode));

    sections.push('\n## 3. Deployment Plan\n');
    sections.push(this.generateDeploymentPlan(archDoc));

    sections.push('\n## 4. Infrastructure Configuration\n');
    sections.push(this.generateInfraConfig(archDoc));

    sections.push('\n## 5. Monitoring & Observability\n');
    sections.push(this.generateMonitoringConfig());

    if (secReport) {
      sections.push('\n## 6. Security Hardening\n');
      sections.push(this.addressSecurityFindings(secReport.content));
    }

    sections.push('\n## 7. Rollback Procedures\n');
    sections.push(this.generateRollbackPlan());

    const nfrCtx = this.buildNFRContext(task);
    const provider = getCloudProvider(cloudProvider);
    if (provider) {
      const nfr = provider.generateNFRArtifacts(nfrCtx);
      sections.push('\n## 8. Monitoring Configuration (Cloud-Specific)\n');
      sections.push(nfr.monitoringConfig);
      sections.push('\n## 9. Alerting Rules (Cloud-Specific)\n');
      sections.push(nfr.alertingRules);
      sections.push('\n## 10. Scaling Policy\n');
      sections.push(nfr.scalingPolicy);
      sections.push('\n## 11. Cost Analysis\n');
      sections.push(nfr.costAnalysis);
      sections.push('\n## 12. SLA / SLO / SLI Definitions\n');
      sections.push(nfr.slaDefinition);
      sections.push('\n## 13. Disaster Recovery Plan\n');
      sections.push(nfr.disasterRecoveryPlan);
      sections.push('\n## 14. Performance Benchmarks\n');
      sections.push(nfr.performanceBenchmark);
      sections.push('\n## 15. Operational Runbook\n');
      sections.push(nfr.runbook);
      agentLog(this.role, `Generated NFR artifacts for ${cloudProvider.toUpperCase()}`, task.stage);
    } else {
      agentLog(this.role, 'No cloud provider set — skipping cloud-specific NFR generation', task.stage);
    }

    const output = sections.join('\n');
    agentLog(this.role, 'Deployment planning complete', task.stage);
    return output;
  }

  protected async produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]> {
    const parsed = this.parseClaudeOutput(output);
    const artifacts: Artifact[] = [];

    if (parsed.artifacts.length > 0) {
      for (const pa of parsed.artifacts) {
        const artifactType = this.resolveArtifactType(pa.type);
        if (artifactType) {
          const artifact = this.createArtifact(
            artifactType, pa.name, pa.description, pa.content,
            `.cdm/deployment/${pa.name.toLowerCase().replace(/\s+/g, '-')}.md`,
          );
          this.artifactStore.store(artifact);
          artifacts.push(artifact);
        }
      }
    }

    if (!artifacts.some((a) => a.type === ArtifactType.DEPLOYMENT_PLAN)) {
      const plan = this.createArtifact(
        ArtifactType.DEPLOYMENT_PLAN, 'Deployment Plan',
        'Comprehensive deployment plan with rollback procedures',
        output,
        '.cdm/deployment/deployment-plan.md',
      );
      this.artifactStore.store(plan);
      artifacts.push(plan);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.CI_CD_CONFIG)) {
      const cicd = this.createArtifact(
        ArtifactType.CI_CD_CONFIG, 'CI/CD Pipeline Configuration',
        'Multi-stage CI/CD pipeline with build, test, security scan, and deploy stages',
        this.generateCICDConfig(
          task.inputArtifacts.find((a) => a.type === ArtifactType.ARCHITECTURE_DOC),
          task.inputArtifacts.filter((a) => a.type === ArtifactType.SOURCE_CODE),
        ),
        '.cdm/deployment/ci-cd-config.yaml',
      );
      this.artifactStore.store(cicd);
      artifacts.push(cicd);
    }

    const cloudProvider = this.detectCloudProvider(task);
    const provider = getCloudProvider(cloudProvider);
    if (provider) {
      const nfrCtx = this.buildNFRContext(task);
      const nfr = provider.generateNFRArtifacts(nfrCtx);
      const providerLabel = cloudProvider.toUpperCase();

      const nfrArtifactDefs: { type: ArtifactType; name: string; desc: string; content: string; file: string }[] = [
        { type: ArtifactType.MONITORING_CONFIG, name: `Monitoring Configuration (${providerLabel})`, desc: `Cloud monitoring setup for ${provider.profile.name}`, content: nfr.monitoringConfig, file: 'monitoring-config.md' },
        { type: ArtifactType.ALERTING_RULES, name: `Alerting Rules (${providerLabel})`, desc: `Alerting policies and escalation for ${provider.profile.name}`, content: nfr.alertingRules, file: 'alerting-rules.md' },
        { type: ArtifactType.SCALING_POLICY, name: `Scaling Policy (${providerLabel})`, desc: `Auto-scaling configuration for ${provider.profile.name}`, content: nfr.scalingPolicy, file: 'scaling-policy.md' },
        { type: ArtifactType.COST_ANALYSIS, name: `Cost Analysis (${providerLabel})`, desc: `Cost estimates and optimization for ${provider.profile.name}`, content: nfr.costAnalysis, file: 'cost-analysis.md' },
        { type: ArtifactType.SLA_DEFINITION, name: `SLA/SLO/SLI Definitions (${providerLabel})`, desc: `Service level objectives for ${provider.profile.name}`, content: nfr.slaDefinition, file: 'sla-definition.md' },
        { type: ArtifactType.DISASTER_RECOVERY_PLAN, name: `Disaster Recovery Plan (${providerLabel})`, desc: `DR strategy and procedures for ${provider.profile.name}`, content: nfr.disasterRecoveryPlan, file: 'disaster-recovery.md' },
        { type: ArtifactType.PERFORMANCE_BENCHMARK, name: `Performance Benchmarks (${providerLabel})`, desc: `Performance targets and load test config for ${provider.profile.name}`, content: nfr.performanceBenchmark, file: 'performance-benchmarks.md' },
        { type: ArtifactType.RUNBOOK, name: `Operational Runbook (${providerLabel})`, desc: `Incident response and operational procedures for ${provider.profile.name}`, content: nfr.runbook, file: 'runbook.md' },
      ];

      for (const def of nfrArtifactDefs) {
        if (!artifacts.some(a => a.type === def.type)) {
          const artifact = this.createArtifact(def.type, def.name, def.desc, def.content, `.cdm/deployment/${def.file}`);
          this.artifactStore.store(artifact);
          artifacts.push(artifact);
        }
      }
    }

    return artifacts;
  }

  protected async identifyIssues(task: AgentTask, output: string): Promise<Issue[]> {
    const parsed = this.parseClaudeOutput(output);
    const issues: Issue[] = [];

    for (const pi of parsed.issues) {
      const severity = this.resolveIssueSeverity(pi.severity);
      issues.push(
        this.createIssue(task.featureId, IssueType.DEPENDENCY_ISSUE, severity, pi.title, pi.description, task.stage),
      );
    }

    const archDoc = task.inputArtifacts.find((a) => a.type === ArtifactType.ARCHITECTURE_DOC);
    if (archDoc) {
      const lower = archDoc.content.toLowerCase();
      if (!lower.includes('health check') && !lower.includes('healthcheck')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ARCHITECTURE_CONCERN, IssueSeverity.MEDIUM,
          'Missing health check endpoints',
          'No health check endpoints defined. Required for load balancer and container orchestration.',
          task.stage,
        ));
      }
      if (!lower.includes('backup') && !lower.includes('disaster recovery')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.RELIABILITY, IssueSeverity.HIGH,
          'No disaster recovery plan',
          'Architecture does not describe backup or disaster recovery procedures. Define RPO/RTO targets and a DR strategy.',
          task.stage,
        ));
      }
      if (!lower.includes('scaling') && !lower.includes('autoscal') && !lower.includes('auto-scal')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.SCALABILITY, IssueSeverity.MEDIUM,
          'No scaling strategy defined',
          'Architecture does not address horizontal or vertical scaling. Define auto-scaling policies and capacity planning.',
          task.stage,
        ));
      }
      if (!lower.includes('monitor') && !lower.includes('observ') && !lower.includes('alert')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.OBSERVABILITY, IssueSeverity.HIGH,
          'No monitoring or observability strategy',
          'Architecture lacks monitoring, logging, tracing, or alerting specifications. Implement the three pillars of observability.',
          task.stage,
        ));
      }
      if (!lower.includes('cost') && !lower.includes('budget')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.COST_OPTIMIZATION, IssueSeverity.LOW,
          'No cost analysis or budget defined',
          'No cost estimates, budget alerts, or optimization strategy documented. Establish cost baselines and savings targets.',
          task.stage,
        ));
      }
      if (!lower.includes('sla') && !lower.includes('slo') && !lower.includes('sli') && !lower.includes('uptime')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.RELIABILITY, IssueSeverity.MEDIUM,
          'No SLA/SLO definitions',
          'Service level objectives not defined. Establish availability targets, latency budgets, and error rate thresholds.',
          task.stage,
        ));
      }
    }

    return issues;
  }

  private generateCICDConfig(archDoc?: Artifact, sources?: Artifact[]): string {
    return `\`\`\`yaml
name: CI/CD Pipeline
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  security-scan:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --production
      - uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: \${{ secrets.SNYK_TOKEN }}

  build:
    runs-on: ubuntu-latest
    needs: [test, security-scan]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/\${{ github.repository }}:\${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-staging:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/develop'
    environment: staging
    steps:
      - name: Deploy to staging
        run: echo "Deploy to staging environment"

  deploy-production:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - name: Deploy to production
        run: echo "Deploy to production environment"
\`\`\``;
  }

  private generateDockerfile(archDoc?: Artifact, sources?: Artifact[]): string {
    return `\`\`\`dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
WORKDIR /app
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
\`\`\``;
  }

  private generateDeploymentPlan(archDoc?: Artifact): string {
    return `### Pre-Deployment Checklist
- [ ] All tests passing on CI
- [ ] Security scan clean
- [ ] Database migrations reviewed and tested
- [ ] Feature flags configured
- [ ] Monitoring dashboards updated
- [ ] Rollback procedure verified
- [ ] Stakeholders notified

### Deployment Strategy: Blue-Green
1. Deploy new version to inactive (green) environment
2. Run smoke tests against green environment
3. Switch load balancer to green environment
4. Monitor error rates and latency for 15 minutes
5. If healthy, decommission blue environment
6. If issues detected, switch back to blue (rollback)

### Post-Deployment Verification
- [ ] Health check endpoints returning 200
- [ ] Error rate below 0.1% threshold
- [ ] P95 latency within SLA
- [ ] Key business metrics stable
- [ ] No increase in exception volume`;
  }

  private generateInfraConfig(archDoc?: Artifact): string {
    return `### Resource Requirements
- **Compute**: 2 vCPU, 4GB RAM minimum per instance
- **Instances**: 2 minimum for high availability
- **Storage**: 50GB SSD for application, 100GB for database
- **Network**: VPC with public/private subnets, NAT gateway
- **Database**: Managed service with multi-AZ, automated backups
- **Cache**: Redis cluster for session and application cache
- **CDN**: CloudFront/CloudFlare for static assets`;
  }

  private generateMonitoringConfig(): string {
    return `### Key Metrics
- Request rate, error rate, duration (RED method)
- CPU, memory, disk, network (USE method)
- Business metrics: active users, transactions/sec

### Alerting Rules
- P1 (Page): Error rate > 5%, latency P95 > 2s, service down
- P2 (Slack): Error rate > 1%, latency P95 > 1s, disk > 80%
- P3 (Email): Error rate > 0.5%, deployment completed, cert expiry < 30d`;
  }

  private addressSecurityFindings(secReport: string): string {
    return `### Security Hardening Steps
- Container runs as non-root user (UID 1001)
- Read-only filesystem where possible
- Network policies restrict pod-to-pod communication
- Secrets injected via volume mounts, not environment variables
- Image scanning in CI pipeline via Snyk/Trivy
- Runtime security monitoring enabled`;
  }

  private generateRollbackPlan(): string {
    return `### Automated Rollback Triggers
- Error rate exceeds 5% for 2 consecutive minutes
- Health check failures on > 50% of instances
- P95 latency exceeds 3x baseline for 5 minutes

### Manual Rollback Procedure
1. Identify the issue and confirm rollback decision
2. Execute: \`kubectl rollout undo deployment/app\`
3. Verify previous version is serving traffic
4. Investigate root cause
5. Fix and redeploy through normal pipeline`;
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
          type: typeMatch[1].trim(), name: nameMatch[1].trim(),
          description: descMatch?.[1]?.trim() ?? '', content: contentMatch?.[1]?.trim() ?? '',
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
          type: typeMatch[1].trim(), severity: sevMatch?.[1]?.trim() ?? 'medium',
          title: titleMatch[1].trim(), description: descMatch?.[1]?.trim() ?? '',
        });
      }
    }

    const summaryMatch = raw.match(/### Summary\s*([\s\S]*?)(?=###|---ARTIFACT_START|$)/);
    const recsMatch = raw.match(/### Recommendations\s*([\s\S]*?)$/);

    return {
      summary: summaryMatch?.[1]?.trim() ?? '',
      artifacts, issues,
      recommendations: recsMatch?.[1]?.trim() ?? '',
    };
  }

  private detectCloudProvider(task: AgentTask): CloudProvider {
    const instructions = (task.instructions ?? '').toLowerCase();
    const description = (task.description ?? '').toLowerCase();
    const combined = instructions + ' ' + description;

    if (combined.includes('cloudprovider: aws') || combined.includes('cloud_provider: aws')) return CloudProvider.AWS;
    if (combined.includes('cloudprovider: gcp') || combined.includes('cloud_provider: gcp')) return CloudProvider.GCP;
    if (combined.includes('cloudprovider: azure') || combined.includes('cloud_provider: azure')) return CloudProvider.AZURE;

    for (const artifact of task.inputArtifacts) {
      const content = (artifact.content ?? '').toLowerCase();
      if (content.includes('aws') || content.includes('amazon') || content.includes('cloudformation') || content.includes('ecs') || content.includes('lambda')) return CloudProvider.AWS;
      if (content.includes('gcp') || content.includes('google cloud') || content.includes('gke') || content.includes('cloud run')) return CloudProvider.GCP;
      if (content.includes('azure') || content.includes('aks') || content.includes('bicep') || content.includes('app service')) return CloudProvider.AZURE;
    }

    return CloudProvider.AWS;
  }

  private buildNFRContext(task: AgentTask): NFRContext {
    const instructions = task.instructions ?? '';
    const langMatch = instructions.match(/Language:\s*(\w+)/);
    const frameworkMatch = instructions.match(/Framework:\s*(\w+)/);
    const deployMatch = instructions.match(/deployTarget:\s*(\w+)/i);

    return {
      projectName: task.title.replace(/^.*for\s+"(.+)"$/, '$1').replace(/"/g, '') || 'project',
      language: langMatch?.[1] ?? 'typescript',
      framework: frameworkMatch?.[1] ?? 'node',
      deployTarget: deployMatch?.[1] ?? 'docker',
      featureDescription: task.description,
    };
  }

  private resolveArtifactType(typeStr: string): ArtifactType | null {
    const normalized = typeStr.toLowerCase().replace(/[\s_-]+/g, '_');
    const mapping: Record<string, ArtifactType> = {
      deployment_plan: ArtifactType.DEPLOYMENT_PLAN,
      infrastructure_config: ArtifactType.INFRASTRUCTURE_CONFIG,
      ci_cd_config: ArtifactType.CI_CD_CONFIG,
      monitoring_config: ArtifactType.MONITORING_CONFIG,
      alerting_rules: ArtifactType.ALERTING_RULES,
      scaling_policy: ArtifactType.SCALING_POLICY,
      cost_analysis: ArtifactType.COST_ANALYSIS,
      sla_definition: ArtifactType.SLA_DEFINITION,
      disaster_recovery_plan: ArtifactType.DISASTER_RECOVERY_PLAN,
      performance_benchmark: ArtifactType.PERFORMANCE_BENCHMARK,
      runbook: ArtifactType.RUNBOOK,
    };
    return mapping[normalized] ?? null;
  }

  private resolveIssueSeverity(sevStr: string): IssueSeverity {
    const mapping: Record<string, IssueSeverity> = {
      critical: IssueSeverity.CRITICAL, high: IssueSeverity.HIGH,
      medium: IssueSeverity.MEDIUM, low: IssueSeverity.LOW, info: IssueSeverity.INFO,
    };
    return mapping[sevStr.toLowerCase()] ?? IssueSeverity.MEDIUM;
  }
}
