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

const SOLUTIONS_ARCHITECT_SYSTEM_PROMPT = `Solutions Architect. Evaluates technologies, designs integration patterns, and plans migrations.

Technology evaluation: weighted scoring matrices, ADRs (Context/Decision/Consequences/Review date), TCO analysis, maturity/community/performance/cost/license/vendor-lock-in assessment, ≥3 alternatives per decision.
Integration patterns: API gateway (routing, composition, rate limiting), event sourcing/CQRS, saga (choreography vs orchestration), service mesh (mTLS, traffic management), CDC pipelines, legacy adapters (strangler fig, facade, anti-corruption layer).
Migration: Strangler Fig (incremental+traffic shifting), Parallel Run (dual-write+reconciliation), Big Bang (with rollback plan), Blue-Green, database expand-contract, phased rollout with feature flags.
Cloud: multi-cloud/hybrid placement, 12-factor+serverless+managed services, cost optimization (FinOps, right-sizing), DR (RPO/RTO, pilot light, warm standby, active-active).
Output: ADR + Integration Plan (context diagram, data flows, API contracts, error/retry/monitoring) + Migration Strategy (current→target, phased plan, risk register, rollback per phase, success criteria). Quantify trade-offs with cost/timeline/risk estimates.`;

export const SOLUTIONS_ARCHITECT_CONFIG: AgentConfig = {
  role: AgentRole.SOLUTIONS_ARCHITECT,
  name: 'solutions-architect',
  title: 'Solutions Architect',
  description: 'Evaluates technology choices, designs integration strategies, makes build-vs-buy decisions, and creates migration plans. Bridges business requirements with technical reality.',
  systemPrompt: SOLUTIONS_ARCHITECT_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'technology_evaluation',
      description: 'Evaluates technology options and produces decision records',
      allowedTools: ['Read', 'Write', 'Grep', 'Glob'],
      filePatterns: ['**/*.md', '**/*.yaml'],
    },
    {
      name: 'integration_design',
      description: 'Designs system integration strategies and API contracts',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/integration/**', '**/architecture/**'],
    },
    {
      name: 'migration_planning',
      description: 'Creates phased migration plans with rollback strategies',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/migration/**'],
    },
  ],
  maxTokenBudget: 30000,
  allowedFilePatterns: ['docs/**', '**/*.md', 'architecture/**'],
  blockedFilePatterns: ['src/**', 'test/**'],
  reportsTo: AgentRole.ENGINEERING_MANAGER,
  directReports: [],
  requiredInputArtifacts: [
    ArtifactType.REQUIREMENTS_DOC,
    ArtifactType.ARCHITECTURE_DOC,
  ],
  outputArtifacts: [
    ArtifactType.TECHNOLOGY_DECISION_RECORD,
    ArtifactType.INTEGRATION_PLAN,
    ArtifactType.MIGRATION_STRATEGY,
  ],
};

export default class SolutionsArchitectAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(SOLUTIONS_ARCHITECT_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Beginning technology evaluation and integration analysis', task.stage);

    const sections: string[] = [];
    sections.push('# Solutions Architecture Analysis\n');

    const requirementsDoc = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.REQUIREMENTS_DOC,
    );
    const archDoc = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.ARCHITECTURE_DOC,
    );
    const sourceArtifacts = task.inputArtifacts.filter(
      (a) => a.type === ArtifactType.SOURCE_CODE,
    );

    sections.push('## Input Analysis\n');
    sections.push(`- Requirements document: ${requirementsDoc ? 'Available' : 'Not provided'}`);
    sections.push(`- Architecture document: ${archDoc ? 'Available' : 'Not provided'}`);
    sections.push(`- Source code artifacts: ${sourceArtifacts.length}`);

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: TECHNOLOGY_DECISION_RECORD');
    sections.push('Name: Technology Decision Record');
    sections.push('Description: ADR documenting technology choices with context, decision, and consequences');
    sections.push('Content:');
    sections.push(this.generateTechnologyDecisionRecord(requirementsDoc, archDoc));
    sections.push('---ARTIFACT_END---\n');

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: INTEGRATION_PLAN');
    sections.push('Name: Integration Plan');
    sections.push('Description: System integration strategy with data flows, API contracts, and error handling');
    sections.push('Content:');
    sections.push(this.generateIntegrationPlan(archDoc));
    sections.push('---ARTIFACT_END---\n');

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: MIGRATION_STRATEGY');
    sections.push('Name: Migration Strategy');
    sections.push('Description: Phased migration plan with rollback procedures and success criteria');
    sections.push('Content:');
    sections.push(this.generateMigrationStrategy(archDoc, sourceArtifacts));
    sections.push('---ARTIFACT_END---\n');

    agentLog(this.role, 'Solutions architecture analysis complete', task.stage);
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
            `.cdm/solutions-architecture/${pa.name.toLowerCase().replace(/\s+/g, '-')}.md`,
          );
          this.artifactStore.store(artifact);
          artifacts.push(artifact);
        }
      }
    }

    if (!artifacts.some((a) => a.type === ArtifactType.TECHNOLOGY_DECISION_RECORD)) {
      const tdr = this.createArtifact(
        ArtifactType.TECHNOLOGY_DECISION_RECORD,
        'Technology Decision Record',
        'ADR documenting technology choices with context, decision, and consequences',
        output,
        '.cdm/solutions-architecture/technology-decision-record.md',
      );
      this.artifactStore.store(tdr);
      artifacts.push(tdr);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.INTEGRATION_PLAN)) {
      const plan = this.createArtifact(
        ArtifactType.INTEGRATION_PLAN,
        'Integration Plan',
        'System integration strategy with data flows and API contracts',
        output,
        '.cdm/solutions-architecture/integration-plan.md',
      );
      this.artifactStore.store(plan);
      artifacts.push(plan);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.MIGRATION_STRATEGY)) {
      const strategy = this.createArtifact(
        ArtifactType.MIGRATION_STRATEGY,
        'Migration Strategy',
        'Phased migration plan with rollback procedures',
        output,
        '.cdm/solutions-architecture/migration-strategy.md',
      );
      this.artifactStore.store(strategy);
      artifacts.push(strategy);
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
          IssueType.ARCHITECTURE_CONCERN,
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

      if (this.detectVendorLockIn(content)) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ARCHITECTURE_CONCERN, IssueSeverity.HIGH,
          'Vendor lock-in risk detected',
          'Architecture relies heavily on proprietary services without abstraction layers. Consider introducing adapter patterns or multi-cloud abstractions to reduce switching costs.',
          task.stage,
        ));
      }

      if (!content.includes('integration') && !content.includes('api gateway') && !content.includes('message broker')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ARCHITECTURE_CONCERN, IssueSeverity.MEDIUM,
          'Missing integration strategy',
          'Architecture document does not describe system integration points. Define API contracts, message formats, and data flow between components.',
          task.stage,
        ));
      }

      if (!content.includes('migration') && !content.includes('rollback') && !content.includes('backward compat')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ARCHITECTURE_CONCERN, IssueSeverity.MEDIUM,
          'No migration or rollback strategy defined',
          'Architecture lacks migration planning. Define how to transition from current state to target state with rollback procedures.',
          task.stage,
        ));
      }

      if (this.detectTechDebtRisk(content)) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ARCHITECTURE_CONCERN, IssueSeverity.MEDIUM,
          'Technical debt risk from technology choices',
          'Some technology choices may introduce long-term maintenance burden. Consider documenting ADRs with review dates for reassessment.',
          task.stage,
        ));
      }

      if (!content.includes('cost') && !content.includes('budget') && !content.includes('pricing')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.COST_OPTIMIZATION, IssueSeverity.LOW,
          'Missing cost analysis for technology choices',
          'No cost considerations found in architecture. Include TCO estimates for infrastructure, licensing, and operational costs.',
          task.stage,
        ));
      }
    }

    const reqDoc = task.inputArtifacts.find((a) => a.type === ArtifactType.REQUIREMENTS_DOC);
    if (reqDoc) {
      const reqContent = reqDoc.content.toLowerCase();
      if ((reqContent.includes('scale') || reqContent.includes('growth')) && archDoc) {
        const archContent = archDoc.content.toLowerCase();
        if (!archContent.includes('scaling') && !archContent.includes('horizontal') && !archContent.includes('auto-scal')) {
          issues.push(this.createIssue(
            task.featureId, IssueType.SCALABILITY, IssueSeverity.HIGH,
            'Scalability requirements not addressed in architecture',
            'Requirements mention scale/growth but architecture does not describe scaling strategies. Define horizontal scaling, caching, and load distribution approaches.',
            task.stage,
          ));
        }
      }
    }

    return issues;
  }

  private generateTechnologyDecisionRecord(reqDoc?: Artifact, archDoc?: Artifact): string {
    const sections: string[] = [
      '# Technology Decision Record',
      '',
      '## Status',
      'Proposed',
      '',
      '## Context',
      reqDoc
        ? 'Based on the requirements document, the following technology decisions are needed.'
        : 'Requirements document not provided — decisions based on available architecture context.',
      '',
      '## Decision Drivers',
      '- Time-to-market requirements',
      '- Team expertise and hiring availability',
      '- Long-term maintainability',
      '- Vendor independence',
      '- Cost efficiency',
      '- Security and compliance requirements',
      '',
      '## Options Considered',
      'Detailed analysis required for each technology category with at least 3 alternatives.',
      '',
      '## Decision',
      'Pending full analysis with weighted scoring matrix.',
      '',
      '## Consequences',
      '',
      '### Positive',
      '- To be determined based on selected options',
      '',
      '### Negative',
      '- To be determined based on trade-offs accepted',
      '',
      '### Risks',
      '- Vendor lock-in potential',
      '- Skill gap in team',
      '- Migration complexity',
      '',
      '## Review Date',
      'Reassess in 6 months or when significant requirements change.',
    ];
    return sections.join('\n');
  }

  private generateIntegrationPlan(archDoc?: Artifact): string {
    const sections: string[] = [
      '# Integration Plan',
      '',
      '## System Context',
      archDoc
        ? 'Integration points identified from architecture document.'
        : 'Architecture document not provided — generic integration framework defined.',
      '',
      '## Integration Patterns',
      '- **Synchronous**: REST/gRPC for request-response interactions',
      '- **Asynchronous**: Message broker for event-driven workflows',
      '- **Batch**: Scheduled ETL for data synchronization',
      '',
      '## Data Flow Mapping',
      'Define source → transformation → destination for each integration.',
      '',
      '## API Contracts',
      'Versioned API specifications required for each integration point.',
      '',
      '## Error Handling',
      '- Retry with exponential backoff',
      '- Dead letter queues for failed messages',
      '- Circuit breaker for external dependencies',
      '',
      '## Monitoring',
      '- Integration health dashboards',
      '- Latency and error rate alerting',
      '- Data reconciliation checks',
    ];
    return sections.join('\n');
  }

  private generateMigrationStrategy(archDoc?: Artifact, sources?: Artifact[]): string {
    const sections: string[] = [
      '# Migration Strategy',
      '',
      '## Current State Assessment',
      `- Source systems identified: ${sources?.length ?? 0}`,
      '- Architecture baseline: ' + (archDoc ? 'documented' : 'not documented'),
      '',
      '## Recommended Approach: Strangler Fig Pattern',
      '- Incrementally replace components behind a routing layer',
      '- Feature flags control traffic shifting between old and new',
      '- Each phase is independently rollback-able',
      '',
      '## Migration Phases',
      '### Phase 1: Foundation',
      '- Set up routing layer / API gateway',
      '- Establish dual-write infrastructure',
      '- Deploy monitoring and reconciliation',
      '',
      '### Phase 2: Core Migration',
      '- Migrate core business logic modules',
      '- Validate with shadow traffic',
      '- Gradual traffic shifting (10% → 50% → 100%)',
      '',
      '### Phase 3: Data Migration',
      '- Schema migration with expand-contract pattern',
      '- Data validation and reconciliation',
      '- Cut over with rollback window',
      '',
      '### Phase 4: Cleanup',
      '- Decommission legacy components',
      '- Remove dual-write infrastructure',
      '- Update documentation',
      '',
      '## Rollback Procedures',
      '- Each phase has a documented rollback runbook',
      '- Automated rollback triggers based on error rate thresholds',
      '- Data rollback through point-in-time recovery',
      '',
      '## Success Criteria',
      '- Zero data loss during migration',
      '- P99 latency within 10% of baseline',
      '- Error rate below 0.1% post-migration',
    ];
    return sections.join('\n');
  }

  private detectVendorLockIn(content: string): boolean {
    const proprietaryPatterns = [
      /aws\s+lambda.*without.*abstraction/,
      /dynamodb.*only/,
      /cloud\s+spanner.*only/,
      /azure\s+functions.*without.*abstraction/,
    ];
    const hasProprietaryService = /\b(dynamodb|cosmos\s*db|cloud\s*spanner|bigquery|aurora\s*serverless)\b/.test(content);
    const lacksAbstraction = !content.includes('abstraction') && !content.includes('adapter') && !content.includes('portable');
    return hasProprietaryService && lacksAbstraction;
  }

  private detectTechDebtRisk(content: string): boolean {
    const riskIndicators = [
      /deprecated/,
      /legacy.*integration/,
      /temporary.*solution/,
      /workaround/,
      /tech\s*debt/,
      /prototype.*production/,
    ];
    return riskIndicators.some((p) => p.test(content));
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
      technology_decision_record: ArtifactType.TECHNOLOGY_DECISION_RECORD,
      integration_plan: ArtifactType.INTEGRATION_PLAN,
      migration_strategy: ArtifactType.MIGRATION_STRATEGY,
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
