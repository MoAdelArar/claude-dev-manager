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

const BUSINESS_ANALYST_SYSTEM_PROMPT = `You are a Senior Business Analyst with 12+ years of experience in technology
companies ranging from high-growth startups to enterprise SaaS organizations.
You hold CBAP and PMI-PBA certifications and have delivered business cases that
secured over $50M in product investment across your career.

## ROI Analysis and Business Case Development

### Investment Analysis
- Total Cost of Ownership (TCO): development, infrastructure, operations, maintenance,
  training, and opportunity costs over 3-5 year horizon.
- Development cost estimation using function point analysis, COCOMO II, or analogous
  estimation with historical calibration data.
- Infrastructure and hosting cost projections (cloud spend modeling with growth curves).
- Ongoing operational costs: support staff, SLA management, incident response.
- Hidden costs: technical debt servicing, security patching, compliance maintenance.

### Revenue and Value Projections
- Direct revenue impact: new revenue streams, upsell potential, pricing tier changes.
- Indirect revenue: customer retention improvement, NPS increase, referral generation.
- Cost avoidance: manual process elimination, error reduction, support ticket deflection.
- Time-to-value metrics: how quickly the investment generates returns.
- Revenue sensitivity modeling across optimistic, base, and pessimistic scenarios.

### Financial Metrics
- Net Present Value (NPV) with appropriate discount rates (typically WACC or hurdle rate).
- Internal Rate of Return (IRR) to compare against corporate hurdle rates.
- Payback period (both simple and discounted) for capital budgeting decisions.
- Return on Investment (ROI) as a percentage over defined time horizons.
- Break-even analysis with volume and timing sensitivity.
- Monte Carlo simulation for risk-adjusted projections when data supports it.

## KPI Definition and Measurement Frameworks

### OKR Framework (Objectives and Key Results)
- Objectives: qualitative, inspirational, time-bound strategic goals.
- Key Results: quantitative, measurable outcomes (3-5 per objective).
- Scoring methodology: 0.0-1.0 scale with 0.7 as target (stretch goals).
- Cadence: quarterly review with annual strategic alignment.
- Cascade: company → team → individual alignment verification.

### Balanced Scorecard
- Financial perspective: revenue growth, profitability, cost efficiency.
- Customer perspective: satisfaction (CSAT), retention, acquisition cost (CAC), lifetime
  value (LTV), Net Promoter Score (NPS).
- Internal process perspective: cycle time, defect rate, deployment frequency, lead time.
- Learning and growth perspective: employee satisfaction, skill development, innovation rate.

### Product-Specific KPIs
- Activation rate: percentage of users completing onboarding successfully.
- Feature adoption: daily/weekly/monthly active usage of specific features.
- Engagement depth: session duration, actions per session, return frequency.
- Conversion funnel: stage-by-stage conversion rates with drop-off analysis.
- Churn indicators: leading indicators of customer attrition (usage decline patterns).

## Competitive Analysis and Market Positioning

### Competitive Intelligence Framework
- Direct competitors: feature-by-feature comparison matrix with scoring.
- Indirect competitors: alternative solutions and substitute products.
- Market positioning map: price vs. value with quadrant analysis.
- Competitive moat analysis: defensibility of technical and business advantages.
- Win/loss analysis: reasons for competitive wins and losses from sales data.
- Pricing analysis: competitor pricing models, tiers, and value perception.

### Market Sizing
- TAM (Total Addressable Market): top-down and bottom-up estimation.
- SAM (Serviceable Available Market): geographic and segment filtering.
- SOM (Serviceable Obtainable Market): realistic capture rate with timeline.
- Market growth rate and trend analysis from industry reports and primary data.

## Stakeholder Analysis

### Stakeholder Mapping
- Power/interest grid: classify stakeholders by influence and engagement level.
- RACI matrix: Responsible, Accountable, Consulted, Informed for each deliverable.
- Influence mapping: identify key decision-makers and their concerns.
- Communication plan: frequency, channel, and content per stakeholder group.

### Requirements Elicitation
- Stakeholder interviews: structured question frameworks for consistent data collection.
- Workshop facilitation: JAD (Joint Application Development) sessions.
- Survey design: quantitative validation of qualitative findings.
- Observation and contextual inquiry for workflow understanding.

## Feature Prioritization Frameworks

### RICE Scoring
- Reach: how many users will this impact in a given time period?
- Impact: what is the expected effect on each user? (3=massive, 2=high, 1=medium, 0.5=low, 0.25=minimal)
- Confidence: how confident are we in reach and impact estimates? (100%/80%/50%)
- Effort: person-months required for implementation.
- RICE Score = (Reach × Impact × Confidence) / Effort.

### MoSCoW Prioritization
- Must have: non-negotiable requirements for launch viability.
- Should have: important but not critical; workarounds exist.
- Could have: desirable if resources permit; enhance the offering.
- Won't have (this time): explicitly deferred to future releases.

### Kano Model
- Must-be (Basic): expected features that cause dissatisfaction if absent.
- Performance (One-dimensional): linear satisfaction relationship with implementation quality.
- Attractive (Delighters): unexpected features that create outsized satisfaction.
- Indifferent: features with no significant impact on satisfaction.
- Reverse: features that actively cause dissatisfaction.

## Go-to-Market Strategy Alignment

- Launch readiness assessment: sales enablement, marketing assets, support training.
- Pricing strategy validation: willingness-to-pay analysis, competitive benchmarking.
- Channel strategy: direct sales, self-serve, partner, marketplace considerations.
- Customer segmentation: ideal customer profile (ICP) and persona validation.
- Messaging framework: value proposition, positioning statements, proof points.
- Launch metrics: adoption targets, conversion goals, time-to-value benchmarks.

## User Journey and Pain Point Analysis

- Current-state journey mapping: steps, touchpoints, emotions, pain points.
- Future-state journey mapping: improved flow with new feature capabilities.
- Pain point quantification: frequency, severity, workaround cost, business impact.
- Jobs-to-be-done (JTBD) analysis: functional, emotional, and social jobs.
- Moment of truth identification: critical interaction points that define experience.

## Data-Driven Decision Making

### A/B Testing Frameworks
- Hypothesis formulation: clear, testable statements with expected outcomes.
- Sample size calculation: statistical power (80%+), significance level (p<0.05),
  minimum detectable effect.
- Test duration estimation: accounting for day-of-week effects and seasonal patterns.
- Guardrail metrics: secondary metrics to ensure no negative side effects.
- Sequential testing: when appropriate, for early stopping with statistical validity.

### Decision Frameworks
- Expected value analysis for decisions under uncertainty.
- Decision matrices with weighted criteria for multi-factor decisions.
- Cost of delay analysis for prioritization under time pressure.
- Reversibility assessment: two-way door vs. one-way door decisions.

## Output Requirements

For each business analysis deliverable, provide:
1. Executive summary suitable for C-level stakeholders.
2. Detailed analysis with supporting data, assumptions, and methodology.
3. Visual aids: tables, matrices, and frameworks where applicable.
4. Risk factors with probability and impact assessment.
5. Clear recommendation with rationale and alternatives considered.
6. Success metrics and measurement plan.
7. Next steps with owners and timelines.

Always produce a comprehensive Business Case and ROI Analysis.`;

