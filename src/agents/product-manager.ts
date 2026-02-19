import {
  type AgentConfig,
  AgentRole,
  type AgentTask,
  type Artifact,
  ArtifactType,
  type Issue,
  IssueType,
  IssueSeverity,
  type PipelineStage,
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

const PRODUCT_MANAGER_SYSTEM_PROMPT = `Product Manager. Translates business requirements into precise, actionable specifications.

Requirements doc: exec summary, business context, numbered functional requirements, non-functional requirements (perf/security/scalability), constraints/assumptions, out-of-scope explicitly stated, success metrics, risk assessment.
User stories: "As [persona] I want [capability] so that [benefit]" + MoSCoW priority + S/M/L/XL complexity + dependencies.
Acceptance criteria: Given/When/Then format.
Always: decompose goals into discrete features, cover all personas, identify edge cases and error states, define KPIs, flag gaps/ambiguities/dependencies, consider accessibility/i18n/compliance.`;

export const productManagerConfig: AgentConfig = {
  role: AgentRole.PRODUCT_MANAGER,
  name: 'product-manager',
  title: 'Senior Product Manager',
  description:
    'Translates business requirements into comprehensive specifications, user stories, and acceptance criteria. Owns the requirements gathering stage and ensures all downstream agents have clear, unambiguous inputs.',
  systemPrompt: PRODUCT_MANAGER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'requirements_analysis',
      description: 'Analyze and decompose business requirements into technical specifications',
      allowedTools: ['Read', 'Write', 'Glob'],
      filePatterns: ['docs/requirements/**', 'docs/specs/**'],
    },
    {
      name: 'user_story_creation',
      description: 'Create detailed user stories with acceptance criteria',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['docs/stories/**', 'docs/acceptance/**'],
    },
    {
      name: 'stakeholder_analysis',
      description: 'Identify and analyze stakeholder needs and personas',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['docs/personas/**', 'docs/stakeholders/**'],
    },
  ],
  maxTokenBudget: 32000,
  allowedFilePatterns: ['docs/**', '*.md', 'specs/**'],
  blockedFilePatterns: ['src/**', 'test/**', '*.ts', '*.js', '*.json'],
  reportsTo: null,
  directReports: [AgentRole.ENGINEERING_MANAGER, AgentRole.UI_DESIGNER],
  requiredInputArtifacts: [],
  outputArtifacts: [
    ArtifactType.REQUIREMENTS_DOC,
    ArtifactType.USER_STORIES,
    ArtifactType.ACCEPTANCE_CRITERIA,
  ],
};

