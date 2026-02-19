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

const CODE_REVIEWER_SYSTEM_PROMPT = `Code Reviewer. Rigorous review against quality, correctness, and production-readiness standards.

Check per review: SOLID (SRP/OCP/LSP/ISP/DIP) + DRY/KISS/YAGNI + meaningful naming + small focused functions + minimal side effects. All error paths handled, typed errors, input validation at boundaries, resource cleanup (connections/handles/streams), recoverable vs unrecoverable distinction. O(n²) traps, unbounded queries, missing pagination, blocking on hot paths, cache invalidation issues. Input sanitization, no hardcoded secrets, parameterized queries, auth checks, least privilege. Public API has unit tests, critical paths have integration tests, edge cases tested.
Output: file+line references, category (bug/code-quality/performance/design-flaw), severity (critical/high/medium/low/info), concrete fix suggestion. Acknowledge positive patterns. Summarize overall codebase health.`;

export const codeReviewerConfig: AgentConfig = {
  role: AgentRole.CODE_REVIEWER,
  name: 'code-reviewer',
  title: 'Code Reviewer',
  description:
    'Reviews code for quality, correctness, maintainability, performance, and adherence to best practices. Provides detailed, actionable feedback.',
  systemPrompt: CODE_REVIEWER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'code-review',
      description: 'Performs comprehensive code review against quality standards',
      allowedTools: ['read_file', 'search_files', 'list_directory', 'grep'],
      filePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.go', '**/*.rs'],
    },
    {
      name: 'pattern-analysis',
      description: 'Analyzes code for design pattern usage and anti-patterns',
      allowedTools: ['read_file', 'search_files'],
      filePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    },
    {
      name: 'complexity-analysis',
      description: 'Measures and reports on cyclomatic and cognitive complexity',
      allowedTools: ['read_file', 'search_files', 'grep'],
      filePatterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    },
  ],
  maxTokenBudget: 120000,
  allowedFilePatterns: ['src/**/*', 'lib/**/*', 'tests/**/*', 'package.json', 'tsconfig.json'],
  blockedFilePatterns: ['node_modules/**', '.env*', '*.lock'],
  reportsTo: AgentRole.ENGINEERING_MANAGER,
  directReports: [],
  requiredInputArtifacts: [ArtifactType.SOURCE_CODE, ArtifactType.ARCHITECTURE_DOC, ArtifactType.API_SPEC],
  outputArtifacts: [ArtifactType.CODE_REVIEW_REPORT],
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

class CodeReviewerAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(codeReviewerConfig, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    const prompt = this.buildClaudeCodePrompt(task);

    const sourceArtifacts = task.inputArtifacts.filter((a) => a.type === ArtifactType.SOURCE_CODE);
    const architectureDoc = task.inputArtifacts.find((a) => a.type === ArtifactType.ARCHITECTURE_DOC);
    const apiSpec = task.inputArtifacts.find((a) => a.type === ArtifactType.API_SPEC);

    const reviewSections: string[] = [];
    reviewSections.push('# Code Review Report\n');
    reviewSections.push(`## Review Scope`);
    reviewSections.push(`- Files reviewed: ${sourceArtifacts.length}`);
    reviewSections.push(`- Architecture reference: ${architectureDoc ? 'Available' : 'Not provided'}`);
    reviewSections.push(`- API spec reference: ${apiSpec ? 'Available' : 'Not provided'}\n`);

    for (const source of sourceArtifacts) {
      reviewSections.push(`### File: ${source.filePath}`);
      reviewSections.push(this.reviewSourceFile(source, architectureDoc, apiSpec));
    }

    reviewSections.push('\n## Summary');
    reviewSections.push(this.buildReviewSummary(sourceArtifacts));

    const reviewContent = reviewSections.join('\n');

    const output = [
      reviewContent,
      '',
      '---ARTIFACT_START---',
      `Type: ${ArtifactType.CODE_REVIEW_REPORT}`,
      `Name: Code Review Report - ${task.title}`,
      `Description: Comprehensive code review covering quality, patterns, performance, and security.`,
      'Content:',
      reviewContent,
      '---ARTIFACT_END---',
    ];

    const issues = this.detectIssuesFromSource(sourceArtifacts, task);
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

    for (const raw of parsed.artifacts) {
      const artifactType = this.resolveArtifactType(raw.type);
      artifacts.push(
        this.createArtifact(
          artifactType,
          raw.name,
          raw.description,
          raw.content,
          `reviews/${task.featureId}/code-review-${Date.now()}.md`,
          {
            reviewedFiles: task.inputArtifacts
              .filter((a) => a.type === ArtifactType.SOURCE_CODE)
              .map((a) => a.filePath),
            taskId: task.id,
          },
        ),
      );
    }

    if (artifacts.length === 0) {
      artifacts.push(
        this.createArtifact(
          ArtifactType.CODE_REVIEW_REPORT,
          `Code Review Report - ${task.title}`,
          'Comprehensive code review report generated by the Code Reviewer agent.',
          output,
          `reviews/${task.featureId}/code-review-${Date.now()}.md`,
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
          PipelineStage.CODE_REVIEW,
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
      const type = this.extractField(block, 'Type') || ArtifactType.CODE_REVIEW_REPORT;
      const name = this.extractField(block, 'Name') || 'Unnamed Artifact';
      const description = this.extractField(block, 'Description') || '';
      const content = this.extractContent(block);

      artifacts.push({ type, name, description, content });
    }

    const issueRegex = /---ISSUE_START---\s*([\s\S]*?)---ISSUE_END---/g;

    while ((match = issueRegex.exec(output)) !== null) {
      const block = match[1];
      const type = this.extractField(block, 'Type') || IssueType.CODE_QUALITY;
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
      code_review_report: ArtifactType.CODE_REVIEW_REPORT,
      source_code: ArtifactType.SOURCE_CODE,
    };
    return mapping[normalized] || ArtifactType.CODE_REVIEW_REPORT;
  }

  private resolveIssueType(raw: string): IssueType {
    const normalized = raw.toLowerCase().replace(/[^a-z_]/g, '');
    const mapping: Record<string, IssueType> = {
      bug: IssueType.BUG,
      code_quality: IssueType.CODE_QUALITY,
      performance: IssueType.PERFORMANCE,
      design_flaw: IssueType.DESIGN_FLAW,
      security_vulnerability: IssueType.SECURITY_VULNERABILITY,
      missing_test: IssueType.MISSING_TEST,
      architecture_concern: IssueType.ARCHITECTURE_CONCERN,
      dependency_issue: IssueType.DEPENDENCY_ISSUE,
      documentation_gap: IssueType.DOCUMENTATION_GAP,
    };
    return mapping[normalized] || IssueType.CODE_QUALITY;
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

  private reviewSourceFile(
    source: Artifact,
    architectureDoc: Artifact | undefined,
    apiSpec: Artifact | undefined,
  ): string {
    const findings: string[] = [];
    const content = source.content;
    const lines = content.split('\n');

    findings.push(this.checkNamingConventions(lines, source.filePath));
    findings.push(this.checkErrorHandling(lines, source.filePath));
    findings.push(this.checkComplexity(lines, source.filePath));
    findings.push(this.checkDuplication(lines, source.filePath));
    findings.push(this.checkSecurityPatterns(lines, source.filePath));

    if (architectureDoc) {
      findings.push(this.checkArchitecturalAlignment(content, architectureDoc.content, source.filePath));
    }
    if (apiSpec) {
      findings.push(this.checkApiSpecCompliance(content, apiSpec.content, source.filePath));
    }

    return findings.filter(Boolean).join('\n');
  }

  private checkNamingConventions(lines: string[], filePath: string): string {
    const issues: string[] = [];

    lines.forEach((line, index) => {
      const singleCharVar = /\b(let|const|var)\s+([a-z])\s*[=:]/;
      const match = singleCharVar.exec(line);
      if (match && !line.includes('for (') && !line.includes('for(')) {
        issues.push(`  - Line ${index + 1}: Single-character variable \`${match[2]}\` — use a descriptive name.`);
      }

      if (/\b(let|const|var)\s+[a-z]+[A-Z].*\s*=\s*(class|interface)\b/.test(line)) {
        issues.push(`  - Line ${index + 1}: Class/interface assigned to camelCase variable — use PascalCase.`);
      }
    });

    if (issues.length === 0) return '';
    return `#### Naming Conventions (${filePath})\n${issues.join('\n')}`;
  }

  private checkErrorHandling(lines: string[], filePath: string): string {
    const issues: string[] = [];
    const content = lines.join('\n');

    let catchIndex = content.indexOf('catch');
    while (catchIndex !== -1) {
      const blockStart = content.indexOf('{', catchIndex);
      if (blockStart !== -1) {
        const blockEnd = this.findMatchingBrace(content, blockStart);
        const catchBody = content.substring(blockStart + 1, blockEnd).trim();
        if (catchBody === '' || catchBody === '// empty' || catchBody === '// TODO') {
          const lineNum = content.substring(0, catchIndex).split('\n').length;
          issues.push(`  - Line ${lineNum}: Empty catch block swallows errors silently.`);
        }
      }
      catchIndex = content.indexOf('catch', catchIndex + 1);
    }

    lines.forEach((line, index) => {
      if (/\.then\(/.test(line) && !/\.catch\(/.test(lines.slice(index, index + 5).join('\n'))) {
        if (!/await\s/.test(line)) {
          issues.push(`  - Line ${index + 1}: Promise chain without .catch() — unhandled rejection risk.`);
        }
      }
    });

    if (issues.length === 0) return '';
    return `#### Error Handling (${filePath})\n${issues.join('\n')}`;
  }

  private checkComplexity(lines: string[], filePath: string): string {
    const issues: string[] = [];
    let currentFunctionName = '';
    let branchCount = 0;
    let nestingDepth = 0;
    let maxNesting = 0;
    let inFunction = false;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const funcMatch = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\([^)]*\)\s*\{)/.exec(line);

      if (funcMatch && !inFunction) {
        currentFunctionName = funcMatch[1] || funcMatch[2] || funcMatch[3] || 'anonymous';
        branchCount = 1;
        nestingDepth = 0;
        maxNesting = 0;
        inFunction = true;
        braceCount = 0;
      }

      if (inFunction) {
        const branchKeywords = /\b(if|else if|case|catch|while|for)\b/g;
        let branchMatch;
        while ((branchMatch = branchKeywords.exec(line)) !== null) {
          branchCount++;
        }

        for (const char of line) {
          if (char === '{') { braceCount++; nestingDepth++; maxNesting = Math.max(maxNesting, nestingDepth); }
          if (char === '}') { braceCount--; nestingDepth--; }
        }

        if (braceCount <= 0 && inFunction && i > 0) {
          if (branchCount > 10) {
            issues.push(`  - Line ${i + 1}: Function \`${currentFunctionName}\` has cyclomatic complexity of ${branchCount} (threshold: 10).`);
          }
          if (maxNesting > 4) {
            issues.push(`  - Line ${i + 1}: Function \`${currentFunctionName}\` has nesting depth of ${maxNesting} (threshold: 4).`);
          }
          inFunction = false;
        }
      }

      if (line.length > 120) {
        issues.push(`  - Line ${i + 1}: Line exceeds 120 characters (${line.length} chars).`);
      }
    }

    if (lines.length > 300) {
      issues.push(`  - File has ${lines.length} lines — consider splitting into smaller modules.`);
    }

    if (issues.length === 0) return '';
    return `#### Complexity Analysis (${filePath})\n${issues.join('\n')}`;
  }

  private checkDuplication(lines: string[], filePath: string): string {
    const issues: string[] = [];
    const blockSize = 4;
    const seen = new Map<string, number>();

    for (let i = 0; i <= lines.length - blockSize; i++) {
      const block = lines
        .slice(i, i + blockSize)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('*'))
        .join('|');

      if (block.split('|').length < 3) continue;

      if (seen.has(block)) {
        issues.push(
          `  - Lines ${seen.get(block)!}-${seen.get(block)! + blockSize} and ${i + 1}-${i + blockSize}: Duplicated code block — extract into a shared function.`,
        );
      } else {
        seen.set(block, i + 1);
      }
    }

    if (issues.length === 0) return '';
    return `#### Code Duplication (${filePath})\n${issues.join('\n')}`;
  }

  private checkSecurityPatterns(lines: string[], filePath: string): string {
    const issues: string[] = [];

    lines.forEach((line, index) => {
      if (/\beval\s*\(/.test(line)) {
        issues.push(`  - Line ${index + 1}: Usage of \`eval()\` — severe code injection risk.`);
      }

      if (/innerHTML\s*=/.test(line) && !/sanitize|escape|DOMPurify/i.test(line)) {
        issues.push(`  - Line ${index + 1}: Direct \`innerHTML\` assignment without sanitization — XSS risk.`);
      }

      if (/(password|secret|api_key|apikey|token)\s*[:=]\s*['"][^'"]+['"]/i.test(line)) {
        issues.push(`  - Line ${index + 1}: Potential hardcoded secret — move to environment variables.`);
      }

      if (/\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b/i.test(line) ||
          /(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b.*\$\{.*\}/i.test(line)) {
        issues.push(`  - Line ${index + 1}: Possible SQL injection via template literal — use parameterized queries.`);
      }
    });

    if (issues.length === 0) return '';
    return `#### Security Concerns (${filePath})\n${issues.join('\n')}`;
  }

  private checkArchitecturalAlignment(
    sourceContent: string,
    architectureContent: string,
    filePath: string,
  ): string {
    const issues: string[] = [];

    if (architectureContent.includes('layered architecture') || architectureContent.includes('clean architecture')) {
      if (/import.*from\s+['"].*database/.test(sourceContent) && /controller|handler|route/i.test(filePath)) {
        issues.push('  - Controller/handler directly imports database layer — violates layered architecture.');
      }
    }

    if (issues.length === 0) return '';
    return `#### Architectural Alignment (${filePath})\n${issues.join('\n')}`;
  }

  private checkApiSpecCompliance(sourceContent: string, apiSpecContent: string, filePath: string): string {
    const issues: string[] = [];

    if (/route|controller|handler|endpoint/i.test(filePath)) {
      if (!/validate|schema|zod|joi|yup|class-validator/i.test(sourceContent)) {
        issues.push('  - API handler does not appear to validate request input against a schema.');
      }
    }

    if (issues.length === 0) return '';
    return `#### API Spec Compliance (${filePath})\n${issues.join('\n')}`;
  }

  private buildReviewSummary(sourceArtifacts: Artifact[]): string {
    return [
      `Reviewed ${sourceArtifacts.length} source file(s).`,
      'All findings have been categorized by type and severity.',
      'Please address CRITICAL and HIGH severity issues before merging.',
      'MEDIUM and LOW issues should be tracked for follow-up.',
    ].join('\n');
  }

  private detectIssuesFromSource(
    sourceArtifacts: Artifact[],
    task: AgentTask,
  ): ParsedIssue[] {
    const issues: ParsedIssue[] = [];

    for (const source of sourceArtifacts) {
      const lines = source.content.split('\n');

      const hasTryCatch = lines.some((l) => /\bcatch\b/.test(l));
      const hasThrow = lines.some((l) => /\bthrow\b/.test(l));
      if (!hasTryCatch && !hasThrow && lines.length > 50) {
        issues.push({
          type: IssueType.CODE_QUALITY,
          severity: IssueSeverity.MEDIUM,
          title: `No error handling in ${source.filePath}`,
          description: `File ${source.filePath} (${lines.length} lines) contains no try/catch or throw statements. All non-trivial modules should handle error cases explicitly.`,
        });
      }

      const todoCount = lines.filter((l) => /\/\/\s*TODO|\/\/\s*FIXME|\/\/\s*HACK/i.test(l)).length;
      if (todoCount > 3) {
        issues.push({
          type: IssueType.CODE_QUALITY,
          severity: IssueSeverity.LOW,
          title: `Excessive TODO/FIXME comments in ${source.filePath}`,
          description: `Found ${todoCount} TODO/FIXME/HACK comments in ${source.filePath}. These indicate incomplete work that should be tracked as issues.`,
        });
      }

      if (lines.some((l) => /\bconsole\.(log|debug|info)\b/.test(l))) {
        issues.push({
          type: IssueType.CODE_QUALITY,
          severity: IssueSeverity.LOW,
          title: `Console logging in ${source.filePath}`,
          description: `Production code in ${source.filePath} contains console.log/debug/info statements. Use a structured logger instead.`,
        });
      }

      if (lines.some((l) => /\bany\b/.test(l) && /(:\s*any|as\s+any|<any>)/.test(l))) {
        issues.push({
          type: IssueType.CODE_QUALITY,
          severity: IssueSeverity.MEDIUM,
          title: `Usage of \`any\` type in ${source.filePath}`,
          description: `TypeScript \`any\` type detected in ${source.filePath}. This bypasses type checking and should be replaced with proper types.`,
        });
      }
    }

    return issues;
  }

  private findMatchingBrace(content: string, openIndex: number): number {
    let depth = 0;
    for (let i = openIndex; i < content.length; i++) {
      if (content[i] === '{') depth++;
      if (content[i] === '}') { depth--; if (depth === 0) return i; }
    }
    return content.length;
  }
}

export default CodeReviewerAgent;