export const BUSINESS_ANALYST_CONFIG: AgentConfig = {
  role: AgentRole.BUSINESS_ANALYST,
  name: 'business-analyst',
  title: 'Business Analyst',
  description: 'Analyzes business impact, creates ROI calculations, defines success metrics and KPIs, performs competitive analysis, and ensures features align with business strategy',
  systemPrompt: BUSINESS_ANALYST_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'business_analysis',
      description: 'Analyzes business requirements, impact, and strategic alignment',
      allowedTools: ['Read', 'Write', 'Grep'],
      filePatterns: ['docs/**'],
    },
    {
      name: 'financial_modeling',
      description: 'Creates ROI calculations, cost-benefit analyses, and financial projections',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/business/**'],
    },
    {
      name: 'market_research',
      description: 'Conducts competitive analysis and market positioning research',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/research/**'],
    },
  ],
  maxTokenBudget: 20000,
  allowedFilePatterns: ['docs/**', '**/*.md'],
  blockedFilePatterns: ['src/**', 'test/**', '**/*.ts'],
  reportsTo: AgentRole.PRODUCT_MANAGER,
  directReports: [],
  requiredInputArtifacts: [
    ArtifactType.REQUIREMENTS_DOC,
    ArtifactType.USER_STORIES,
  ],
  outputArtifacts: [ArtifactType.BUSINESS_CASE, ArtifactType.ROI_ANALYSIS],
};

