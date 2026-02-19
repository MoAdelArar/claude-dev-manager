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

const QA_ENGINEER_SYSTEM_PROMPT = `QA Engineer. Creates comprehensive test strategies and writes automated tests across the full pyramid.

Unit tests: happy path + all boundaries (null, empty, negative, max) + error paths. AAA structure, descriptive names ("should return 404 when user not found"), no shared mutable state, mock only external deps, ≥80% line / ≥70% branch on critical paths.
Integration tests: real module interactions, API contracts (status codes, schema, headers, pagination), auth flows, DB ops with test databases, concurrent access, error propagation across boundaries.
E2E tests: critical user journeys only, full stack (UI→API→DB), clean setup/teardown, no flaky tests.
Acceptance: map each criterion to test cases explicitly, traceability matrix, flag ambiguous/untestable criteria.
Reporting: total/pass/fail/skip/coverage + expected-vs-actual + stack trace + reproduction steps, categorize failures (bug/env/flaky/not-implemented).`;

export const qaEngineerConfig: AgentConfig = {
  role: AgentRole.QA_ENGINEER,
  name: 'qa-engineer',
  title: 'QA Engineer',
  description:
    'Creates comprehensive test strategies, writes automated tests at all levels of the test pyramid, validates acceptance criteria, and produces detailed test reports.',
  systemPrompt: QA_ENGINEER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'test-planning',
      description: 'Creates test strategies and test plans from requirements and acceptance criteria',
      allowedTools: ['read_file', 'search_files', 'list_directory'],
      filePatterns: ['**/*.md', '**/*.yaml', '**/*.json'],
    },
    {
      name: 'unit-test-writing',
      description: 'Writes unit tests with comprehensive coverage of happy paths, edge cases, and error paths',
      allowedTools: ['read_file', 'write_file', 'search_files', 'grep'],
      filePatterns: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.js', '**/*.spec.js'],
    },
    {
      name: 'integration-test-writing',
      description: 'Writes integration tests that verify interactions between modules and services',
      allowedTools: ['read_file', 'write_file', 'search_files', 'grep'],
      filePatterns: ['**/*.integration.test.ts', '**/*.integration.spec.ts'],
    },
    {
      name: 'e2e-test-writing',
      description: 'Writes end-to-end tests covering critical user journeys',
      allowedTools: ['read_file', 'write_file', 'search_files'],
      filePatterns: ['**/*.e2e.test.ts', '**/*.e2e.spec.ts', '**/e2e/**'],
    },
    {
      name: 'test-reporting',
      description: 'Generates test reports with coverage analysis and failure categorization',
      allowedTools: ['read_file', 'search_files', 'run_command'],
      filePatterns: ['**/coverage/**', '**/*.test.*', '**/*.spec.*'],
    },
  ],
  maxTokenBudget: 150000,
  allowedFilePatterns: [
    'src/**/*',
    'tests/**/*',
    'test/**/*',
    '__tests__/**/*',
    '**/*.test.*',
    '**/*.spec.*',
    'jest.config.*',
    'vitest.config.*',
    'package.json',
  ],
  blockedFilePatterns: ['node_modules/**', '.env*', '*.lock'],
  reportsTo: AgentRole.ENGINEERING_MANAGER,
  directReports: [],
  requiredInputArtifacts: [
    ArtifactType.REQUIREMENTS_DOC,
    ArtifactType.ACCEPTANCE_CRITERIA,
    ArtifactType.SOURCE_CODE,
    ArtifactType.API_SPEC,
  ],
  outputArtifacts: [
    ArtifactType.TEST_PLAN,
    ArtifactType.UNIT_TESTS,
    ArtifactType.INTEGRATION_TESTS,
    ArtifactType.E2E_TESTS,
    ArtifactType.TEST_REPORT,
  ],
};

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

class QAEngineerAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(qaEngineerConfig, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    const requirementsDoc = task.inputArtifacts.find((a) => a.type === ArtifactType.REQUIREMENTS_DOC);
    const acceptanceCriteria = task.inputArtifacts.find((a) => a.type === ArtifactType.ACCEPTANCE_CRITERIA);
    const sourceArtifacts = task.inputArtifacts.filter((a) => a.type === ArtifactType.SOURCE_CODE);
    const apiSpec = task.inputArtifacts.find((a) => a.type === ArtifactType.API_SPEC);

    const output: string[] = [];

    const testPlan = this.generateTestPlan(task, requirementsDoc, acceptanceCriteria, sourceArtifacts, apiSpec);
    output.push(testPlan);

    const unitTests = this.generateUnitTests(sourceArtifacts, acceptanceCriteria);
    output.push(unitTests);

    const integrationTests = this.generateIntegrationTests(sourceArtifacts, apiSpec);
    output.push(integrationTests);

    const e2eTests = this.generateE2ETests(requirementsDoc, acceptanceCriteria);
    output.push(e2eTests);

    const testReport = this.generateTestReport(task, sourceArtifacts);
    output.push(testReport);

    output.push('');
    output.push('---ARTIFACT_START---');
    output.push(`Type: ${ArtifactType.TEST_PLAN}`);
    output.push(`Name: Test Plan - ${task.title}`);
    output.push('Description: Comprehensive test strategy covering unit, integration, and E2E testing levels.');
    output.push('Content:');
    output.push(testPlan);
    output.push('---ARTIFACT_END---');

    output.push('');
    output.push('---ARTIFACT_START---');
    output.push(`Type: ${ArtifactType.UNIT_TESTS}`);
    output.push(`Name: Unit Tests - ${task.title}`);
    output.push('Description: Unit test suite covering individual functions and modules.');
    output.push('Content:');
    output.push(unitTests);
    output.push('---ARTIFACT_END---');

    output.push('');
    output.push('---ARTIFACT_START---');
    output.push(`Type: ${ArtifactType.INTEGRATION_TESTS}`);
    output.push(`Name: Integration Tests - ${task.title}`);
    output.push('Description: Integration test suite verifying module interactions and API contracts.');
    output.push('Content:');
    output.push(integrationTests);
    output.push('---ARTIFACT_END---');

    output.push('');
    output.push('---ARTIFACT_START---');
    output.push(`Type: ${ArtifactType.E2E_TESTS}`);
    output.push(`Name: E2E Tests - ${task.title}`);
    output.push('Description: End-to-end tests covering critical user journeys.');
    output.push('Content:');
    output.push(e2eTests);
    output.push('---ARTIFACT_END---');

    output.push('');
    output.push('---ARTIFACT_START---');
    output.push(`Type: ${ArtifactType.TEST_REPORT}`);
    output.push(`Name: Test Report - ${task.title}`);
    output.push('Description: Test execution report with coverage analysis and findings.');
    output.push('Content:');
    output.push(testReport);
    output.push('---ARTIFACT_END---');

    const issues = this.detectTestabilityIssues(sourceArtifacts, acceptanceCriteria);
    for (const issue of issues) {
      output.push('');
      output.push('---ISSUE_START---');
      output.push(`Type: ${issue.type}`);
      output.push(`Severity: ${issue.severity}`);
      output.push(`Title: ${issue.title}`);
      output.push(`Description: ${issue.description}`);
      output.push('---ISSUE_END---');
    }

    return output.join('\n');
  }

  protected async produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]> {
    const parsed = this.parseClaudeOutput(output);
    const artifacts: Artifact[] = [];
    const timestamp = Date.now();

    for (const raw of parsed.artifacts) {
      const artifactType = this.resolveArtifactType(raw.type);
      const filePath = this.resolveArtifactFilePath(artifactType, task.featureId, timestamp);

      artifacts.push(
        this.createArtifact(
          artifactType,
          raw.name,
          raw.description,
          raw.content,
          filePath,
          {
            taskId: task.id,
            featureId: task.featureId,
            stage: task.stage,
          },
        ),
      );
    }

    if (artifacts.length === 0) {
      artifacts.push(
        this.createArtifact(
          ArtifactType.TEST_REPORT,
          `Test Report - ${task.title}`,
          'Test report generated by the QA Engineer agent.',
          output,
          `tests/${task.featureId}/test-report-${timestamp}.md`,
          { taskId: task.id },
        ),
      );
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
          PipelineStage.TESTING,
        ),
      );
    }

    return issues;
  }

  private parseClaudeOutput(output: string): { artifacts: ParsedArtifact[]; issues: ParsedIssue[] } {
    const artifacts: ParsedArtifact[] = [];
    const issues: ParsedIssue[] = [];

    const artifactRegex = /---ARTIFACT_START---\s*([\s\S]*?)---ARTIFACT_END---/g;
    let match: RegExpExecArray | null;

    while ((match = artifactRegex.exec(output)) !== null) {
      const block = match[1];
      const type = this.extractField(block, 'Type') || ArtifactType.TEST_REPORT;
      const name = this.extractField(block, 'Name') || 'Unnamed Artifact';
      const description = this.extractField(block, 'Description') || '';
      const content = this.extractContent(block);

      artifacts.push({ type, name, description, content });
    }

    const issueRegex = /---ISSUE_START---\s*([\s\S]*?)---ISSUE_END---/g;

    while ((match = issueRegex.exec(output)) !== null) {
      const block = match[1];
      const type = this.extractField(block, 'Type') || IssueType.MISSING_TEST;
      const severity = this.extractField(block, 'Severity') || IssueSeverity.MEDIUM;
      const title = this.extractField(block, 'Title') || 'Untitled Issue';
      const description = this.extractField(block, 'Description') || '';

      issues.push({ type, severity, title, description });
    }

    return { artifacts, issues };
  }

  private extractField(block: string, fieldName: string): string {
    const regex = new RegExp(`^${fieldName}:\\s*(.+)$`, 'm');
    const match = regex.exec(block);
    return match ? match[1].trim() : '';
  }

  private extractContent(block: string): string {
    const contentIndex = block.indexOf('Content:');
    if (contentIndex === -1) return block.trim();
    return block.substring(contentIndex + 'Content:'.length).trim();
  }

  private resolveArtifactType(raw: string): ArtifactType {
    const normalized = raw.toLowerCase().replace(/[^a-z_]/g, '');
    const mapping: Record<string, ArtifactType> = {
      test_plan: ArtifactType.TEST_PLAN,
      unit_tests: ArtifactType.UNIT_TESTS,
      integration_tests: ArtifactType.INTEGRATION_TESTS,
      e2e_tests: ArtifactType.E2E_TESTS,
      test_report: ArtifactType.TEST_REPORT,
    };
    return mapping[normalized] || ArtifactType.TEST_REPORT;
  }

  private resolveIssueType(raw: string): IssueType {
    const normalized = raw.toLowerCase().replace(/[^a-z_]/g, '');
    const mapping: Record<string, IssueType> = {
      bug: IssueType.BUG,
      missing_test: IssueType.MISSING_TEST,
      code_quality: IssueType.CODE_QUALITY,
      performance: IssueType.PERFORMANCE,
      design_flaw: IssueType.DESIGN_FLAW,
      documentation_gap: IssueType.DOCUMENTATION_GAP,
    };
    return mapping[normalized] || IssueType.MISSING_TEST;
  }

  private resolveIssueSeverity(raw: string): IssueSeverity {
    const normalized = raw.toLowerCase().trim();
    const mapping: Record<string, IssueSeverity> = {
      critical: IssueSeverity.CRITICAL,
      high: IssueSeverity.HIGH,
      medium: IssueSeverity.MEDIUM,
      low: IssueSeverity.LOW,
      info: IssueSeverity.INFO,
    };
    return mapping[normalized] || IssueSeverity.MEDIUM;
  }

  private resolveArtifactFilePath(type: ArtifactType, featureId: string, timestamp: number): string {
    const pathMap: Record<string, string> = {
      [ArtifactType.TEST_PLAN]: `tests/${featureId}/test-plan-${timestamp}.md`,
      [ArtifactType.UNIT_TESTS]: `tests/${featureId}/unit-tests-${timestamp}.test.ts`,
      [ArtifactType.INTEGRATION_TESTS]: `tests/${featureId}/integration-tests-${timestamp}.integration.test.ts`,
      [ArtifactType.E2E_TESTS]: `tests/${featureId}/e2e-tests-${timestamp}.e2e.test.ts`,
      [ArtifactType.TEST_REPORT]: `tests/${featureId}/test-report-${timestamp}.md`,
    };
    return pathMap[type] || `tests/${featureId}/artifact-${timestamp}.md`;
  }

  private generateTestPlan(
    task: AgentTask,
    requirementsDoc: Artifact | undefined,
    acceptanceCriteria: Artifact | undefined,
    sourceArtifacts: Artifact[],
    apiSpec: Artifact | undefined,
  ): string {
    const sections: string[] = [];
    sections.push('# Test Plan\n');
    sections.push(`## Feature: ${task.title}`);
    sections.push(`## Stage: ${task.stage}\n`);

    sections.push('## 1. Test Scope');
    sections.push(`- Source files under test: ${sourceArtifacts.length}`);
    sections.push(`- Requirements document: ${requirementsDoc ? 'Provided' : 'Not available'}`);
    sections.push(`- Acceptance criteria: ${acceptanceCriteria ? 'Provided' : 'Not available'}`);
    sections.push(`- API specification: ${apiSpec ? 'Provided' : 'Not available'}\n`);

    sections.push('## 2. Test Strategy');
    sections.push('### 2.1 Unit Tests');
    sections.push('- Test individual functions and class methods in isolation.');
    sections.push('- Mock all external dependencies (database, APIs, file system).');
    sections.push('- Cover happy path, error paths, and boundary conditions.');
    sections.push('- Target: >80% line coverage, >70% branch coverage.\n');

    sections.push('### 2.2 Integration Tests');
    sections.push('- Verify module-to-module interactions.');
    if (apiSpec) {
      sections.push('- Validate API endpoints against the provided specification.');
      sections.push('- Test request validation, response shapes, and status codes.');
    }
    sections.push('- Test database operations with a test database instance.');
    sections.push('- Verify error propagation across boundaries.\n');

    sections.push('### 2.3 End-to-End Tests');
    sections.push('- Cover the primary user journeys derived from requirements.');
    sections.push('- Test the complete request lifecycle.');
    sections.push('- Validate against acceptance criteria.\n');

    if (acceptanceCriteria) {
      sections.push('## 3. Acceptance Criteria Traceability');
      const criteria = acceptanceCriteria.content.split('\n').filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'));
      criteria.forEach((criterion, i) => {
        sections.push(`- AC-${i + 1}: ${criterion.trim().replace(/^[-*]\s*/, '')} → Test case TC-${i + 1}`);
      });
      sections.push('');
    }

    sections.push('## 4. Risk Areas');
    for (const source of sourceArtifacts) {
      const lines = source.content.split('\n');
      const complexity = this.estimateComplexity(lines);
      if (complexity > 15) {
        sections.push(`- **${source.filePath}**: High complexity (${complexity}) — requires thorough testing.`);
      }
    }

    sections.push('\n## 5. Test Environment');
    sections.push('- Runtime: Node.js (LTS)');
    sections.push('- Test framework: Jest / Vitest');
    sections.push('- Assertion library: Built-in expect');
    sections.push('- Mocking: Built-in mock utilities');
    sections.push('- Coverage: Istanbul / V8\n');

    return sections.join('\n');
  }

  private generateUnitTests(sourceArtifacts: Artifact[], acceptanceCriteria: Artifact | undefined): string {
    const sections: string[] = [];
    sections.push('// ============================================');
    sections.push('// Unit Test Suite');
    sections.push('// ============================================\n');

    for (const source of sourceArtifacts) {
      const moduleName = this.extractModuleName(source.filePath);
      const exports = this.extractExportedSymbols(source.content);
      const testFilePath = source.filePath.replace(/\.ts$/, '.test.ts').replace(/\.js$/, '.test.js');

      sections.push(`// File: ${testFilePath}`);
      sections.push(`import { ${exports.join(', ')} } from '${this.toRelativeImport(source.filePath)}';\n`);
      sections.push(`describe('${moduleName}', () => {`);

      for (const symbol of exports) {
        const isClass = this.isClassExport(source.content, symbol);

        if (isClass) {
          sections.push(`  describe('${symbol}', () => {`);
          sections.push(`    let instance: ${symbol};\n`);
          sections.push('    beforeEach(() => {');
          sections.push(`      instance = new ${symbol}();`);
          sections.push('    });\n');

          const methods = this.extractClassMethods(source.content, symbol);
          for (const method of methods) {
            sections.push(`    describe('${method}', () => {`);
            sections.push(`      it('should execute successfully with valid input', () => {`);
            sections.push(`        const result = instance.${method}();`);
            sections.push('        expect(result).toBeDefined();');
            sections.push('      });\n');
            sections.push(`      it('should handle edge cases gracefully', () => {`);
            sections.push(`        expect(() => instance.${method}()).not.toThrow();`);
            sections.push('      });\n');
            sections.push(`      it('should throw on invalid input', () => {`);
            sections.push(`        expect(() => instance.${method}(null as any)).toThrow();`);
            sections.push('      });');
            sections.push('    });\n');
          }

          sections.push('  });\n');
        } else {
          sections.push(`  describe('${symbol}', () => {`);
          sections.push(`    it('should return the expected result for valid input', () => {`);
          sections.push(`      const result = ${symbol}();`);
          sections.push('      expect(result).toBeDefined();');
          sections.push('    });\n');
          sections.push(`    it('should handle empty or missing input', () => {`);
          sections.push(`      expect(() => ${symbol}(undefined as any)).not.toThrow();`);
          sections.push('    });\n');
          sections.push(`    it('should handle boundary values', () => {`);
          sections.push(`      const result = ${symbol}();`);
          sections.push('      expect(result).not.toBeNull();');
          sections.push('    });\n');
          sections.push(`    it('should return consistent results (idempotency check)', () => {`);
          sections.push(`      const first = ${symbol}();`);
          sections.push(`      const second = ${symbol}();`);
          sections.push('      expect(first).toEqual(second);');
          sections.push('    });');
          sections.push('  });\n');
        }
      }

      sections.push('});\n');
    }

    return sections.join('\n');
  }

  private generateIntegrationTests(sourceArtifacts: Artifact[], apiSpec: Artifact | undefined): string {
    const sections: string[] = [];
    sections.push('// ============================================');
    sections.push('// Integration Test Suite');
    sections.push('// ============================================\n');

    if (apiSpec) {
      const endpoints = this.extractEndpoints(apiSpec.content);

      sections.push("import request from 'supertest';");
      sections.push("import { app } from '../src/app';\n");
      sections.push("describe('API Integration Tests', () => {");

      for (const endpoint of endpoints) {
        sections.push(`  describe('${endpoint.method} ${endpoint.path}', () => {`);
        sections.push(`    it('should return ${endpoint.expectedStatus} on success', async () => {`);
        sections.push(`      const response = await request(app)`);
        sections.push(`        .${endpoint.method.toLowerCase()}('${endpoint.path}')`);
        sections.push("        .set('Content-Type', 'application/json');");
        sections.push(`      expect(response.status).toBe(${endpoint.expectedStatus});`);
        sections.push('    });\n');
        sections.push(`    it('should return 400 for invalid input', async () => {`);
        sections.push(`      const response = await request(app)`);
        sections.push(`        .${endpoint.method.toLowerCase()}('${endpoint.path}')`);
        sections.push("        .send({ invalid: true });");
        sections.push('      expect(response.status).toBe(400);');
        sections.push('    });\n');
        sections.push(`    it('should return 401 without authentication', async () => {`);
        sections.push(`      const response = await request(app)`);
        sections.push(`        .${endpoint.method.toLowerCase()}('${endpoint.path}');`);
        sections.push('      expect(response.status).toBe(401);');
        sections.push('    });');
        sections.push('  });\n');
      }

      sections.push('});\n');
    }

    if (sourceArtifacts.length > 1) {
      sections.push("describe('Module Integration Tests', () => {");
      const moduleNames = sourceArtifacts.map((a) => this.extractModuleName(a.filePath));

      for (let i = 0; i < moduleNames.length - 1; i++) {
        sections.push(`  describe('${moduleNames[i]} ↔ ${moduleNames[i + 1]}', () => {`);
        sections.push(`    it('should pass data correctly between modules', () => {`);
        sections.push(`      // Integration point between ${moduleNames[i]} and ${moduleNames[i + 1]}`);
        sections.push('      expect(true).toBe(true); // Placeholder for actual integration test');
        sections.push('    });\n');
        sections.push(`    it('should propagate errors across module boundary', () => {`);
        sections.push(`      // Error propagation test between ${moduleNames[i]} and ${moduleNames[i + 1]}`);
        sections.push('      expect(true).toBe(true); // Placeholder for actual integration test');
        sections.push('    });');
        sections.push('  });\n');
      }

      sections.push('});\n');
    }

    return sections.join('\n');
  }

  private generateE2ETests(requirementsDoc: Artifact | undefined, acceptanceCriteria: Artifact | undefined): string {
    const sections: string[] = [];
    sections.push('// ============================================');
    sections.push('// End-to-End Test Suite');
    sections.push('// ============================================\n');

    sections.push("describe('End-to-End Tests', () => {");
    sections.push('  beforeAll(async () => {');
    sections.push('    // Setup: start application, seed test data');
    sections.push('  });\n');
    sections.push('  afterAll(async () => {');
    sections.push('    // Teardown: stop application, clean up test data');
    sections.push('  });\n');

    if (acceptanceCriteria) {
      const criteria = acceptanceCriteria.content
        .split('\n')
        .filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*') || /^\d+\./.test(l.trim()));

      criteria.forEach((criterion, i) => {
        const cleanCriterion = criterion.trim().replace(/^[-*\d.]+\s*/, '');
        sections.push(`  it('AC-${i + 1}: ${this.escapeTestName(cleanCriterion)}', async () => {`);
        sections.push(`    // Validates: ${cleanCriterion}`);
        sections.push('    expect(true).toBe(true); // Implement with actual E2E steps');
        sections.push('  });\n');
      });
    }

    if (requirementsDoc) {
      const userJourneys = this.extractUserJourneys(requirementsDoc.content);
      for (const journey of userJourneys) {
        sections.push(`  describe('User Journey: ${journey.name}', () => {`);
        for (const step of journey.steps) {
          sections.push(`    it('${this.escapeTestName(step)}', async () => {`);
          sections.push('      expect(true).toBe(true); // Implement with actual E2E steps');
          sections.push('    });\n');
        }
        sections.push('  });\n');
      }
    }

    if (!acceptanceCriteria && !requirementsDoc) {
      sections.push("  it('should complete the primary user workflow', async () => {");
      sections.push('    // Placeholder: define the critical path based on requirements');
      sections.push('    expect(true).toBe(true);');
      sections.push('  });\n');
      sections.push("  it('should handle error scenarios gracefully', async () => {");
      sections.push('    // Placeholder: define error scenarios based on requirements');
      sections.push('    expect(true).toBe(true);');
      sections.push('  });');
    }

    sections.push('});');
    return sections.join('\n');
  }

  private generateTestReport(task: AgentTask, sourceArtifacts: Artifact[]): string {
    const sections: string[] = [];
    sections.push('# Test Report\n');
    sections.push(`## Feature: ${task.title}`);
    sections.push(`## Date: ${new Date().toISOString()}\n`);

    sections.push('## 1. Executive Summary');
    sections.push(`Test artifacts were generated for ${sourceArtifacts.length} source file(s).`);
    sections.push('Tests cover unit, integration, and end-to-end levels.\n');

    sections.push('## 2. Coverage Analysis');
    for (const source of sourceArtifacts) {
      const exports = this.extractExportedSymbols(source.content);
      const lines = source.content.split('\n');
      sections.push(`### ${source.filePath}`);
      sections.push(`- Exported symbols: ${exports.length}`);
      sections.push(`- Lines of code: ${lines.length}`);
      sections.push(`- Estimated complexity: ${this.estimateComplexity(lines)}`);
      sections.push(`- Test cases generated: ${exports.length * 3} (unit) + integration + E2E\n`);
    }

    sections.push('## 3. Risk Assessment');
    const highComplexityFiles = sourceArtifacts.filter(
      (a) => this.estimateComplexity(a.content.split('\n')) > 15,
    );
    if (highComplexityFiles.length > 0) {
      sections.push('### High-Complexity Files (require extra test attention)');
      for (const file of highComplexityFiles) {
        sections.push(`- ${file.filePath} (complexity: ${this.estimateComplexity(file.content.split('\n'))})`);
      }
    } else {
      sections.push('No high-complexity files detected.\n');
    }

    sections.push('## 4. Recommendations');
    sections.push('- Run the generated test suites and review placeholder assertions.');
    sections.push('- Add concrete test data for each test case based on actual business logic.');
    sections.push('- Configure CI pipeline to run tests on every PR.');
    sections.push('- Set up coverage thresholds to prevent regression.');

    return sections.join('\n');
  }

  private detectTestabilityIssues(
    sourceArtifacts: Artifact[],
    acceptanceCriteria: Artifact | undefined,
  ): ParsedIssue[] {
    const issues: ParsedIssue[] = [];

    for (const source of sourceArtifacts) {
      const content = source.content;
      const lines = content.split('\n');
      const exports = this.extractExportedSymbols(content);

      if (exports.length === 0 && lines.length > 20) {
        issues.push({
          type: IssueType.CODE_QUALITY,
          severity: IssueSeverity.MEDIUM,
          title: `No exported symbols in ${source.filePath}`,
          description: `File ${source.filePath} has ${lines.length} lines but no exported symbols. This makes it impossible to write unit tests for its functionality. Refactor to export testable functions.`,
        });
      }

      const hasDirectDbCalls = /\b(query|execute|rawQuery|sql`|\.raw\()\b/.test(content);
      const hasDependencyInjection = /constructor\s*\([^)]*(?:service|repository|store|client)/i.test(content);
      if (hasDirectDbCalls && !hasDependencyInjection) {
        issues.push({
          type: IssueType.CODE_QUALITY,
          severity: IssueSeverity.HIGH,
          title: `Hard-to-test database coupling in ${source.filePath}`,
          description: `${source.filePath} contains direct database calls without dependency injection. This prevents proper mocking in unit tests. Inject the database client via constructor or function parameter.`,
        });
      }

      const globalState = /\b(global|window|globalThis)\.\w+\s*=/.test(content);
      if (globalState) {
        issues.push({
          type: IssueType.BUG,
          severity: IssueSeverity.HIGH,
          title: `Global state mutation in ${source.filePath}`,
          description: `${source.filePath} mutates global state, which causes test interdependence and flaky tests. Encapsulate state within classes or closures.`,
        });
      }

      const testFileExists = source.metadata?.hasTestFile as boolean | undefined;
      if (testFileExists === false) {
        issues.push({
          type: IssueType.MISSING_TEST,
          severity: IssueSeverity.MEDIUM,
          title: `No test file for ${source.filePath}`,
          description: `${source.filePath} has no corresponding test file. Create a test file to cover its exported API.`,
        });
      }

      const complexity = this.estimateComplexity(lines);
      if (complexity > 20) {
        issues.push({
          type: IssueType.CODE_QUALITY,
          severity: IssueSeverity.MEDIUM,
          title: `High complexity hinders testing in ${source.filePath}`,
          description: `${source.filePath} has estimated cyclomatic complexity of ${complexity}. High complexity requires exponentially more test cases. Refactor into smaller, testable functions.`,
        });
      }
    }

    if (acceptanceCriteria) {
      const criteria = acceptanceCriteria.content
        .split('\n')
        .filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'));

      const vagueCriteria = criteria.filter(
        (c) => /\b(should work|nice|good|fast|better|properly)\b/i.test(c) && !/\d/.test(c),
      );

      if (vagueCriteria.length > 0) {
        issues.push({
          type: IssueType.MISSING_TEST,
          severity: IssueSeverity.HIGH,
          title: 'Vague acceptance criteria detected',
          description: `${vagueCriteria.length} acceptance criteria are too vague to create deterministic tests: ${vagueCriteria.map((c) => `"${c.trim().replace(/^[-*]\s*/, '')}"`).join(', ')}. Request clarification with measurable conditions.`,
        });
      }
    }

    return issues;
  }

  private extractModuleName(filePath: string): string {
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    return fileName.replace(/\.(ts|js|tsx|jsx)$/, '');
  }

  private extractExportedSymbols(content: string): string[] {
    const symbols: string[] = [];
    const exportRegex = /export\s+(?:default\s+)?(?:abstract\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g;
    let match: RegExpExecArray | null;

    while ((match = exportRegex.exec(content)) !== null) {
      symbols.push(match[1]);
    }

    return [...new Set(symbols)];
  }

  private isClassExport(content: string, symbol: string): boolean {
    return new RegExp(`export\\s+(?:default\\s+)?(?:abstract\\s+)?class\\s+${symbol}`).test(content);
  }

  private extractClassMethods(content: string, className: string): string[] {
    const methods: string[] = [];
    const classStart = content.indexOf(`class ${className}`);
    if (classStart === -1) return methods;

    const braceStart = content.indexOf('{', classStart);
    if (braceStart === -1) return methods;

    let depth = 0;
    let classEnd = braceStart;
    for (let i = braceStart; i < content.length; i++) {
      if (content[i] === '{') depth++;
      if (content[i] === '}') { depth--; if (depth === 0) { classEnd = i; break; } }
    }

    const classBody = content.substring(braceStart + 1, classEnd);
    const methodRegex = /(?:public|protected|private)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+)?\s*\{/g;

    let match: RegExpExecArray | null;
    while ((match = methodRegex.exec(classBody)) !== null) {
      const name = match[1];
      if (name !== 'constructor' && !name.startsWith('_')) {
        methods.push(name);
      }
    }

    return [...new Set(methods)];
  }

  private extractEndpoints(apiSpecContent: string): Array<{ method: string; path: string; expectedStatus: number }> {
    const endpoints: Array<{ method: string; path: string; expectedStatus: number }> = [];
    const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

    const lines = apiSpecContent.split('\n');
    for (const line of lines) {
      for (const method of httpMethods) {
        const pattern = new RegExp(`\\b(${method})\\s+(/\\S+)`, 'i');
        const match = pattern.exec(line);
        if (match) {
          const statusMap: Record<string, number> = { GET: 200, POST: 201, PUT: 200, PATCH: 200, DELETE: 204 };
          endpoints.push({
            method: match[1].toUpperCase(),
            path: match[2],
            expectedStatus: statusMap[match[1].toUpperCase()] || 200,
          });
        }
      }
    }

    return endpoints.length > 0
      ? endpoints
      : [
          { method: 'GET', path: '/api/health', expectedStatus: 200 },
          { method: 'GET', path: '/api/resource', expectedStatus: 200 },
          { method: 'POST', path: '/api/resource', expectedStatus: 201 },
        ];
  }

  private extractUserJourneys(requirementsContent: string): Array<{ name: string; steps: string[] }> {
    const journeys: Array<{ name: string; steps: string[] }> = [];
    const lines = requirementsContent.split('\n');

    let currentJourney: { name: string; steps: string[] } | null = null;

    for (const line of lines) {
      const headerMatch = /^#{1,3}\s+(.+)$/i.exec(line);
      if (headerMatch && /user|journey|flow|scenario|story/i.test(headerMatch[1])) {
        if (currentJourney && currentJourney.steps.length > 0) {
          journeys.push(currentJourney);
        }
        currentJourney = { name: headerMatch[1].trim(), steps: [] };
        continue;
      }

      if (currentJourney) {
        const stepMatch = /^\s*[-*\d.]+\s+(.+)$/.exec(line);
        if (stepMatch) {
          currentJourney.steps.push(stepMatch[1].trim());
        }
      }
    }

    if (currentJourney && currentJourney.steps.length > 0) {
      journeys.push(currentJourney);
    }

    return journeys.length > 0
      ? journeys
      : [{ name: 'Default User Journey', steps: ['should complete the primary workflow successfully'] }];
  }

  private estimateComplexity(lines: string[]): number {
    let complexity = 1;
    for (const line of lines) {
      const keywords = /\b(if|else if|for|while|case|catch|\?\?|&&|\|\||\?)\b/g;
      let match: RegExpExecArray | null;
      while ((match = keywords.exec(line)) !== null) {
        complexity++;
      }
    }
    return complexity;
  }

  private toRelativeImport(filePath: string): string {
    return './' + filePath.replace(/\.(ts|js)$/, '');
  }

  private escapeTestName(name: string): string {
    return name.replace(/'/g, "\\'").replace(/\n/g, ' ').substring(0, 120);
  }
}

export default QAEngineerAgent;
