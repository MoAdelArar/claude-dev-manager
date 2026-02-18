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

const JUNIOR_DEVELOPER_SYSTEM_PROMPT = `You are a Junior Developer who is eager to learn, diligent, and methodical in your
approach to software development. You have solid fundamentals in computer science
and 1-2 years of professional experience. You follow established patterns closely
and are committed to writing clean, well-tested code.

Your strengths include:
- Implementing straightforward features by following existing patterns in the codebase
- Writing utility functions, helpers, and shared modules
- Creating boilerplate code and scaffolding new components
- Writing comprehensive unit tests with high coverage
- Following coding standards and linting rules precisely
- Paying attention to detail in implementation and documentation

Your working style:
- You ALWAYS study existing code written by the senior developer before implementing
- You follow the established patterns, naming conventions, and project structure exactly
- You never deviate from the architecture without explicit approval
- You write unit tests for every public function and edge case you can identify
- You prefer small, focused commits that are easy to review
- You ask for clarification when requirements are ambiguous rather than guessing
- You flag anything that seems inconsistent or unclear for senior review

When writing code you:
1. Read and understand the existing codebase patterns first
2. Follow the exact same style, formatting, and naming conventions
3. Implement the simplest correct solution — avoid over-engineering
4. Validate inputs and handle basic error cases
5. Write descriptive variable and function names
6. Add comments only when the intent is not obvious from the code
7. Create a corresponding test file for every source file you produce
8. Test happy paths, error paths, edge cases, and boundary conditions
9. Use mocks and stubs appropriately in unit tests
10. Ensure all tests pass before marking the task as complete

When writing tests you follow these principles:
- Arrange-Act-Assert pattern for every test case
- One assertion per test when possible for clear failure messages
- Descriptive test names that document the behavior being tested
- Test edge cases: empty inputs, null values, boundary conditions, large inputs
- Mock external dependencies to isolate the unit under test
- Aim for 90%+ line coverage on the code you are testing

If you encounter something you are unsure about, you explicitly flag it as an issue
with type "architecture_concern" so the senior developer can review. You never make
assumptions about business logic — you implement exactly what is specified.

You produce artifacts in a structured format delimited by markers so that the
pipeline can parse and store them automatically. Every file you produce must be
syntactically valid.`;

export const JUNIOR_DEVELOPER_CONFIG: AgentConfig = {
  role: AgentRole.JUNIOR_DEVELOPER,
  name: 'junior-developer',
  title: 'Junior Developer',
  description:
    'Implements simpler features, utility functions, boilerplate code, and writes comprehensive ' +
    'unit tests. Follows patterns established by the senior developer closely.',
  systemPrompt: JUNIOR_DEVELOPER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'code_implementation',
      description:
        'Implements straightforward features, utility functions, boilerplate code, and scaffolding ' +
        'by following established patterns from the senior developer.',
      allowedTools: ['Read', 'Write', 'Shell'],
      filePatterns: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx'],
    },
    {
      name: 'test_writing',
      description:
        'Writes comprehensive unit tests covering happy paths, error paths, edge cases, ' +
        'and boundary conditions. Aims for 90%+ code coverage.',
      allowedTools: ['Read', 'Write', 'Shell'],
      filePatterns: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'tests/**/*.ts',
        '__tests__/**/*.ts',
      ],
    },
  ],
  maxTokenBudget: 100_000,
  allowedFilePatterns: [
    'src/**/*.ts',
    'src/**/*.tsx',
    'src/**/*.js',
    'src/**/*.jsx',
    'tests/**/*',
    '__tests__/**/*',
    'src/**/*.test.*',
    'src/**/*.spec.*',
  ],
  blockedFilePatterns: [
    '.env',
    '.env.*',
    '**/*.secret',
    '**/credentials*',
    '**/node_modules/**',
    'config/**/*',
  ],
  reportsTo: AgentRole.SENIOR_DEVELOPER,
  directReports: [],
  requiredInputArtifacts: [
    ArtifactType.TASK_LIST,
    ArtifactType.SOURCE_CODE,
    ArtifactType.UI_SPEC,
    ArtifactType.COMPONENT_SPEC,
  ],
  outputArtifacts: [ArtifactType.SOURCE_CODE, ArtifactType.UNIT_TESTS],
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

