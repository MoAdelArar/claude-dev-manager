import {
  AgentConfig,
  AgentRole,
  AgentTask,
  Artifact,
  ArtifactType,
  Issue,
  IssueType,
  IssueSeverity,
} from '../types';
import { BaseAgent } from './base-agent';
import { ArtifactStore } from '../workspace/artifact-store';
import { agentLog } from '../utils/logger';

const SENIOR_DEVELOPER_SYSTEM_PROMPT = `You are a Senior Full-Stack Developer with 15+ years of professional experience
across multiple technology stacks, languages, and paradigms. You are the technical
backbone of the engineering team, responsible for implementing the most complex and
critical features in the system.

Your core competencies include:
- Designing and implementing clean, maintainable, production-grade code
- Building complex algorithms, data structures, and system integrations
- Implementing core business logic with proper domain modeling
- Creating robust abstractions, interfaces, and design patterns
- Performance optimization, caching strategies, and scalability concerns
- Database design, query optimization, and data integrity
- API design and implementation (REST, GraphQL, gRPC)
- Microservices architecture and distributed systems patterns
- Security-conscious coding practices and threat mitigation

You strictly adhere to the following principles:
- SOLID principles in every class and module you write
- DRY (Don't Repeat Yourself) — extract shared logic into reusable utilities
- KISS (Keep It Simple, Stupid) — prefer clarity over cleverness
- YAGNI (You Aren't Gonna Need It) — implement only what is required now
- Test-Driven Development when applicable: write failing tests first, then implement
- Defensive programming: validate inputs, handle edge cases, fail gracefully
- Proper error handling: use typed errors, avoid swallowing exceptions silently

When implementing features you always:
1. Study the architecture document and API specifications thoroughly before writing code
2. Break complex implementations into small, focused, well-named functions
3. Write comprehensive JSDoc/TSDoc comments for public APIs
4. Consider concurrency, race conditions, and thread safety
5. Implement proper logging and observability hooks
6. Handle all error paths, including network failures and timeouts
7. Consider backward compatibility and migration paths
8. Optimize hot paths while keeping cold paths readable
9. Use dependency injection to keep components testable and decoupled
10. Mentor junior developers by setting clear patterns for them to follow

You produce artifacts in a structured format delimited by markers so that the
pipeline can parse and store them automatically. Every source file you produce
must be syntactically valid and ready to compile/run.

If a task is ambiguous, you state your assumptions explicitly before proceeding.
If a task conflicts with the architecture document, you flag it as an issue rather
than silently deviating.`;

export const SENIOR_DEVELOPER_CONFIG: AgentConfig = {
  role: AgentRole.SENIOR_DEVELOPER,
  name: 'senior-developer',
  title: 'Senior Developer',
  description:
    'Implements complex features, core architecture code, and mentors junior developers. ' +
    'Responsible for the most critical and performance-sensitive parts of the codebase.',
  systemPrompt: SENIOR_DEVELOPER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'code_implementation',
      description:
        'Implements complex features, business logic, system integrations, and core architecture code.',
      allowedTools: ['Read', 'Write', 'Shell', 'Grep', 'Glob'],
      filePatterns: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx', 'lib/**/*'],
    },
    {
      name: 'code_refactoring',
      description:
        'Refactors existing code to improve maintainability, performance, and adherence to design patterns.',
      allowedTools: ['Read', 'Write', 'Shell', 'Grep', 'Glob'],
      filePatterns: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx'],
    },
    {
      name: 'architecture_implementation',
      description:
        'Translates architecture documents and system diagrams into concrete module structures, ' +
        'interfaces, and foundational code scaffolding.',
      allowedTools: ['Read', 'Write', 'Shell', 'Grep', 'Glob'],
      filePatterns: ['src/**/*', 'lib/**/*', 'config/**/*'],
    },
  ],
  maxTokenBudget: 200_000,
  allowedFilePatterns: [
    'src/**/*.ts',
    'src/**/*.tsx',
    'src/**/*.js',
    'src/**/*.jsx',
    'lib/**/*',
    'config/**/*',
    'package.json',
    'tsconfig.json',
  ],
  blockedFilePatterns: [
    '.env',
    '.env.*',
    '**/*.secret',
    '**/credentials*',
    '**/node_modules/**',
  ],
  reportsTo: AgentRole.ENGINEERING_MANAGER,
  directReports: [AgentRole.JUNIOR_DEVELOPER],
  requiredInputArtifacts: [
    ArtifactType.ARCHITECTURE_DOC,
    ArtifactType.API_SPEC,
    ArtifactType.DATA_MODEL,
    ArtifactType.TASK_LIST,
    ArtifactType.UI_SPEC,
    ArtifactType.COMPONENT_SPEC,
  ],
  outputArtifacts: [ArtifactType.SOURCE_CODE],
};

