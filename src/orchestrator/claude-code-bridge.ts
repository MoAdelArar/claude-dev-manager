/**
 * ClaudeCodeBridge - Thin wrapper for invoking Claude CLI.
 * Refactored for dynamic persona system - no more AgentRegistry.
 */

import { spawn, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type Artifact,
  ArtifactType,
  ArtifactStatus,
  ReviewStatus,
  type Issue,
  IssueType,
  IssueSeverity,
  IssueStatus,
} from '../types.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { isRtkInstalled } from '../utils/rtk.js';

export type ExecutionMode = 'claude-cli' | 'simulation';

export interface ClaudeCodeOptions {
  model?: string;
  maxTokens?: number;
  timeout?: number;
  verbose?: boolean;
  projectPath: string;
  executionMode?: ExecutionMode;
  claudePath?: string;
}

export interface ExecutePromptOptions {
  featureId: string;
  personaId: string;
  step?: string;
  allowedTools?: string[];
}

export class ClaudeCodeBridge {
  private options: ClaudeCodeOptions;
  private executionMode: ExecutionMode;
  private claudeAvailable: boolean | null = null;
  private nestedSessionWarned = false;

  constructor(options: ClaudeCodeOptions) {
    this.options = options;
    this.executionMode = options.executionMode ?? 'claude-cli';
  }

  getExecutionMode(): ExecutionMode {
    return this.resolveExecutionMode();
  }

  isNestedClaudeSession(): boolean {
    return !!(process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT);
  }

  isClaudeAvailable(): boolean {
    if (this.claudeAvailable !== null) return this.claudeAvailable;

    try {
      const claudeBin = this.options.claudePath ?? 'claude';
      execSync(`${claudeBin} --version`, { stdio: 'pipe', timeout: 5000 });
      this.claudeAvailable = true;
    } catch {
      this.claudeAvailable = false;
    }
    return this.claudeAvailable;
  }

