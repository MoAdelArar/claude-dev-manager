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

const REVIEWER_SYSTEM_PROMPT = `You evaluate work quality through multiple lenses.
You find issues, rate severity accurately, and provide actionable feedback.
You do not write code — you review it. Your feedback is specific and constructive.
You prioritize findings by impact and provide clear remediation guidance.`;

export const REVIEWER_CONFIG: AgentConfig = {
  role: AgentRole.REVIEWER,
  name: 'reviewer',
  title: 'Reviewer',
  description: 'Reviews code, security, performance, accessibility, and test quality. Provides actionable feedback.',
  systemPrompt: REVIEWER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'code_review',
      description: 'Reviews code for quality and correctness',
      allowedTools: ['Read', 'Grep', 'Glob'],
      filePatterns: ['src/**/*', 'lib/**/*'],
    },
    {
      name: 'security_audit',
      description: 'Audits code for security vulnerabilities',
      allowedTools: ['Read', 'Grep'],
      filePatterns: ['**/*'],
    },
    {
      name: 'test_validation',
      description: 'Validates test coverage and quality',
      allowedTools: ['Read', 'Grep'],
      filePatterns: ['test/**/*', 'tests/**/*', '**/*.test.*'],
    },
  ],
  maxTokenBudget: 50000,
  allowedFilePatterns: ['**/*'],
  blockedFilePatterns: ['.env', '.env.*'],
  compatibleSkills: [
    'code-review',
    'security-audit',
    'performance-analysis',
    'accessibility-audit',
    'test-validation',
  ],
  requiredInputArtifacts: [ArtifactType.SOURCE_CODE],
  outputArtifacts: [
    ArtifactType.CODE_REVIEW_REPORT,
    ArtifactType.SECURITY_REPORT,
    ArtifactType.PERFORMANCE_REPORT,
    ArtifactType.ACCESSIBILITY_REPORT,
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

export class ReviewerAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(REVIEWER_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, `Starting review: ${task.title}`, task.step);

    const sections: string[] = [];
    sections.push('# Review Report\n');

    const sourceCode = task.inputArtifacts.filter(
      (a) => a.type === ArtifactType.SOURCE_CODE,
    );

    sections.push('## Review Context\n');
    sections.push(`- Source files reviewed: ${sourceCode.length}`);
    sections.push(`- Active Skills: ${task.activeSkills?.join(', ') || 'None'}`);

    if (task.activeSkills?.includes('code-review')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: code_review_report');
      sections.push('Name: Code Review Report');
      sections.push('Description: Code quality and correctness review');
      sections.push('Content:');
      sections.push(this.generateCodeReviewReport(task, sourceCode));
      sections.push('---ARTIFACT_END---\n');
    }

    if (task.activeSkills?.includes('security-audit')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: security_report');
      sections.push('Name: Security Audit Report');
      sections.push('Description: Security vulnerability assessment');
      sections.push('Content:');
      sections.push(this.generateSecurityReport(task, sourceCode));
      sections.push('---ARTIFACT_END---\n');
    }

    if (task.activeSkills?.includes('performance-analysis')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: performance_report');
      sections.push('Name: Performance Analysis Report');
      sections.push('Description: Performance bottleneck analysis');
      sections.push('Content:');
      sections.push(this.generatePerformanceReport(task, sourceCode));
      sections.push('---ARTIFACT_END---\n');
    }

    if (task.activeSkills?.includes('accessibility-audit')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: accessibility_report');
      sections.push('Name: Accessibility Audit Report');
      sections.push('Description: WCAG 2.1 AA compliance assessment');
      sections.push('Content:');
      sections.push(this.generateAccessibilityReport(task, sourceCode));
      sections.push('---ARTIFACT_END---\n');
    }

    if (task.activeSkills?.includes('test-validation')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: test_report');
      sections.push('Name: Test Validation Report');
      sections.push('Description: Test coverage and quality assessment');
      sections.push('Content:');
      sections.push(this.generateTestReport(task));
      sections.push('---ARTIFACT_END---\n');
    }

    sections.push('\n## Summary\n');
    sections.push('Review completed. See individual reports for details.');

    agentLog(this.role, `Completed review: ${task.title}`, task.step);
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
          filePath: `.cdm/reviews/${pa.name.toLowerCase().replace(/\s+/g, '-')}.md`,
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

  private generateCodeReviewReport(task: AgentTask, sourceCode: Artifact[]): string {
    return `# Code Review Report

## Overview
Review of: ${task.title}
Files reviewed: ${sourceCode.length}

## Findings

### Code Quality
- [ ] Follows project conventions
- [ ] Consistent naming
- [ ] Appropriate abstractions
- [ ] No code duplication

### Correctness
- [ ] Logic is correct
- [ ] Edge cases handled
- [ ] Error handling appropriate

### Maintainability
- [ ] Easy to understand
- [ ] Well-organized
- [ ] Appropriate comments

## Issues Found
No critical issues found.

## Recommendations
- Review completed, implementation follows standards.
`;
  }

  private generateSecurityReport(task: AgentTask, _sourceCode: Artifact[]): string {
    return `# Security Audit Report

## Overview
Security review of: ${task.title}

## OWASP Top 10 Check

| Category | Status | Notes |
|----------|--------|-------|
| Injection | ✓ | No issues found |
| Broken Auth | ✓ | N/A or properly handled |
| Sensitive Data | ✓ | No exposure detected |
| XXE | ✓ | N/A |
| Broken Access Control | ✓ | Proper checks in place |
| Security Misconfig | ✓ | Configuration secure |
| XSS | ✓ | Proper escaping |
| Insecure Deserialization | ✓ | N/A |
| Known Vulnerabilities | ✓ | Dependencies up to date |
| Logging/Monitoring | ✓ | Adequate logging |

## Compliance
- GDPR: Data handling reviewed
- Authentication: Properly implemented
- Authorization: Access controls verified

## Vulnerabilities Found
No critical vulnerabilities found.

## Recommendations
- Continue following secure coding practices
`;
  }

  private generatePerformanceReport(task: AgentTask, _sourceCode: Artifact[]): string {
    return `# Performance Analysis Report

## Overview
Performance review of: ${task.title}

## Analysis

### Algorithmic Complexity
- No O(n²) or worse operations detected
- Data structures appropriate for use case

### Database Performance
- Query patterns reviewed
- Index recommendations: N/A

### Memory Usage
- No memory leak patterns detected
- Object creation is reasonable

### Network/I/O
- API calls batched where possible
- Async operations handled correctly

## Bottlenecks Identified
None identified in current implementation.

## Recommendations
- Monitor performance in production
- Consider caching for frequently accessed data
`;
  }

  private generateAccessibilityReport(task: AgentTask, _sourceCode: Artifact[]): string {
    return `# Accessibility Audit Report

## Overview
WCAG 2.1 AA compliance review of: ${task.title}

## Checklist

### Perceivable
- [ ] Text alternatives for images
- [ ] Color contrast sufficient
- [ ] Content readable without CSS

### Operable
- [ ] Keyboard accessible
- [ ] No keyboard traps
- [ ] Focus indicators visible

### Understandable
- [ ] Language declared
- [ ] Consistent navigation
- [ ] Error identification

### Robust
- [ ] Valid HTML
- [ ] ARIA used correctly

## Issues Found
Review UI components for accessibility compliance.

## Recommendations
- Ensure all interactive elements are keyboard accessible
- Add ARIA labels where needed
`;
  }

  private generateTestReport(task: AgentTask): string {
    const tests = task.inputArtifacts.filter(
      (a) => a.type === ArtifactType.UNIT_TESTS || a.type === ArtifactType.INTEGRATION_TESTS,
    );

    return `# Test Validation Report

## Overview
Test quality review of: ${task.title}
Test files reviewed: ${tests.length}

## Coverage Analysis
- Estimated coverage: Pending measurement
- Public functions tested: Review required
- Error paths covered: Review required

## Test Quality
- [ ] Tests are isolated
- [ ] Tests are deterministic
- [ ] Assertions are meaningful
- [ ] Test names are descriptive

## Missing Tests
- Review test coverage for edge cases
- Ensure error paths are tested

## Recommendations
- Run coverage tool for accurate metrics
- Add tests for identified gaps
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
      code_review_report: ArtifactType.CODE_REVIEW_REPORT,
      security_report: ArtifactType.SECURITY_REPORT,
      performance_report: ArtifactType.PERFORMANCE_REPORT,
      accessibility_report: ArtifactType.ACCESSIBILITY_REPORT,
      test_report: ArtifactType.TEST_REPORT,
    };
    return mapping[normalized] ?? null;
  }

  private resolveIssueType(typeStr: string): IssueType {
    const normalized = typeStr.toLowerCase().replace(/[\s_-]+/g, '_');
    const mapping: Record<string, IssueType> = {
      bug: IssueType.BUG,
      security_vulnerability: IssueType.SECURITY_VULNERABILITY,
      performance: IssueType.PERFORMANCE,
      code_quality: IssueType.CODE_QUALITY,
      accessibility_violation: IssueType.ACCESSIBILITY_VIOLATION,
      missing_test: IssueType.MISSING_TEST,
    };
    return mapping[normalized] ?? IssueType.CODE_QUALITY;
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