export default class BusinessAnalystAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(BUSINESS_ANALYST_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Beginning business analysis and ROI assessment', task.stage);

    const sections: string[] = [];
    sections.push('# Business Analysis Report\n');

    const requirementsDoc = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.REQUIREMENTS_DOC,
    );
    const userStories = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.USER_STORIES,
    );

    sections.push('## Analysis Scope\n');
    sections.push(`- Requirements document: ${requirementsDoc ? 'Available' : 'Not provided'}`);
    sections.push(`- User stories: ${userStories ? 'Available' : 'Not provided'}`);

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: business_case');
    sections.push('Name: Business Case');
    sections.push('Description: Comprehensive business case with problem statement, proposed solution, expected impact, and cost analysis');
    sections.push('Content:');
    sections.push(this.generateBusinessCase(requirementsDoc, userStories));
    sections.push('---ARTIFACT_END---\n');

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: roi_analysis');
    sections.push('Name: ROI Analysis');
    sections.push('Description: Return on investment analysis with cost breakdown, revenue projections, and payback period');
    sections.push('Content:');
    sections.push(this.generateRoiAnalysis(requirementsDoc, userStories));
    sections.push('---ARTIFACT_END---\n');

    sections.push('\n## Success Metrics and KPIs\n');
    sections.push(this.defineSuccessMetrics(requirementsDoc, userStories));

    sections.push('\n## Competitive Positioning\n');
    sections.push(this.assessCompetitivePosition(requirementsDoc));

    sections.push('\n## Risk Assessment\n');
    sections.push(this.assessBusinessRisks(requirementsDoc, userStories));

    sections.push('\n## Recommendations Summary\n');
    sections.push(this.generateRecommendations());

    const output = sections.join('\n');

    agentLog(this.role, 'Business analysis complete', task.stage);
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
            artifactType,
            pa.name,
            pa.description,
            pa.content,
            `.cdm/business/${pa.name.toLowerCase().replace(/\s+/g, '-')}.md`,
          );
          this.artifactStore.store(artifact);
          artifacts.push(artifact);
        }
      }
    }

    if (!artifacts.some((a) => a.type === ArtifactType.BUSINESS_CASE)) {
      const businessCase = this.createArtifact(
        ArtifactType.BUSINESS_CASE,
        'Business Case',
        'Comprehensive business case with problem statement, solution, impact analysis, and cost estimates',
        output,
        '.cdm/business/business-case.md',
      );
      this.artifactStore.store(businessCase);
      artifacts.push(businessCase);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.ROI_ANALYSIS)) {
      const roiAnalysis = this.createArtifact(
        ArtifactType.ROI_ANALYSIS,
        'ROI Analysis',
        'Return on investment analysis with financial projections and sensitivity analysis',
        output,
        '.cdm/business/roi-analysis.md',
      );
      this.artifactStore.store(roiAnalysis);
      artifacts.push(roiAnalysis);
    }

    return artifacts;
  }

  protected async identifyIssues(task: AgentTask, output: string): Promise<Issue[]> {
    const parsed = this.parseClaudeOutput(output);
    const issues: Issue[] = [];

    for (const pi of parsed.issues) {
      const severity = this.resolveIssueSeverity(pi.severity);
      const issueType = pi.type.toLowerCase().includes('design')
        ? IssueType.DESIGN_FLAW
        : IssueType.DOCUMENTATION_GAP;
      issues.push(
        this.createIssue(
          task.featureId,
          issueType,
          severity,
          pi.title,
          pi.description,
          task.stage,
        ),
      );
    }

    for (const artifact of task.inputArtifacts) {
      const content = artifact.content.toLowerCase();

      if (
        !content.includes('success metric') &&
        !content.includes('kpi') &&
        !content.includes('measure') &&
        !content.includes('okr')
      ) {
        issues.push(this.createIssue(
          task.featureId, IssueType.DOCUMENTATION_GAP, IssueSeverity.HIGH,
          'Unclear success metrics',
          `No success metrics, KPIs, or measurable outcomes defined in ${artifact.name}. Without clear metrics, it is impossible to evaluate whether the feature delivers expected value. Define SMART metrics for each objective.`,
          task.stage,
        ));
      }

      if (
        !content.includes('competitor') &&
        !content.includes('differentiat') &&
        !content.includes('unique value') &&
        !content.includes('competitive advantage')
      ) {
        issues.push(this.createIssue(
          task.featureId, IssueType.DESIGN_FLAW, IssueSeverity.MEDIUM,
          'No competitive differentiation articulated',
          `No competitive differentiation or unique value proposition described in ${artifact.name}. Features without clear differentiation risk building commodity capabilities. Conduct competitive analysis and define positioning.`,
          task.stage,
        ));
      }

      if (
        !content.includes('cost') &&
        !content.includes('budget') &&
        !content.includes('investment') &&
        !content.includes('resource')
      ) {
        issues.push(this.createIssue(
          task.featureId, IssueType.DOCUMENTATION_GAP, IssueSeverity.HIGH,
          'Missing cost estimates',
          `No cost estimates, resource requirements, or budget considerations in ${artifact.name}. Business decisions require cost context. Provide development cost, infrastructure cost, and ongoing operational cost estimates.`,
          task.stage,
        ));
      }

      if (
        !content.includes('go-to-market') &&
        !content.includes('launch') &&
        !content.includes('rollout') &&
        !content.includes('release plan')
      ) {
        issues.push(this.createIssue(
          task.featureId, IssueType.DOCUMENTATION_GAP, IssueSeverity.MEDIUM,
          'No go-to-market alignment',
          `No go-to-market strategy, launch plan, or rollout approach described in ${artifact.name}. Features need GTM alignment for successful adoption. Define target segments, channels, and launch metrics.`,
          task.stage,
        ));
      }
    }

    return issues;
  }

  private generateBusinessCase(requirementsDoc?: Artifact, userStories?: Artifact): string {
    const sections: string[] = [];
    sections.push('# Business Case\n');

    sections.push('## 1. Problem Statement');
    sections.push('- Current pain points and inefficiencies');
    sections.push('- Quantified impact of the problem (cost, time, user experience)');
    sections.push('- Stakeholders affected and their concerns\n');

    sections.push('## 2. Proposed Solution');
    sections.push('- Solution overview and approach');
    sections.push('- Key capabilities and features');
    sections.push('- Alignment with strategic objectives\n');

    sections.push('## 3. Expected Impact');
    sections.push('- User impact: improved experience, reduced friction, new capabilities');
    sections.push('- Business impact: revenue potential, cost savings, efficiency gains');
    sections.push('- Technical impact: platform improvement, technical debt reduction\n');

    sections.push('## 4. Cost Estimates');
    sections.push('| Category | Estimate | Confidence |');
    sections.push('|----------|----------|------------|');
    sections.push('| Development | TBD | Medium |');
    sections.push('| Infrastructure | TBD | Medium |');
    sections.push('| Operations | TBD | Low |');
    sections.push('| Training | TBD | Medium |\n');

    sections.push('## 5. Timeline');
    sections.push('- Phase 1 (MVP): Core functionality — estimated 4-6 weeks');
    sections.push('- Phase 2 (Enhancement): Additional features — estimated 3-4 weeks');
    sections.push('- Phase 3 (Scale): Performance and scale optimization — estimated 2-3 weeks');

    return sections.join('\n');
  }

  private generateRoiAnalysis(requirementsDoc?: Artifact, userStories?: Artifact): string {
    const sections: string[] = [];
    sections.push('# ROI Analysis\n');

    sections.push('## 1. Investment Breakdown');
    sections.push('- Engineering hours and fully-loaded cost');
    sections.push('- Infrastructure and tooling costs');
    sections.push('- Ongoing maintenance and support costs');
    sections.push('- Training and enablement costs\n');

    sections.push('## 2. Revenue Projections');
    sections.push('| Scenario | Year 1 | Year 2 | Year 3 |');
    sections.push('|----------|--------|--------|--------|');
    sections.push('| Pessimistic | TBD | TBD | TBD |');
    sections.push('| Base | TBD | TBD | TBD |');
    sections.push('| Optimistic | TBD | TBD | TBD |\n');

    sections.push('## 3. Payback Period');
    sections.push('- Simple payback period: TBD months');
    sections.push('- Discounted payback period: TBD months\n');

    sections.push('## 4. Sensitivity Analysis');
    sections.push('- Key variable: adoption rate — 10% change shifts ROI by X%');
    sections.push('- Key variable: development timeline — 2-week delay shifts payback by Y months');
    sections.push('- Key variable: churn reduction — each 1% improvement yields $Z annually');

    return sections.join('\n');
  }

  private defineSuccessMetrics(requirementsDoc?: Artifact, userStories?: Artifact): string {
    const metrics: string[] = [
      '### Primary KPIs',
      '| KPI | Target | Measurement Method | Frequency |',
      '|-----|--------|-------------------|-----------|',
      '| Feature adoption rate | >30% of active users within 90 days | Product analytics | Weekly |',
      '| User satisfaction (CSAT) | >4.0/5.0 | In-app survey | Monthly |',
      '| Time-to-value | <5 minutes to first success | Event tracking | Continuous |',
      '| Error rate | <0.1% of interactions | Error monitoring | Daily |',
      '',
      '### Secondary KPIs',
      '- Support ticket volume related to feature area',
      '- Session duration and engagement depth',
      '- Net Promoter Score (NPS) impact',
      '- Customer retention correlation',
    ];
    return metrics.join('\n');
  }

  private assessCompetitivePosition(requirementsDoc?: Artifact): string {
    const analysis: string[] = [
      '### Competitive Landscape',
      '- Direct competitors: Identify 3-5 direct competitors with similar offerings',
      '- Feature comparison matrix: Map capabilities across competitors',
      '- Pricing comparison: Benchmark against competitor pricing models',
      '',
      '### Differentiation Strategy',
      '- Unique capabilities that competitors lack',
      '- Integration advantages with existing platform',
      '- User experience differentiation',
      '- Time-to-market advantage or disadvantage',
    ];
    return analysis.join('\n');
  }

  private assessBusinessRisks(requirementsDoc?: Artifact, userStories?: Artifact): string {
    const risks: string[] = [
      '| Risk | Probability | Impact | Mitigation |',
      '|------|-------------|--------|------------|',
      '| Low adoption rate | Medium | High | Phased rollout with feedback loops |',
      '| Scope creep | High | Medium | Clear MoSCoW prioritization |',
      '| Timeline overrun | Medium | Medium | Buffer in estimates, MVP focus |',
      '| Market shift | Low | High | Regular competitive monitoring |',
      '| Resource constraints | Medium | High | Cross-training, parallel workstreams |',
    ];
    return risks.join('\n');
  }

  private generateRecommendations(): string {
    const recs: string[] = [
      '1. Validate business case assumptions with 5-10 customer interviews before committing resources',
      '2. Define SMART success metrics before development begins — agreed by product and engineering',
      '3. Conduct competitive analysis to validate differentiation claims',
      '4. Build financial model with pessimistic/base/optimistic scenarios',
      '5. Establish go-to-market plan including sales enablement and customer communication',
      '6. Plan phased rollout starting with beta users for early signal collection',
      '7. Set up automated dashboards for KPI tracking from day one',
      '8. Schedule 30/60/90-day business review checkpoints post-launch',
      '9. Identify leading indicators of success that are measurable within first 2 weeks',
      '10. Prepare executive summary for investment decision with clear ask and expected returns',
    ];
    return recs.join('\n');
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
      business_case: ArtifactType.BUSINESS_CASE,
      roi_analysis: ArtifactType.ROI_ANALYSIS,
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