  async executePrompt(
    prompt: string,
    options: ExecutePromptOptions,
  ): Promise<{ output: string; tokensUsed: number; durationMs: number }> {
    const startTime = Date.now();

    this.writePromptFile(options.personaId, options.featureId, prompt);

    const mode = this.resolveExecutionMode();

    if (mode === 'simulation') {
      return {
        output: this.generateSimulationOutput(options),
        tokensUsed: this.estimateTokens(prompt),
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const output = await this.invokeClaudeCLI(prompt, options);
      return {
        output,
        tokensUsed: this.estimateTokens(prompt + output),
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Claude CLI failed: ${errorMessage}`);
      throw error;
    }
  }

  async executePromptStreaming(
    prompt: string,
    options: ExecutePromptOptions,
    onChunk: (chunk: string) => void,
  ): Promise<{ output: string; tokensUsed: number; durationMs: number }> {
    const startTime = Date.now();
    this.writePromptFile(options.personaId, options.featureId, prompt);
    const mode = this.resolveExecutionMode();

    if (mode === 'simulation') {
      const output = this.generateSimulationOutput(options);
      onChunk(output);
      return {
        output,
        tokensUsed: this.estimateTokens(prompt),
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const output = await this.invokeClaudeCLIStreaming(prompt, options, onChunk);
      return {
        output,
        tokensUsed: this.estimateTokens(prompt + output),
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Claude CLI streaming failed: ${errorMessage}`);
      throw error;
    }
  }

  private async invokeClaudeCLIStreaming(
    prompt: string,
    options: ExecutePromptOptions,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    const claudeBin = this.options.claudePath ?? 'claude';
    const timeoutMs = (this.options.timeout ?? 600) * 1000;

    logger.info(`Invoking Claude CLI (streaming) for persona ${options.personaId}`);

    const args = ['--print'];
    if (this.options.model) args.push('--model', this.options.model);
    if (this.options.maxTokens) args.push('--max-tokens', String(this.options.maxTokens));
    if (options.allowedTools?.length) args.push('--allowedTools', options.allowedTools.join(','));

    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    if (this.isNestedClaudeSession()) {
      delete childEnv.CLAUDECODE;
      delete childEnv.CLAUDE_CODE_ENTRYPOINT;
      delete childEnv.CLAUDE_CODE_SSE_PORT;
    }
    childEnv.CDM_PERSONA_ID = options.personaId;
    childEnv.CDM_FEATURE_ID = options.featureId;
    if (options.step) childEnv.CDM_EXECUTION_STEP = options.step;

    return new Promise<string>((resolve, reject) => {
      const proc = spawn(claudeBin, args, {
        cwd: this.options.projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
        timeout: timeoutMs,
        env: childEnv,
      });

      proc.stdin.write(prompt, 'utf-8');
      proc.stdin.end();

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        onChunk(chunk);
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to launch Claude CLI: ${err.message}`));
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 500) || 'no stderr'}`));
        }
      });
    });
  }

  resolveExecutionMode(): ExecutionMode {
    if (this.executionMode === 'simulation') return 'simulation';
    return this.isClaudeAvailable() ? 'claude-cli' : 'simulation';
  }

  private async invokeClaudeCLI(
    prompt: string,
    options: ExecutePromptOptions,
  ): Promise<string> {
    const claudeBin = this.options.claudePath ?? 'claude';
    const timeoutMs = (this.options.timeout ?? 600) * 1000;

    logger.info(`Invoking Claude CLI for persona ${options.personaId}`);

    const args = ['--print'];

    if (this.options.model) {
      args.push('--model', this.options.model);
    }

    if (this.options.maxTokens) {
      args.push('--max-tokens', String(this.options.maxTokens));
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', options.allowedTools.join(','));
    }

    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    if (this.isNestedClaudeSession()) {
      if (!this.nestedSessionWarned) {
        logger.info('Detected parent Claude session — stripping session markers');
        this.nestedSessionWarned = true;
      }
      delete childEnv.CLAUDECODE;
      delete childEnv.CLAUDE_CODE_ENTRYPOINT;
      delete childEnv.CLAUDE_CODE_SSE_PORT;
    }

    childEnv.CDM_PERSONA_ID = options.personaId;
    childEnv.CDM_FEATURE_ID = options.featureId;
    if (options.step) {
      childEnv.CDM_EXECUTION_STEP = options.step;
    }

    return new Promise<string>((resolve, reject) => {
      const proc = spawn(claudeBin, args, {
        cwd: this.options.projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
        timeout: timeoutMs,
        env: childEnv,
      });

      proc.stdin.write(prompt, 'utf-8');
      proc.stdin.end();

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to launch Claude CLI: ${err.message}`));
      });

      proc.on('close', (code) => {
        if (code === 0) {
          logger.info(`Claude CLI completed (${stdout.length} chars output)`);
          resolve(stdout);
        } else {
          const truncatedErr = stderr.slice(0, 500);
          reject(
            new Error(
              `Claude CLI exited with code ${code}: ${truncatedErr || 'no stderr'}`,
            ),
          );
        }
      });
    });
  }

  private generateSimulationOutput(options: ExecutePromptOptions): string {
    logger.info(`Running in simulation mode for persona ${options.personaId}`);

    return `---ARTIFACT_START---
Type: source_code
Name: Simulated Output
Description: Simulation mode output for ${options.personaId}
Content:
// Simulated implementation
// Claude CLI is not available - running in simulation mode
// Feature: ${options.featureId}
// Persona: ${options.personaId}

console.log('Simulated output');
---ARTIFACT_END---`;
  }

  parseArtifacts(
    output: string,
    featureId: string,
    personaId: string,
  ): Artifact[] {
    const artifacts: Artifact[] = [];

    const patterns = [
      /---ARTIFACT_START---([\s\S]*?)---ARTIFACT_END---/g,
      /ARTIFACT_START\n([\s\S]*?)ARTIFACT_END/g,
      /```\nARTIFACT_START\n([\s\S]*?)\nARTIFACT_END\n```/g,
    ];

    for (const regex of patterns) {
      let match: RegExpExecArray | null;

      while ((match = regex.exec(output)) !== null) {
        const block = match[1].trim();
        const artifact = this.parseArtifactBlock(block, featureId, personaId);
        if (artifact) {
          artifacts.push(artifact);
        }
      }
    }

    return artifacts;
  }

  private parseArtifactBlock(
    block: string,
    featureId: string,
    personaId: string,
  ): Artifact | null {
    const typeMatch = block.match(/^[Tt]ype:\s*(.+)$/m);
    const nameMatch = block.match(/^[Nn]ame:\s*(.+)$/m);
    const descMatch = block.match(/^[Dd]escription:\s*(.+)$/m);
    const fileMatch = block.match(/^[Ff]ile:\s*(.+)$/m);

    const contentPatterns = [
      /^---\n([\s\S]*)$/m,
      /[Cc]ontent:\s*([\s\S]*)$/m,
    ];

    let contentMatch: RegExpMatchArray | null = null;
    for (const pattern of contentPatterns) {
      contentMatch = block.match(pattern);
      if (contentMatch) break;
    }

    if (!typeMatch || !nameMatch) {
      return null;
    }

    const artifactType = this.resolveArtifactType(typeMatch[1].trim());
    if (!artifactType) {
      return null;
    }

    const name = nameMatch[1].trim();
    const filePath =
      fileMatch?.[1]?.trim() ||
      `.cdm/artifacts/${name.toLowerCase().replace(/\s+/g, '-')}.md`;

    return {
      id: uuidv4(),
      type: artifactType,
      name,
      description: descMatch?.[1]?.trim() ?? '',
      filePath,
      createdBy: personaId,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      content: contentMatch?.[1]?.trim() ?? '',
      metadata: {
        featureId,
        personaId,
      },
      status: ArtifactStatus.DRAFT,
      reviewStatus: ReviewStatus.PENDING,
    };
  }

  parseIssues(
    output: string,
    featureId: string,
    personaId: string,
  ): Issue[] {
    const issues: Issue[] = [];

    const patterns = [
      /---ISSUE_START---([\s\S]*?)---ISSUE_END---/g,
      /ISSUE_START\n([\s\S]*?)\nISSUE_END/g,
      /```\nISSUE_START\n([\s\S]*?)\nISSUE_END\n```/g,
    ];

    for (const regex of patterns) {
      let match: RegExpExecArray | null;

      while ((match = regex.exec(output)) !== null) {
        const block = match[1].trim();
        const issue = this.parseIssueBlock(block, featureId, personaId);
        if (issue) {
          issues.push(issue);
        }
      }
    }

    return issues;
  }

  private parseIssueBlock(
    block: string,
    featureId: string,
    personaId: string,
  ): Issue | null {
    const typeMatch = block.match(/^[Tt]ype:\s*(.+)$/m);
    const sevMatch = block.match(/^[Ss]everity:\s*(.+)$/m);
    const titleMatch = block.match(/^[Tt]itle:\s*(.+)$/m);

    const descPatterns = [
      /^---\n([\s\S]*)$/m,
      /[Dd]escription:\s*([\s\S]*)$/m,
    ];

    let descMatch: RegExpMatchArray | null = null;
    for (const pattern of descPatterns) {
      descMatch = block.match(pattern);
      if (descMatch) break;
    }

    if (!typeMatch || !titleMatch) {
      return null;
    }

    return {
      id: uuidv4(),
      featureId,
      type: this.resolveIssueType(typeMatch[1].trim()),
      severity: this.resolveIssueSeverity(sevMatch?.[1]?.trim() ?? 'medium'),
      title: titleMatch[1].trim(),
      description: descMatch?.[1]?.trim() ?? '',
      reportedBy: personaId,
      step: 'execution',
      status: IssueStatus.OPEN,
      createdAt: new Date(),
    };
  }

  private resolveArtifactType(typeStr: string): ArtifactType | null {
    const normalized = typeStr.toLowerCase().replace(/[\s_-]+/g, '_');
    const mapping: Record<string, ArtifactType> = {
      requirements_doc: ArtifactType.REQUIREMENTS_DOC,
      requirements_document: ArtifactType.REQUIREMENTS_DOC,
      requirements: ArtifactType.REQUIREMENTS_DOC,
      user_stories: ArtifactType.USER_STORIES,
      user_story: ArtifactType.USER_STORIES,
      acceptance_criteria: ArtifactType.ACCEPTANCE_CRITERIA,
      execution_plan: ArtifactType.EXECUTION_PLAN,
      task_list: ArtifactType.TASK_LIST,
      architecture_doc: ArtifactType.ARCHITECTURE_DOC,
      architecture_document: ArtifactType.ARCHITECTURE_DOC,
      architecture: ArtifactType.ARCHITECTURE_DOC,
      system_diagram: ArtifactType.SYSTEM_DIAGRAM,
      api_spec: ArtifactType.API_SPEC,
      api_specification: ArtifactType.API_SPEC,
      data_model: ArtifactType.DATA_MODEL,
      database_schema: ArtifactType.DATABASE_SCHEMA,
      schema: ArtifactType.DATABASE_SCHEMA,
      ui_spec: ArtifactType.UI_SPEC,
      wireframe: ArtifactType.WIREFRAME,
      component_spec: ArtifactType.COMPONENT_SPEC,
      source_code: ArtifactType.SOURCE_CODE,
      code: ArtifactType.SOURCE_CODE,
      unit_tests: ArtifactType.UNIT_TESTS,
      integration_tests: ArtifactType.INTEGRATION_TESTS,
      e2e_tests: ArtifactType.E2E_TESTS,
      test_report: ArtifactType.TEST_REPORT,
      code_review_report: ArtifactType.CODE_REVIEW_REPORT,
      code_review: ArtifactType.CODE_REVIEW_REPORT,
      security_report: ArtifactType.SECURITY_REPORT,
      performance_report: ArtifactType.PERFORMANCE_REPORT,
      accessibility_report: ArtifactType.ACCESSIBILITY_REPORT,
      deployment_plan: ArtifactType.DEPLOYMENT_PLAN,
      infrastructure_config: ArtifactType.INFRASTRUCTURE_CONFIG,
      ci_cd_config: ArtifactType.CI_CD_CONFIG,
      api_documentation: ArtifactType.API_DOCUMENTATION,
      developer_documentation: ArtifactType.DEVELOPER_DOCUMENTATION,
      user_documentation: ArtifactType.USER_DOCUMENTATION,
      changelog: ArtifactType.CHANGELOG,
      monitoring_config: ArtifactType.MONITORING_CONFIG,
      monitoring: ArtifactType.MONITORING_CONFIG,
      runbook: ArtifactType.RUNBOOK,
    };
    return mapping[normalized] ?? null;
  }

  private resolveIssueType(typeStr: string): IssueType {
    const normalized = typeStr.toLowerCase().replace(/[\s_-]+/g, '_');
    const mapping: Record<string, IssueType> = {
      bug: IssueType.BUG,
      design_flaw: IssueType.DESIGN_FLAW,
      security_vulnerability: IssueType.SECURITY_VULNERABILITY,
      security: IssueType.SECURITY_VULNERABILITY,
      performance: IssueType.PERFORMANCE,
      code_quality: IssueType.CODE_QUALITY,
      missing_test: IssueType.MISSING_TEST,
      documentation_gap: IssueType.DOCUMENTATION_GAP,
      dependency_issue: IssueType.DEPENDENCY_ISSUE,
      architecture_concern: IssueType.ARCHITECTURE_CONCERN,
      scalability: IssueType.SCALABILITY,
      observability: IssueType.OBSERVABILITY,
      cost_optimization: IssueType.COST_OPTIMIZATION,
      reliability: IssueType.RELIABILITY,
      compliance_violation: IssueType.COMPLIANCE_VIOLATION,
      compliance: IssueType.COMPLIANCE_VIOLATION,
      accessibility_violation: IssueType.ACCESSIBILITY_VIOLATION,
      accessibility: IssueType.ACCESSIBILITY_VIOLATION,
      data_privacy_concern: IssueType.DATA_PRIVACY_CONCERN,
      data_privacy: IssueType.DATA_PRIVACY_CONCERN,
    };
    return mapping[normalized] ?? IssueType.BUG;
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

  writePromptFile(personaId: string, featureId: string, prompt: string): void {
    const dir = path.join(this.options.projectPath, '.cdm', 'prompts', personaId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(dir, `${featureId}-${timestamp}.md`), prompt, 'utf-8');
  }

  generateMainClaudeMd(): string {
    const s: string[] = [];

    s.push('# Claude Dev Manager — Project Instructions\n');
    s.push('This project is managed by CDM, a dynamic persona-based development system.');
    s.push('All CDM data lives in the `.cdm/` folder. Read these files before modifying the codebase.\n');

    s.push('## `.cdm/` Folder Structure\n');
    s.push('```');
    s.push('.cdm/');
    s.push('├── project.json              # Project metadata, detected language/framework/cloud/CI');
    s.push('├── analysis/                 # Project analysis — split by entity (read what you need)');
    s.push('│   ├── overview.md           # Stack, dependencies, patterns, entry points');
    s.push('│   ├── structure.md          # Project file tree');
    s.push('│   ├── codestyle.md          # Naming, formatting, imports, code samples');
    s.push('│   └── <entity>.md           # One file per source directory');
    s.push('├── personas/                 # Dynamic persona system');
    s.push('│   ├── catalog-index.json    # Indexed personas from agency-agents repo');
    s.push('│   └── source/               # Cloned persona definitions (gitignored)');
    s.push('├── features/                 # Feature state files (one JSON per feature)');
    s.push('├── artifacts/                # Produced artifacts from executions');
    s.push('└── prompts/                  # Saved prompts by persona');
    s.push('```\n');

    if (isRtkInstalled()) {
      s.push('## Token Optimization\n');
      s.push('RTK is configured to compress CLI command outputs (git, ls, grep, test runners).');
      s.push('The PreToolUse hook rewrites Bash commands automatically. No manual action needed.');
      s.push('Prefer concise output flags when running commands (e.g. `--oneline`, `-1`).\n');
    }

    s.push('### Key files to read BEFORE making changes:\n');
    s.push('1. **`.cdm/analysis/overview.md`** — Project stack, dependencies, architecture, and design patterns');
    s.push('2. **`.cdm/analysis/codestyle.md`** — Follow the existing naming, formatting, and import conventions');
    s.push('3. **`.cdm/analysis/<entity>.md`** — Understand specific modules before modifying them');
    s.push('4. **`.cdm/project.json`** — Project language, framework, build tool, cloud provider, CI/CD\n');

    s.push('## Dynamic Persona System\n');
    s.push('CDM dynamically selects specialized personas from the agency-agents catalog based on:');
    s.push('- Task description and detected signals (frameworks, domains, actions, risks)');
    s.push('- Project context (language, framework, conventions)');
    s.push('- Configured overrides\n');
    s.push('Use `cdm personas list` to see available personas.');
    s.push('Use `cdm personas resolve "description"` to preview persona selection.\n');

    s.push('## Artifact Format\n');
    s.push('```');
    s.push('ARTIFACT_START');
    s.push('type: <artifact_type>');
    s.push('name: <artifact_name>');
    s.push('file: <file_path>');
    s.push('---');
    s.push('<content>');
    s.push('ARTIFACT_END');
    s.push('```\n');

    s.push('## Issue Format\n');
    s.push('```');
    s.push('ISSUE_START');
    s.push('type: <issue_type>');
    s.push('severity: <critical|high|medium|low|info>');
    s.push('title: <title>');
    s.push('---');
    s.push('<description>');
    s.push('ISSUE_END');
    s.push('```');

    return s.join('\n');
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