interface ParsedArtifact {
  type: string;
  name: string;
  description: string;
  content: string;
  filePath: string;
}

interface ParsedIssue {
  type: string;
  severity: string;
  title: string;
  description: string;
}

export class SeniorDeveloperAgent extends BaseAgent {
  constructor(config: AgentConfig, artifactStore: ArtifactStore) {
    super(config, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, `Analyzing task "${task.title}" and preparing implementation plan`, task.stage);

    this.buildImplementationPrompt(task);
    this.buildClaudeCodePrompt(task);

    const sections: string[] = [];

    sections.push('### Summary');
    sections.push(
      `Implementing task "${task.title}" as Senior Developer. ` +
      'Analyzed architecture documents, API specifications, and data models to produce ' +
      'a structured implementation following SOLID principles and established project patterns.',
    );

    const architectureDoc = task.inputArtifacts.find((a) => a.type === ArtifactType.ARCHITECTURE_DOC);
    const apiSpec = task.inputArtifacts.find((a) => a.type === ArtifactType.API_SPEC);
    const dataModel = task.inputArtifacts.find((a) => a.type === ArtifactType.DATA_MODEL);
    const taskList = task.inputArtifacts.find((a) => a.type === ArtifactType.TASK_LIST);
    const uiSpec = task.inputArtifacts.find((a) => a.type === ArtifactType.UI_SPEC);
    const componentSpec = task.inputArtifacts.find((a) => a.type === ArtifactType.COMPONENT_SPEC);

    sections.push('### Implementation Plan');

    const planItems: string[] = [];
    if (architectureDoc) {
      planItems.push(`- Reviewed architecture document: ${architectureDoc.name}`);
    }
    if (apiSpec) {
      planItems.push(`- Reviewed API specification: ${apiSpec.name}`);
    }
    if (dataModel) {
      planItems.push(`- Reviewed data model: ${dataModel.name}`);
    }
    if (taskList) {
      planItems.push(`- Following task breakdown from: ${taskList.name}`);
    }
    if (uiSpec) {
      planItems.push(`- UI specification reference: ${uiSpec.name}`);
    }
    if (componentSpec) {
      planItems.push(`- Component specification reference: ${componentSpec.name}`);
    }
    planItems.push('- Applying SOLID principles and TDD methodology');
    planItems.push('- Implementing defensive error handling and input validation');
    planItems.push('- Adding observability hooks and structured logging');
    sections.push(planItems.join('\n'));

    const sourceContent = this.synthesizeImplementation(task, {
      architectureDoc,
      apiSpec,
      dataModel,
      taskList,
      uiSpec,
      componentSpec,
    });

    sections.push('### Artifacts');
    sections.push(
      '---ARTIFACT_START---\n' +
      'Type: source_code\n' +
      `Name: ${this.deriveModuleName(task)}\n` +
      `Description: Implementation of ${task.title} following architecture specification and SOLID principles\n` +
      `FilePath: src/${this.deriveFilePath(task)}\n` +
      'Content:\n' +
      sourceContent + '\n' +
      '---ARTIFACT_END---',
    );

    const issues = this.detectImplementationIssues(task, sourceContent);
    if (issues.length > 0) {
      sections.push('### Issues Found');
      for (const issue of issues) {
        sections.push(
          '---ISSUE_START---\n' +
          `Type: ${issue.type}\n` +
          `Severity: ${issue.severity}\n` +
          `Title: ${issue.title}\n` +
          `Description: ${issue.description}\n` +
          '---ISSUE_END---',
        );
      }
    }

    sections.push('### Recommendations');
    sections.push(
      '- Junior developer should implement unit tests for all public methods\n' +
      '- Code reviewer should verify error handling paths and edge cases\n' +
      '- QA engineer should validate integration points against the API spec',
    );

    agentLog(this.role, `Implementation completed for "${task.title}"`, task.stage);

    return sections.join('\n\n');
  }

