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

const DEVELOPER_SYSTEM_PROMPT = `You write production code, tests, and documentation.
You follow existing project conventions exactly. You produce working, tested code.
You think about error handling, edge cases, and maintainability.
You match the style of existing code in the project.`;

export const DEVELOPER_CONFIG: AgentConfig = {
  role: AgentRole.DEVELOPER,
  name: 'developer',
  title: 'Developer',
  description: 'Writes production code, tests, and documentation following project conventions',
  systemPrompt: DEVELOPER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'code_implementation',
      description: 'Writes production-quality code',
      allowedTools: ['Read', 'Write', 'Shell', 'Grep', 'Glob'],
      filePatterns: ['src/**/*', 'lib/**/*'],
    },
    {
      name: 'test_writing',
      description: 'Writes comprehensive tests',
      allowedTools: ['Read', 'Write', 'Shell'],
      filePatterns: ['test/**/*', 'tests/**/*', '**/*.test.*', '**/*.spec.*'],
    },
    {
      name: 'documentation',
      description: 'Writes API and developer documentation',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['docs/**/*', '**/*.md', 'README*'],
    },
  ],
  maxTokenBudget: 100000,
  allowedFilePatterns: ['src/**/*', 'lib/**/*', 'test/**/*', 'tests/**/*', 'docs/**/*'],
  blockedFilePatterns: ['.env', '.env.*', '**/*.secret', '**/credentials*'],
  compatibleSkills: ['code-implementation', 'test-writing', 'documentation'],
  requiredInputArtifacts: [ArtifactType.ARCHITECTURE_DOC],
  outputArtifacts: [
    ArtifactType.SOURCE_CODE,
    ArtifactType.UNIT_TESTS,
    ArtifactType.INTEGRATION_TESTS,
    ArtifactType.API_DOCUMENTATION,
    ArtifactType.DEVELOPER_DOCUMENTATION,
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

export class DeveloperAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(DEVELOPER_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, `Starting work on: ${task.title}`, task.step);

    const sections: string[] = [];
    sections.push('# Development Output\n');

    const architecture = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.ARCHITECTURE_DOC,
    );

    sections.push('## Context\n');
    sections.push(`- Architecture: ${architecture ? 'Available' : 'Not provided'}`);
    sections.push(`- Active Skills: ${task.activeSkills?.join(', ') || 'None'}`);

    if (task.activeSkills?.includes('code-implementation')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: source_code');
      sections.push(`Name: ${this.deriveModuleName(task)}`);
      sections.push(`Description: Implementation of ${task.title}`);
      sections.push(`FilePath: src/${this.deriveFilePath(task)}`);
      sections.push('Content:');
      sections.push(this.generateSourceCode(task));
      sections.push('---ARTIFACT_END---\n');
    }

    if (task.activeSkills?.includes('test-writing')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: unit_tests');
      sections.push(`Name: ${this.deriveModuleName(task)}-tests`);
      sections.push(`Description: Unit tests for ${task.title}`);
      sections.push(`FilePath: tests/${this.deriveTestFilePath(task)}`);
      sections.push('Content:');
      sections.push(this.generateTests(task));
      sections.push('---ARTIFACT_END---\n');
    }

    if (task.activeSkills?.includes('documentation')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: developer_documentation');
      sections.push(`Name: ${this.deriveModuleName(task)}-docs`);
      sections.push(`Description: Developer documentation for ${task.title}`);
      sections.push(`FilePath: docs/${this.deriveModuleName(task)}.md`);
      sections.push('Content:');
      sections.push(this.generateDocumentation(task));
      sections.push('---ARTIFACT_END---\n');
    }

    sections.push('\n## Summary\n');
    sections.push('Implementation completed following project conventions.');

    agentLog(this.role, `Completed work on: ${task.title}`, task.step);
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
          filePath: pa.filePath || this.defaultFilePath(artifactType, task),
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

    if (output.toLowerCase().includes('todo') || output.toLowerCase().includes('fixme')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.CODE_QUALITY,
          IssueSeverity.LOW,
          'Incomplete implementation markers found',
          'Code contains TODO or FIXME markers that should be addressed',
          task.step,
        ),
      );
    }

    return issues;
  }

  private generateSourceCode(task: AgentTask): string {
    const moduleName = this.deriveModuleName(task);
    return `/**
 * ${task.title}
 * 
 * Implementation following project conventions.
 */

// Implementation based on architecture design
// TODO: Replace with actual implementation

export function ${this.toCamelCase(moduleName)}(): void {
  // Implementation here
}
`;
  }

  private generateTests(task: AgentTask): string {
    const moduleName = this.deriveModuleName(task);
    return `import { describe, it, expect, beforeEach } from 'vitest';

describe('${moduleName}', () => {
  beforeEach(() => {
    // Test setup
  });

  it('should handle the primary use case', () => {
    // Arrange
    // Act
    // Assert
    expect(true).toBe(true);
  });

  it('should handle error cases gracefully', () => {
    // Arrange
    // Act
    // Assert
    expect(true).toBe(true);
  });

  it('should handle edge cases', () => {
    // Arrange: empty input, boundary values
    // Act
    // Assert
    expect(true).toBe(true);
  });
});
`;
  }

  private generateDocumentation(task: AgentTask): string {
    const moduleName = this.deriveModuleName(task);
    return `# ${task.title}

## Overview

Description of the feature and its purpose.

## Usage

\`\`\`typescript
import { ${this.toCamelCase(moduleName)} } from './${moduleName}';

// Usage example
${this.toCamelCase(moduleName)}();
\`\`\`

## API Reference

### \`${this.toCamelCase(moduleName)}()\`

Description of the function.

**Parameters:**
- None

**Returns:**
- \`void\`

## Examples

See tests for comprehensive examples.
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

  private deriveModuleName(task: AgentTask): string {
    return task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private deriveFilePath(task: AgentTask): string {
    return `${this.deriveModuleName(task)}.ts`;
  }

  private deriveTestFilePath(task: AgentTask): string {
    return `${this.deriveModuleName(task)}.test.ts`;
  }

  private defaultFilePath(type: ArtifactType, task: AgentTask): string {
    const moduleName = this.deriveModuleName(task);
    const paths: Record<ArtifactType, string> = {
      [ArtifactType.SOURCE_CODE]: `src/${moduleName}.ts`,
      [ArtifactType.UNIT_TESTS]: `tests/${moduleName}.test.ts`,
      [ArtifactType.INTEGRATION_TESTS]: `tests/integration/${moduleName}.test.ts`,
      [ArtifactType.API_DOCUMENTATION]: `docs/api/${moduleName}.md`,
      [ArtifactType.DEVELOPER_DOCUMENTATION]: `docs/${moduleName}.md`,
    } as Record<ArtifactType, string>;
    return paths[type] || `.cdm/artifacts/${moduleName}.md`;
  }

  private toCamelCase(str: string): string {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private resolveArtifactType(typeStr: string): ArtifactType | null {
    const normalized = typeStr.toLowerCase().replace(/[\s_-]+/g, '_');
    const mapping: Record<string, ArtifactType> = {
      source_code: ArtifactType.SOURCE_CODE,
      unit_tests: ArtifactType.UNIT_TESTS,
      integration_tests: ArtifactType.INTEGRATION_TESTS,
      e2e_tests: ArtifactType.E2E_TESTS,
      api_documentation: ArtifactType.API_DOCUMENTATION,
      developer_documentation: ArtifactType.DEVELOPER_DOCUMENTATION,
    };
    return mapping[normalized] ?? null;
  }

  private resolveIssueType(typeStr: string): IssueType {
    const normalized = typeStr.toLowerCase().replace(/[\s_-]+/g, '_');
    const mapping: Record<string, IssueType> = {
      bug: IssueType.BUG,
      code_quality: IssueType.CODE_QUALITY,
      missing_test: IssueType.MISSING_TEST,
      documentation_gap: IssueType.DOCUMENTATION_GAP,
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