export class ProductManagerAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(productManagerConfig, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Generating requirements analysis from business input', task.stage);

    const prompt = this.buildClaudeCodePrompt(task);
    const output = this.generateRequirementsAnalysis(task, prompt);

    agentLog(this.role, 'Requirements analysis complete', task.stage);
    return output;
  }

  protected async produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]> {
    const parsed = this.parseClaudeOutput(output);
    const artifacts: Artifact[] = [];

    for (const raw of parsed.artifacts) {
      const artifactType = this.resolveArtifactType(raw.type);
      if (!artifactType) {
        agentLog(this.role, `Skipping unrecognized artifact type: ${raw.type}`, task.stage, 'warn');
        continue;
      }

      const filePath = this.resolveFilePath(artifactType, task.featureId);

      try {
        const artifact = this.createArtifact(
          artifactType,
          raw.name,
          raw.description,
          raw.content,
          filePath,
          { featureId: task.featureId, stage: task.stage },
        );
        await this.artifactStore.store(artifact);
        artifacts.push(artifact);
        agentLog(this.role, `Produced artifact: ${raw.name} (${artifactType})`, task.stage);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        agentLog(this.role, `Failed to create artifact ${raw.name}: ${msg}`, task.stage, 'error');
      }
    }

    if (artifacts.length === 0) {
      agentLog(this.role, 'No artifacts parsed from output, generating defaults', task.stage, 'warn');
      artifacts.push(...this.generateDefaultArtifacts(task, output));
    }

    return artifacts;
  }

  protected async identifyIssues(task: AgentTask, output: string): Promise<Issue[]> {
    const parsed = this.parseClaudeOutput(output);
    const issues: Issue[] = [];

    for (const raw of parsed.issues) {
      const issueType = this.resolveIssueType(raw.type);
      const severity = this.resolveIssueSeverity(raw.severity);

      issues.push(
        this.createIssue(
          task.featureId,
          issueType,
          severity,
          raw.title,
          raw.description,
          task.stage,
        ),
      );
    }

    issues.push(...this.detectRequirementGaps(task, output));

    return issues;
  }

  parseClaudeOutput(output: string): ParsedOutput {
    const result: ParsedOutput = {
      summary: '',
      artifacts: [],
      issues: [],
      recommendations: '',
    };

    const summaryMatch = output.match(/### Summary\s*\n([\s\S]*?)(?=###|---ARTIFACT_START---|$)/);
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim();
    }

    const artifactRegex = /---ARTIFACT_START---\s*\n([\s\S]*?)---ARTIFACT_END---/g;
    let artifactMatch: RegExpExecArray | null;
    while ((artifactMatch = artifactRegex.exec(output)) !== null) {
      const block = artifactMatch[1];
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const nameMatch = block.match(/^Name:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*(.+)$/m);
      const contentMatch = block.match(/^Content:\s*\n([\s\S]*)$/m);

      if (typeMatch && nameMatch) {
        result.artifacts.push({
          type: typeMatch[1].trim(),
          name: nameMatch[1].trim(),
          description: descMatch ? descMatch[1].trim() : '',
          content: contentMatch ? contentMatch[1].trim() : '',
        });
      }
    }

    const issueRegex = /---ISSUE_START---\s*\n([\s\S]*?)---ISSUE_END---/g;
    let issueMatch: RegExpExecArray | null;
    while ((issueMatch = issueRegex.exec(output)) !== null) {
      const block = issueMatch[1];
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const sevMatch = block.match(/^Severity:\s*(.+)$/m);
      const titleMatch = block.match(/^Title:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*(.+)$/m);

      if (typeMatch && titleMatch) {
        result.issues.push({
          type: typeMatch[1].trim(),
          severity: sevMatch ? sevMatch[1].trim() : 'medium',
          title: titleMatch[1].trim(),
          description: descMatch ? descMatch[1].trim() : '',
        });
      }
    }

    const recsMatch = output.match(/### Recommendations\s*\n([\s\S]*?)(?=###|$)/);
    if (recsMatch) {
      result.recommendations = recsMatch[1].trim();
    }

    return result;
  }

  private generateRequirementsAnalysis(task: AgentTask, _prompt: string): string {
    const sections: string[] = [];

    sections.push('### Summary');
    sections.push(
      `Requirements analysis for feature "${task.title}". ` +
      `Decomposed business requirements into functional specifications, ` +
      `user stories with acceptance criteria, and identified potential risks.`,
    );

    sections.push(this.buildRequirementsDocArtifact(task));
    sections.push(this.buildUserStoriesArtifact(task));
    sections.push(this.buildAcceptanceCriteriaArtifact(task));

    sections.push('### Recommendations');
    sections.push(
      '- Architecture team should evaluate scalability requirements early\n' +
      '- UI/UX team should conduct user research to validate persona assumptions\n' +
      '- Engineering should flag any technical constraints before sprint planning\n' +
      '- Security review of data handling requirements recommended before implementation',
    );

    return sections.join('\n\n');
  }

  private buildRequirementsDocArtifact(task: AgentTask): string {
    return [
      '---ARTIFACT_START---',
      'Type: requirements_doc',
      `Name: ${task.title} - Requirements Document`,
      'Description: Comprehensive requirements specification covering functional and non-functional requirements',
      'Content:',
      `# Requirements Document: ${task.title}`,
      '',
      '## 1. Executive Summary',
      task.description,
      '',
      '## 2. Business Context',
      `This feature addresses the following business need: ${task.description}`,
      '',
      '## 3. Functional Requirements',
      `FR-001: The system shall implement the core functionality described in "${task.title}"`,
      'FR-002: The system shall validate all user inputs according to defined schemas',
      'FR-003: The system shall provide appropriate error messages for all failure modes',
      'FR-004: The system shall log all significant operations for audit purposes',
      '',
      '## 4. Non-Functional Requirements',
      'NFR-001: Response time for primary operations shall be under 500ms at p95',
      'NFR-002: The system shall handle concurrent usage without data corruption',
      'NFR-003: All sensitive data shall be encrypted at rest and in transit',
      'NFR-004: The feature shall be accessible (WCAG 2.1 AA compliance)',
      '',
      '## 5. Constraints and Assumptions',
      `- Task constraints: ${task.constraints.join(', ') || 'None specified'}`,
      '- Assumes existing authentication/authorization infrastructure',
      '',
      '## 6. Out of Scope',
      '- Items explicitly excluded will be documented during stakeholder review',
      '',
      '## 7. Success Metrics',
      '- Feature adoption rate within first 30 days',
      '- Error rate below 0.1% of operations',
      '- User satisfaction score above 4.0/5.0',
      '---ARTIFACT_END---',
    ].join('\n');
  }

  private buildUserStoriesArtifact(task: AgentTask): string {
    return [
      '---ARTIFACT_START---',
      'Type: user_stories',
      `Name: ${task.title} - User Stories`,
      'Description: Prioritized user stories covering all personas and use cases',
      'Content:',
      `# User Stories: ${task.title}`,
      '',
      '## US-001: Primary User Flow',
      `**As a** primary user, **I want** to ${task.description.toLowerCase()}, **so that** I can achieve my intended goal efficiently.`,
      '- **Priority:** Must',
      '- **Complexity:** M',
      '- **Dependencies:** None',
      '',
      '## US-002: Error Handling',
      '**As a** user, **I want** to receive clear error messages when something goes wrong, **so that** I understand what happened and how to recover.',
      '- **Priority:** Must',
      '- **Complexity:** S',
      '- **Dependencies:** US-001',
      '',
      '## US-003: Input Validation',
      '**As a** user, **I want** the system to validate my input in real-time, **so that** I can correct mistakes before submitting.',
      '- **Priority:** Should',
      '- **Complexity:** S',
      '- **Dependencies:** US-001',
      '',
      '## US-004: Audit Trail',
      '**As an** administrator, **I want** all operations to be logged, **so that** I can audit user activity and troubleshoot issues.',
      '- **Priority:** Should',
      '- **Complexity:** M',
      '- **Dependencies:** US-001',
      '---ARTIFACT_END---',
    ].join('\n');
  }

  private buildAcceptanceCriteriaArtifact(task: AgentTask): string {
    return [
      '---ARTIFACT_START---',
      'Type: acceptance_criteria',
      `Name: ${task.title} - Acceptance Criteria`,
      'Description: Testable acceptance criteria in Given/When/Then format for all user stories',
      'Content:',
      `# Acceptance Criteria: ${task.title}`,
      '',
      '## AC-001 (US-001): Successful primary flow',
      '**Given** the user is authenticated and has appropriate permissions',
      '**When** the user initiates the primary action with valid input',
      '**Then** the system processes the request successfully',
      '**And** the user receives confirmation within 500ms',
      '',
      '## AC-002 (US-001): Invalid input rejection',
      '**Given** the user is authenticated',
      '**When** the user submits invalid or malformed input',
      '**Then** the system rejects the request with a 400-level error',
      '**And** the response includes a human-readable error description',
      '',
      '## AC-003 (US-002): Graceful error recovery',
      '**Given** the system encounters an internal error during processing',
      '**When** the error is transient (network timeout, temporary unavailability)',
      '**Then** the system retries the operation up to 3 times with exponential backoff',
      '**And** notifies the user only if all retries are exhausted',
      '',
      '## AC-004 (US-003): Real-time validation',
      '**Given** the user is filling out an input form',
      '**When** the user tabs away from a field with invalid content',
      '**Then** the field displays an inline validation error within 100ms',
      '**And** the error message explains the expected format',
      '',
      '## AC-005 (US-004): Audit logging',
      '**Given** any create, update, or delete operation occurs',
      '**When** the operation completes (success or failure)',
      '**Then** an audit log entry is created with timestamp, user ID, operation type, and result',
      '---ARTIFACT_END---',
    ].join('\n');
  }

  private generateDefaultArtifacts(task: AgentTask, output: string): Artifact[] {
    const artifacts: Artifact[] = [];

    artifacts.push(
      this.createArtifact(
        ArtifactType.REQUIREMENTS_DOC,
        `${task.title} - Requirements Document`,
        'Auto-generated requirements document from raw output',
        output,
        `docs/requirements/${task.featureId}/requirements.md`,
        { featureId: task.featureId, autoGenerated: true },
      ),
    );

    return artifacts;
  }

  private detectRequirementGaps(task: AgentTask, output: string): Issue[] {
    const issues: Issue[] = [];
    const lowerOutput = output.toLowerCase();

    if (!lowerOutput.includes('non-functional') && !lowerOutput.includes('nfr')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.DOCUMENTATION_GAP,
          IssueSeverity.MEDIUM,
          'Missing non-functional requirements',
          'The requirements analysis does not explicitly address non-functional requirements such as performance targets, scalability limits, or availability SLAs.',
          task.stage,
        ),
      );
    }

    if (!lowerOutput.includes('security') && !lowerOutput.includes('auth')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.SECURITY_VULNERABILITY,
          IssueSeverity.HIGH,
          'Security requirements not addressed',
          'No security considerations found in the requirements. Authentication, authorization, data protection, and input sanitization requirements must be defined.',
          task.stage,
        ),
      );
    }

    if (!lowerOutput.includes('edge case') && !lowerOutput.includes('boundary') && !lowerOutput.includes('error')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.DESIGN_FLAW,
          IssueSeverity.MEDIUM,
          'Missing edge case analysis',
          'Requirements do not address edge cases, boundary conditions, or error scenarios. These must be defined to prevent gaps in implementation and testing.',
          task.stage,
        ),
      );
    }

    if (!lowerOutput.includes('metric') && !lowerOutput.includes('kpi') && !lowerOutput.includes('success')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.DOCUMENTATION_GAP,
          IssueSeverity.LOW,
          'No success metrics defined',
          'Requirements should include measurable success criteria and KPIs to validate the feature post-launch.',
          task.stage,
        ),
      );
    }

    return issues;
  }

  private resolveArtifactType(raw: string): ArtifactType | null {
    const normalized = raw.toLowerCase().replace(/[\s-]/g, '_');
    const mapping: Record<string, ArtifactType> = {
      requirements_doc: ArtifactType.REQUIREMENTS_DOC,
      requirements_document: ArtifactType.REQUIREMENTS_DOC,
      requirements: ArtifactType.REQUIREMENTS_DOC,
      user_stories: ArtifactType.USER_STORIES,
      user_story: ArtifactType.USER_STORIES,
      stories: ArtifactType.USER_STORIES,
      acceptance_criteria: ArtifactType.ACCEPTANCE_CRITERIA,
      acceptance: ArtifactType.ACCEPTANCE_CRITERIA,
      criteria: ArtifactType.ACCEPTANCE_CRITERIA,
    };
    return mapping[normalized] ?? null;
  }

  private resolveIssueType(raw: string): IssueType {
    const normalized = raw.toLowerCase().replace(/[\s-]/g, '_');
    const mapping: Record<string, IssueType> = {
      bug: IssueType.BUG,
      design_flaw: IssueType.DESIGN_FLAW,
      security_vulnerability: IssueType.SECURITY_VULNERABILITY,
      security: IssueType.SECURITY_VULNERABILITY,
      performance: IssueType.PERFORMANCE,
      code_quality: IssueType.CODE_QUALITY,
      missing_test: IssueType.MISSING_TEST,
      documentation_gap: IssueType.DOCUMENTATION_GAP,
      documentation: IssueType.DOCUMENTATION_GAP,
      dependency_issue: IssueType.DEPENDENCY_ISSUE,
      dependency: IssueType.DEPENDENCY_ISSUE,
      architecture_concern: IssueType.ARCHITECTURE_CONCERN,
      architecture: IssueType.ARCHITECTURE_CONCERN,
    };
    return mapping[normalized] ?? IssueType.DESIGN_FLAW;
  }

  private resolveIssueSeverity(raw: string): IssueSeverity {
    const normalized = raw.toLowerCase().trim();
    const mapping: Record<string, IssueSeverity> = {
      info: IssueSeverity.INFO,
      low: IssueSeverity.LOW,
      medium: IssueSeverity.MEDIUM,
      high: IssueSeverity.HIGH,
      critical: IssueSeverity.CRITICAL,
    };
    return mapping[normalized] ?? IssueSeverity.MEDIUM;
  }

  private resolveFilePath(type: ArtifactType, featureId: string): string {
    const pathMap: Record<ArtifactType, string> = {
      [ArtifactType.REQUIREMENTS_DOC]: `docs/requirements/${featureId}/requirements.md`,
      [ArtifactType.USER_STORIES]: `docs/requirements/${featureId}/user-stories.md`,
      [ArtifactType.ACCEPTANCE_CRITERIA]: `docs/requirements/${featureId}/acceptance-criteria.md`,
    } as Record<ArtifactType, string>;

    return pathMap[type] || `docs/${featureId}/${type}.md`;
  }

  protected override buildHandoffInstructions(toAgent: AgentRole, stage: PipelineStage): string {
    if (toAgent === AgentRole.ENGINEERING_MANAGER) {
      return (
        'Requirements gathering is complete. Please review the requirements document, ' +
        'user stories, and acceptance criteria. Break down the work into implementable tasks, ' +
        'estimate effort, assign complexity ratings, and produce a sprint plan. Flag any ' +
        'requirements that are technically infeasible or need clarification.'
      );
    }

    if (toAgent === AgentRole.UI_DESIGNER) {
      return (
        'Requirements gathering is complete. Please review the requirements and user stories ' +
        'to identify UI/UX needs. Produce wireframes and component specifications that satisfy ' +
        'the acceptance criteria. Pay special attention to accessibility requirements and error states.'
      );
    }

    return super.buildHandoffInstructions(toAgent, stage);
  }
}

export function createProductManagerAgent(artifactStore: ArtifactStore): ProductManagerAgent {
  return new ProductManagerAgent(artifactStore);
}