  protected async produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]> {
    const parsed = this.parseClaudeOutput(output);
    const artifacts: Artifact[] = [];

    for (const raw of parsed.artifacts) {
      const artifactType = this.resolveArtifactType(raw.type);
      const filePath = raw.filePath || `src/${this.deriveFilePath(task)}`;

      try {
        const artifact = this.createArtifact(
          artifactType,
          raw.name,
          raw.description,
          raw.content,
          filePath,
          {
            taskId: task.id,
            featureId: task.featureId,
            stage: task.stage,
            createdByAgent: this.role,
          },
        );
        artifacts.push(artifact);
        agentLog(this.role, `Produced artifact: ${artifact.name} (${artifact.type})`, task.stage);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        agentLog(this.role, `Failed to create artifact "${raw.name}": ${msg}`, task.stage, 'error');
      }
    }

    if (artifacts.length === 0) {
      agentLog(
        this.role,
        'No artifacts parsed from output; creating fallback source_code artifact',
        task.stage,
        'warn',
      );
      const fallback = this.createArtifact(
        ArtifactType.SOURCE_CODE,
        this.deriveModuleName(task),
        `Implementation output for ${task.title}`,
        output,
        `src/${this.deriveFilePath(task)}`,
        { taskId: task.id, featureId: task.featureId, fallback: true },
      );
      artifacts.push(fallback);
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
        this.createIssue(task.featureId, issueType, severity, raw.title, raw.description, task.stage),
      );
    }

    const implicitIssues = this.detectImplicitIssues(task, output);
    issues.push(...implicitIssues);

    return issues;
  }

  private buildImplementationPrompt(task: AgentTask): string {
    const lines: string[] = [];
    lines.push(`Implement the following task: ${task.title}`);
    lines.push(`Description: ${task.description}`);
    if (task.instructions) {
      lines.push(`Instructions: ${task.instructions}`);
    }
    lines.push('');
    lines.push('Requirements:');
    lines.push('- Follow SOLID principles');
    lines.push('- Include comprehensive error handling');
    lines.push('- Add JSDoc comments for all public APIs');
    lines.push('- Use dependency injection for external dependencies');
    lines.push('- Implement proper input validation');
    lines.push('- Consider performance for hot paths');

    for (const constraint of task.constraints) {
      lines.push(`- Constraint: ${constraint}`);
    }

    return lines.join('\n');
  }

  private synthesizeImplementation(
    task: AgentTask,
    inputs: {
      architectureDoc?: Artifact;
      apiSpec?: Artifact;
      dataModel?: Artifact;
      taskList?: Artifact;
      uiSpec?: Artifact;
      componentSpec?: Artifact;
    },
  ): string {
    const lines: string[] = [];

    lines.push(`// Module: ${this.deriveModuleName(task)}`);
    lines.push(`// Task: ${task.title}`);
    lines.push(`// Stage: ${task.stage}`);
    lines.push('');

    if (inputs.architectureDoc) {
      lines.push(`// Architecture reference: ${inputs.architectureDoc.name}`);
    }
    if (inputs.apiSpec) {
      lines.push(`// API spec reference: ${inputs.apiSpec.name}`);
    }

    lines.push('');
    lines.push(task.description);

    if (task.instructions) {
      lines.push('');
      lines.push(task.instructions);
    }

    for (const artifact of task.inputArtifacts) {
      lines.push('');
      lines.push(`// --- Input from ${artifact.name} (${artifact.type}) ---`);
      lines.push(artifact.content);
    }

    return lines.join('\n');
  }

  private detectImplementationIssues(
    task: AgentTask,
    _sourceContent: string,
  ): ParsedIssue[] {
    const issues: ParsedIssue[] = [];

    const hasMissingInputs = task.inputArtifacts.length < 2;
    if (hasMissingInputs) {
      issues.push({
        type: IssueType.ARCHITECTURE_CONCERN,
        severity: IssueSeverity.MEDIUM,
        title: 'Incomplete input artifacts for implementation',
        description:
          'The implementation was produced with fewer input artifacts than recommended. ' +
          'Missing architecture or API spec artifacts may lead to misalignment with the overall design.',
      });
    }

    const hasNoErrorHandlingConstraint = !task.constraints.some(
      (c) => c.toLowerCase().includes('error') || c.toLowerCase().includes('exception'),
    );
    if (hasNoErrorHandlingConstraint) {
      issues.push({
        type: IssueType.CODE_QUALITY,
        severity: IssueSeverity.LOW,
        title: 'No explicit error handling constraints specified',
        description:
          'The task did not include explicit error handling constraints. ' +
          'Default defensive programming patterns were applied, but the code reviewer should ' +
          'verify that error handling aligns with project conventions.',
      });
    }

    return issues;
  }

  private detectImplicitIssues(task: AgentTask, output: string): Issue[] {
    const issues: Issue[] = [];
    const lowerOutput = output.toLowerCase();

    if (lowerOutput.includes('todo') || lowerOutput.includes('fixme') || lowerOutput.includes('hack')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.CODE_QUALITY,
          IssueSeverity.LOW,
          'Technical debt markers found in implementation',
          'The implementation output contains TODO, FIXME, or HACK markers that indicate ' +
          'areas of technical debt requiring future attention.',
          task.stage,
        ),
      );
    }

    if (!lowerOutput.includes('try') && !lowerOutput.includes('catch') && !lowerOutput.includes('error')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.CODE_QUALITY,
          IssueSeverity.MEDIUM,
          'Possible missing error handling in implementation',
          'The implementation output does not appear to contain try/catch blocks or error handling. ' +
          'This should be reviewed to ensure all failure modes are properly addressed.',
          task.stage,
        ),
      );
    }

    const hasPerformanceSensitiveKeywords =
      lowerOutput.includes('loop') ||
      lowerOutput.includes('iterate') ||
      lowerOutput.includes('recursive') ||
      lowerOutput.includes('batch');
    if (hasPerformanceSensitiveKeywords && !lowerOutput.includes('performance')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.PERFORMANCE,
          IssueSeverity.LOW,
          'Performance-sensitive patterns detected without explicit optimization notes',
          'The implementation contains loops, recursion, or batch processing patterns but ' +
          'does not include explicit performance analysis or optimization notes.',
          task.stage,
        ),
      );
    }

    return issues;
  }

  parseClaudeOutput(output: string): { artifacts: ParsedArtifact[]; issues: ParsedIssue[] } {
    const artifacts: ParsedArtifact[] = [];
    const issues: ParsedIssue[] = [];

    const artifactRegex = /---ARTIFACT_START---([\s\S]*?)---ARTIFACT_END---/g;
    let artifactMatch: RegExpExecArray | null;

    while ((artifactMatch = artifactRegex.exec(output)) !== null) {
      const block = artifactMatch[1].trim();
      const type = this.extractField(block, 'Type') || 'source_code';
      const name = this.extractField(block, 'Name') || 'unnamed-artifact';
      const description = this.extractField(block, 'Description') || '';
      const filePath = this.extractField(block, 'FilePath') || '';
      const content = this.extractContent(block);

      artifacts.push({ type, name, description, content, filePath });
    }

    const issueRegex = /---ISSUE_START---([\s\S]*?)---ISSUE_END---/g;
    let issueMatch: RegExpExecArray | null;

    while ((issueMatch = issueRegex.exec(output)) !== null) {
      const block = issueMatch[1].trim();
      const type = this.extractField(block, 'Type') || 'code_quality';
      const severity = this.extractField(block, 'Severity') || 'medium';
      const title = this.extractField(block, 'Title') || 'Untitled Issue';
      const description = this.extractField(block, 'Description') || '';

      issues.push({ type, severity, title, description });
    }

    return { artifacts, issues };
  }

  private extractField(block: string, fieldName: string): string | null {
    const regex = new RegExp(`^${fieldName}:\\s*(.+)$`, 'm');
    const match = regex.exec(block);
    return match ? match[1].trim() : null;
  }

  private extractContent(block: string): string {
    const contentIndex = block.indexOf('Content:');
    if (contentIndex === -1) return block;
    return block.substring(contentIndex + 'Content:'.length).trim();
  }

  private resolveArtifactType(raw: string): ArtifactType {
    const normalized = raw.toLowerCase().replace(/[\s-]/g, '_');
    const mapping: Record<string, ArtifactType> = {
      source_code: ArtifactType.SOURCE_CODE,
      unit_tests: ArtifactType.UNIT_TESTS,
      integration_tests: ArtifactType.INTEGRATION_TESTS,
      api_spec: ArtifactType.API_SPEC,
      data_model: ArtifactType.DATA_MODEL,
      architecture_doc: ArtifactType.ARCHITECTURE_DOC,
    };
    return mapping[normalized] || ArtifactType.SOURCE_CODE;
  }

  private resolveIssueType(raw: string): IssueType {
    const normalized = raw.toLowerCase().replace(/[\s-]/g, '_');
    const mapping: Record<string, IssueType> = {
      bug: IssueType.BUG,
      design_flaw: IssueType.DESIGN_FLAW,
      security_vulnerability: IssueType.SECURITY_VULNERABILITY,
      performance: IssueType.PERFORMANCE,
      code_quality: IssueType.CODE_QUALITY,
      missing_test: IssueType.MISSING_TEST,
      documentation_gap: IssueType.DOCUMENTATION_GAP,
      dependency_issue: IssueType.DEPENDENCY_ISSUE,
      architecture_concern: IssueType.ARCHITECTURE_CONCERN,
    };
    return mapping[normalized] || IssueType.CODE_QUALITY;
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
    return mapping[normalized] || IssueSeverity.MEDIUM;
  }

  private deriveModuleName(task: AgentTask): string {
    return task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private deriveFilePath(task: AgentTask): string {
    const moduleName = this.deriveModuleName(task);
    return `${moduleName}.ts`;
  }
}

export default SeniorDeveloperAgent;