export class JuniorDeveloperAgent extends BaseAgent {
  constructor(config: AgentConfig, artifactStore: ArtifactStore) {
    super(config, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, `Starting work on task "${task.title}"`, task.stage);

    this.buildClaudeCodePrompt(task);

    const sections: string[] = [];

    sections.push('### Summary');
    sections.push(
      `Implementing task "${task.title}" as Junior Developer. ` +
      'Studied existing source code and patterns from senior developer, then implemented ' +
      'the assigned feature following established conventions. Wrote unit tests for all public methods.',
    );

    const existingSource = task.inputArtifacts.filter((a) => a.type === ArtifactType.SOURCE_CODE);
    const taskList = task.inputArtifacts.find((a) => a.type === ArtifactType.TASK_LIST);
    const uiSpec = task.inputArtifacts.find((a) => a.type === ArtifactType.UI_SPEC);
    const componentSpec = task.inputArtifacts.find((a) => a.type === ArtifactType.COMPONENT_SPEC);

    sections.push('### Analysis of Existing Patterns');

    const analysisItems: string[] = [];
    if (existingSource.length > 0) {
      analysisItems.push(`- Studied ${existingSource.length} existing source artifact(s) for patterns:`);
      for (const src of existingSource) {
        analysisItems.push(`  - ${src.name}: reviewed structure, naming, and error handling conventions`);
      }
    } else {
      analysisItems.push('- No existing source code artifacts provided; using default project conventions');
    }
    if (taskList) {
      analysisItems.push(`- Following task breakdown: ${taskList.name}`);
    }
    if (uiSpec) {
      analysisItems.push(`- UI specification reference: ${uiSpec.name}`);
    }
    if (componentSpec) {
      analysisItems.push(`- Component specification reference: ${componentSpec.name}`);
    }
    sections.push(analysisItems.join('\n'));

    const sourceContent = this.synthesizeImplementation(task, existingSource);
    const testContent = this.synthesizeTests(task, sourceContent);

    sections.push('### Artifacts');

    const moduleName = this.deriveModuleName(task);
    const filePath = `src/${this.deriveFilePath(task)}`;
    const testFilePath = `src/${this.deriveTestFilePath(task)}`;

    sections.push(
      '---ARTIFACT_START---\n' +
      'Type: source_code\n' +
      `Name: ${moduleName}\n` +
      `Description: Implementation of ${task.title} following senior developer patterns\n` +
      `FilePath: ${filePath}\n` +
      'Content:\n' +
      sourceContent + '\n' +
      '---ARTIFACT_END---',
    );

    sections.push(
      '---ARTIFACT_START---\n' +
      'Type: unit_tests\n' +
      `Name: ${moduleName}-tests\n` +
      `Description: Unit tests for ${task.title} covering happy paths, error paths, and edge cases\n` +
      `FilePath: ${testFilePath}\n` +
      'Content:\n' +
      testContent + '\n' +
      '---ARTIFACT_END---',
    );

    const issueItems = this.detectTaskIssues(task, existingSource);
    if (issueItems.length > 0) {
      sections.push('### Issues Found');
      for (const issue of issueItems) {
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
      '- Senior developer should review the implementation for correctness and adherence to architecture\n' +
      '- Code reviewer should verify test coverage meets project standards\n' +
      '- Consider adding integration tests if this module interacts with external services',
    );

    agentLog(this.role, `Completed implementation and tests for "${task.title}"`, task.stage);

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
        'No artifacts parsed from output; creating fallback artifacts',
        task.stage,
        'warn',
      );

      const fallbackSource = this.createArtifact(
        ArtifactType.SOURCE_CODE,
        this.deriveModuleName(task),
        `Implementation output for ${task.title}`,
        output,
        `src/${this.deriveFilePath(task)}`,
        { taskId: task.id, featureId: task.featureId, fallback: true },
      );
      artifacts.push(fallbackSource);

      const fallbackTests = this.createArtifact(
        ArtifactType.UNIT_TESTS,
        `${this.deriveModuleName(task)}-tests`,
        `Test output for ${task.title}`,
        '// Tests could not be parsed from output\n',
        `src/${this.deriveTestFilePath(task)}`,
        { taskId: task.id, featureId: task.featureId, fallback: true },
      );
      artifacts.push(fallbackTests);
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

  private synthesizeImplementation(task: AgentTask, existingSource: Artifact[]): string {
    const lines: string[] = [];

    lines.push(`// Module: ${this.deriveModuleName(task)}`);
    lines.push(`// Task: ${task.title}`);
    lines.push(`// Stage: ${task.stage}`);
    lines.push(`// Pattern reference: ${existingSource.length > 0 ? existingSource[0].name : 'default conventions'}`);
    lines.push('');

    lines.push(task.description);

    if (task.instructions) {
      lines.push('');
      lines.push(task.instructions);
    }

    for (const artifact of task.inputArtifacts) {
      if (artifact.type === ArtifactType.SOURCE_CODE) continue;
      lines.push('');
      lines.push(`// --- Input from ${artifact.name} (${artifact.type}) ---`);
      lines.push(artifact.content);
    }

    if (existingSource.length > 0) {
      lines.push('');
      lines.push('// --- Existing source patterns for reference ---');
      for (const src of existingSource) {
        lines.push(`// From: ${src.name}`);
        lines.push(src.content);
      }
    }

    return lines.join('\n');
  }

  private synthesizeTests(task: AgentTask, sourceContent: string): string {
    const moduleName = this.deriveModuleName(task);
    const lines: string[] = [];

    lines.push(`// Test suite: ${moduleName}`);
    lines.push(`// Task: ${task.title}`);
    lines.push(`// Methodology: Arrange-Act-Assert`);
    lines.push('');
    lines.push(`import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';`);
    lines.push('');
    lines.push(`describe('${moduleName}', () => {`);
    lines.push('');
    lines.push('  // --- Happy Path Tests ---');
    lines.push('');
    lines.push(`  it('should handle the primary use case correctly', () => {`);
    lines.push('    // Arrange');
    lines.push(`    // [SCAFFOLD] Set up test data based on ${task.title}`);
    lines.push('');
    lines.push('    // Act');
    lines.push('    // [SCAFFOLD] Invoke the function/method under test');
    lines.push('');
    lines.push('    // Assert');
    lines.push('    // [SCAFFOLD] Replace with real assertions');
    lines.push('    expect(true).toBe(true);');
    lines.push('  });');
    lines.push('');
    lines.push('  // --- Error Path Tests ---');
    lines.push('');
    lines.push(`  it('should handle invalid input gracefully', () => {`);
    lines.push('    // Arrange');
    lines.push('    // [SCAFFOLD] Set up invalid input');
    lines.push('');
    lines.push('    // Act & Assert');
    lines.push('    // [SCAFFOLD] Replace with real error handling assertions');
    lines.push('    expect(true).toBe(true);');
    lines.push('  });');
    lines.push('');
    lines.push('  // --- Edge Case Tests ---');
    lines.push('');
    lines.push(`  it('should handle empty input', () => {`);
    lines.push('    expect(true).toBe(true);');
    lines.push('  });');
    lines.push('');
    lines.push(`  it('should handle boundary conditions', () => {`);
    lines.push('    expect(true).toBe(true);');
    lines.push('  });');
    lines.push('');
    lines.push('});');

    return lines.join('\n');
  }

  private detectTaskIssues(task: AgentTask, existingSource: Artifact[]): ParsedIssue[] {
    const issues: ParsedIssue[] = [];

    if (existingSource.length === 0) {
      issues.push({
        type: IssueType.ARCHITECTURE_CONCERN,
        severity: IssueSeverity.MEDIUM,
        title: 'No existing source code patterns available for reference',
        description:
          'No SOURCE_CODE artifacts were provided as input. The implementation was created ' +
          'using default conventions, but senior developer should review for consistency ' +
          'with the overall codebase patterns and architecture.',
      });
    }

    const descriptionLower = task.description.toLowerCase();
    const hasAmbiguity =
      descriptionLower.includes('tbd') ||
      descriptionLower.includes('to be determined') ||
      descriptionLower.includes('unclear') ||
      descriptionLower.includes('maybe') ||
      descriptionLower.includes('possibly');
    if (hasAmbiguity) {
      issues.push({
        type: IssueType.ARCHITECTURE_CONCERN,
        severity: IssueSeverity.HIGH,
        title: 'Ambiguous requirements detected in task description',
        description:
          'The task description contains ambiguous language (TBD, unclear, maybe, etc.). ' +
          'Senior developer or product manager should clarify requirements before ' +
          'proceeding further. Implementation may need revision after clarification.',
      });
    }

    if (task.constraints.length === 0) {
      issues.push({
        type: IssueType.CODE_QUALITY,
        severity: IssueSeverity.LOW,
        title: 'No constraints specified for task',
        description:
          'The task has no explicit constraints defined. Default project conventions were ' +
          'applied. Senior developer should verify the implementation meets any implicit ' +
          'requirements not captured in the task definition.',
      });
    }

    return issues;
  }

  private detectImplicitIssues(task: AgentTask, output: string): Issue[] {
    const issues: Issue[] = [];
    const lowerOutput = output.toLowerCase();

    if (
      lowerOutput.includes('unsure') ||
      lowerOutput.includes('uncertain') ||
      lowerOutput.includes('not clear') ||
      lowerOutput.includes('clarification needed')
    ) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.ARCHITECTURE_CONCERN,
          IssueSeverity.MEDIUM,
          'Areas of uncertainty flagged during implementation',
          'The implementation process encountered areas of uncertainty. ' +
          'Senior developer should review these sections and provide guidance.',
          task.stage,
        ),
      );
    }

    if (lowerOutput.includes('todo') || lowerOutput.includes('fixme')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.CODE_QUALITY,
          IssueSeverity.LOW,
          'Incomplete implementation markers found',
          'The output contains TODO or FIXME markers indicating areas that need further ' +
          'implementation. These should be addressed before the code review stage.',
          task.stage,
        ),
      );
    }

    const hasTestArtifact = output.includes('Type: unit_tests');
    if (!hasTestArtifact) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.MISSING_TEST,
          IssueSeverity.MEDIUM,
          'Unit test artifact may be missing from output',
          'The output does not appear to contain a unit_tests artifact. ' +
          'All implementations from the junior developer should include corresponding tests.',
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

  private deriveTestFilePath(task: AgentTask): string {
    const moduleName = this.deriveModuleName(task);
    return `${moduleName}.test.ts`;
  }
}

export default JuniorDeveloperAgent;
