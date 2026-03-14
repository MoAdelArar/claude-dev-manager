import { spawn, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type AgentRole,
  AgentRole as AR,
  type AgentTask,
  type AgentResult,
  type Artifact,
  type AgentConfig,
  ArtifactType,
  ArtifactStatus,
  ReviewStatus,
  type Issue,
  IssueType,
  IssueSeverity,
} from '../types';
import { type AgentRegistry } from '../agents/index';
import { type ArtifactStore } from '../workspace/artifact-store';
import logger from '../utils/logger';
import { agentLog } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { isRtkInstalled } from '../utils/rtk';

export type ExecutionMode = 'claude-cli' | 'simulation';

export interface ProjectSnapshot {
  projectName: string;
  language: string;
  framework: string;
  testFramework: string;
  buildTool: string;
  ciProvider: string;
  deployTarget: string;
  cloudProvider: string;
  naming: {
    files: string;
    directories: string;
    variables: string;
    functions: string;
    classes: string;
    testFiles: string;
  };
  formatting: {
    indentation: string;
    quotes: string;
    semicolons: boolean;
  };
  imports: {
    moduleSystem: string;
    pathStyle: string;
    nodeProtocol: boolean;
  };
  architecturePattern: string;
  architectureLayers: string[];
  entryPoints: string[];
  topDirs: string[];
  keyDeps: string[];
  patterns: string[];
  testDirs: string[];
  apiStyle: string;
}

export interface ClaudeCodeOptions {
  model?: string;
  maxTokens?: number;
  timeout?: number;
  verbose?: boolean;
  projectPath: string;
  executionMode?: ExecutionMode;
  claudePath?: string;
}

export class ClaudeCodeBridge {
  private agentRegistry: AgentRegistry;
  private artifactStore: ArtifactStore;
  private options: ClaudeCodeOptions;
  private executionMode: ExecutionMode;
  private claudeAvailable: boolean | null = null;
  private nestedSessionWarned = false;

  constructor(
    agentRegistry: AgentRegistry,
    artifactStore: ArtifactStore,
    options: ClaudeCodeOptions,
  ) {
    this.agentRegistry = agentRegistry;
    this.artifactStore = artifactStore;
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

  async executeAgentTask(task: AgentTask): Promise<AgentResult> {
    const agent = this.agentRegistry.getAgent(task.assignedTo, task.activeSkills);
    const startTime = Date.now();

    agentLog(task.assignedTo, `Preparing task: ${task.title}`, task.step);

    const prompt = agent.buildClaudeCodePrompt(task);
    this.writePromptFile(task.assignedTo, task.id, prompt);

    try {
      const output = await this.invokeClaudeCode(prompt, task);

      const artifacts = this.parseArtifacts(output, task);
      const issues = this.parseIssues(output, task);

      for (const artifact of artifacts) {
        this.artifactStore.store(artifact);
      }

      return {
        agentRole: task.assignedTo,
        skills: task.activeSkills,
        status: 'success',
        output,
        artifacts,
        issues,
        tokensUsed: this.estimateTokens(prompt + output),
        durationMs: Date.now() - startTime,
        metadata: {
          taskId: task.id,
          executionMode: this.resolveExecutionMode(),
          skills: task.activeSkills,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      agentLog(task.assignedTo, `Task failed: ${errorMessage}`, task.step, 'error');

      return {
        agentRole: task.assignedTo,
        skills: task.activeSkills,
        status: 'failure',
        output: errorMessage,
        artifacts: [],
        issues: [],
        tokensUsed: this.estimateTokens(prompt),
        durationMs: Date.now() - startTime,
        metadata: { taskId: task.id, error: errorMessage, skills: task.activeSkills },
      };
    }
  }

  generateSubagentPrompt(task: AgentTask): string {
    const agent = this.agentRegistry.getAgent(task.assignedTo, task.activeSkills);
    return agent.buildClaudeCodePrompt(task);
  }

  writeAgentInstructionFiles(snapshot?: ProjectSnapshot): void {
    const configs = this.agentRegistry.getAllConfigs();
    const agentsDir = path.join(this.options.projectPath, '.cdm', 'agents');

    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }

    for (const config of configs) {
      const content = this.buildAgentInstructionFile(config, snapshot);
      const filePath = path.join(agentsDir, `${config.name}.md`);
      fs.writeFileSync(filePath, content, 'utf-8');
    }

    logger.info(`Generated ${configs.length} agent instruction files in .cdm/agents/`);
  }

  generateMainClaudeMd(): string {
    const s: string[] = [];

    s.push('# Claude Dev Manager — Project Instructions\n');
    s.push('This project is managed by CDM, a multi-agent development system.');
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
    s.push('├── agents/                   # Agent role definitions and system prompts');
    s.push('│   ├── planner.md');
    s.push('│   ├── architect.md');
    s.push('│   ├── developer.md');
    s.push('│   ├── reviewer.md');
    s.push('│   └── operator.md');
    s.push('├── features/                 # Feature state files (one JSON per feature)');
    s.push('└── artifacts/                # Produced artifacts from pipeline steps');
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

    s.push('## Agent Team (5 Agents + Skills)\n');
    s.push('```');
    s.push('Planner       → requirements-analysis, task-decomposition');
    s.push('Architect     → system-design, api-design, data-modeling, ui-design');
    s.push('Developer     → code-implementation, test-writing, documentation');
    s.push('Reviewer      → code-review, security-audit, performance-analysis, accessibility-audit, test-validation');
    s.push('Operator      → ci-cd, deployment, monitoring');
    s.push('```\n');

    s.push('Agent definitions are in `.cdm/agents/`. Each file contains the agent\'s role, system prompt, capabilities, and compatible skills.\n');

    s.push('## Pipeline Templates\n');
    s.push('- **quick-fix**: Developer → Reviewer (for bugs, typos, small fixes)');
    s.push('- **feature**: Planner → Architect → Developer → Reviewer');
    s.push('- **full-feature**: feature + Security + Operator');
    s.push('- **review-only**: Reviewer (multi-skill audit)');
    s.push('- **design-only**: Planner → Architect');
    s.push('- **deploy**: Operator\n');

    s.push('## Artifact Format\n');
    s.push('```');
    s.push('---ARTIFACT_START---');
    s.push('Type: <artifact_type>');
    s.push('Name: <artifact_name>');
    s.push('Description: <description>');
    s.push('Content:');
    s.push('<content>');
    s.push('---ARTIFACT_END---');
    s.push('```\n');

    s.push('## Issue Format\n');
    s.push('```');
    s.push('---ISSUE_START---');
    s.push('Type: <issue_type>');
    s.push('Severity: <critical|high|medium|low|info>');
    s.push('Title: <title>');
    s.push('Description: <description>');
    s.push('---ISSUE_END---');
    s.push('```');

    return s.join('\n');
  }

  private resolveExecutionMode(): ExecutionMode {
    if (this.executionMode === 'simulation') return 'simulation';
    return this.isClaudeAvailable() ? 'claude-cli' : 'simulation';
  }

  private async invokeClaudeCode(prompt: string, task: AgentTask): Promise<string> {
    const mode = this.resolveExecutionMode();

    if (mode === 'claude-cli') {
      return this.invokeClaudeCLI(prompt, task);
    }

    return this.invokeSimulation(task);
  }

  private async invokeClaudeCLI(prompt: string, task: AgentTask): Promise<string> {
    const claudeBin = this.options.claudePath ?? 'claude';
    const timeoutMs = (this.options.timeout ?? 600) * 1000;

    agentLog(task.assignedTo, `Invoking Claude Code CLI [${task.title}]`, task.step);

    const args = ['--print'];

    if (this.options.model) {
      args.push('--model', this.options.model);
    }

    if (this.options.maxTokens) {
      args.push('--max-tokens', String(this.options.maxTokens));
    }

    const agentConfig = this.agentRegistry.getConfig(task.assignedTo);
    const allowedTools = agentConfig.capabilities.flatMap((c) => c.allowedTools);
    if (allowedTools.length > 0) {
      args.push('--allowedTools', allowedTools.join(','));
    }

    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    if (this.isNestedClaudeSession()) {
      if (!this.nestedSessionWarned) {
        agentLog(
          task.assignedTo,
          'Detected parent Claude Code session — stripping session markers so agents run as fresh instances',
          task.step,
        );
        this.nestedSessionWarned = true;
      }
      delete childEnv.CLAUDECODE;
      delete childEnv.CLAUDE_CODE_ENTRYPOINT;
      delete childEnv.CLAUDE_CODE_SSE_PORT;
    }

    childEnv.CDM_AGENT_ROLE = task.assignedTo;
    childEnv.CDM_PIPELINE_STEP = task.step;
    childEnv.CDM_FEATURE_ID = task.featureId;
    if (task.activeSkills && task.activeSkills.length > 0) {
      childEnv.CDM_ACTIVE_SKILLS = task.activeSkills.join(',');
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
          agentLog(
            task.assignedTo,
            `Claude CLI completed (${stdout.length} chars output)`,
            task.step,
          );
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

  private async invokeSimulation(task: AgentTask): Promise<string> {
    agentLog(task.assignedTo, 'Running in simulation mode (Claude CLI not available)', task.step);

    const agent = this.agentRegistry.getAgent(task.assignedTo, task.activeSkills);
    const result = await agent.execute(task);
    return result.output;
  }

  private buildAgentInstructionFile(
    config: AgentConfig,
    snapshot?: ProjectSnapshot,
  ): string {
    const sections: string[] = [];

    sections.push(`# ${config.title}\n`);
    sections.push(`**Role:** ${config.role}`);
    sections.push(`**Compatible Skills:** ${config.compatibleSkills?.join(', ') || 'None'}\n`);
    sections.push(`## Description\n${config.description}\n`);
    sections.push(`## System Prompt\n${config.systemPrompt}\n`);

    if (snapshot) {
      sections.push(this.buildProjectContextSection(config.role, snapshot));
    }

    sections.push('## Capabilities\n');
    for (const cap of config.capabilities) {
      const patterns = snapshot
        ? this.tailorFilePatterns(cap.filePatterns, snapshot.language)
        : cap.filePatterns;
      sections.push(`### ${cap.name}`);
      sections.push(cap.description);
      sections.push(`- Tools: ${cap.allowedTools.join(', ')}`);
      sections.push(`- File patterns: ${patterns.join(', ')}\n`);
    }

    sections.push('## Input Artifacts\n');
    sections.push(config.requiredInputArtifacts.join(', ') || 'None required\n');

    sections.push('\n## Output Artifacts\n');
    sections.push(config.outputArtifacts.join(', ') || 'None\n');

    sections.push(`\n## Token Budget: ${config.maxTokenBudget}`);

    return sections.join('\n');
  }

  private buildProjectContextSection(
    role: AgentRole,
    s: ProjectSnapshot,
  ): string {
    const lines: string[] = ['## Project Context\n'];

    lines.push('### Stack');
    lines.push(`- **Project:** ${s.projectName}`);
    lines.push(`- **Language:** ${s.language}`);
    lines.push(`- **Framework:** ${s.framework}`);
    if (s.testFramework !== 'unknown') lines.push(`- **Test framework:** ${s.testFramework}`);
    if (s.buildTool !== 'unknown') lines.push(`- **Build tool:** ${s.buildTool}`);
    lines.push('');

    const needsArch = [AR.PLANNER, AR.ARCHITECT, AR.DEVELOPER].includes(role);

    if (needsArch && s.architecturePattern !== 'Flat / unknown') {
      lines.push('### Architecture');
      lines.push(`- **Pattern:** ${s.architecturePattern}`);
      if (s.architectureLayers.length > 0) {
        lines.push(`- **Layers:** ${s.architectureLayers.join(' → ')}`);
      }
      if (s.topDirs.length > 0) {
        lines.push(`- **Source directories:** ${s.topDirs.slice(0, 6).join(', ')}`);
      }
      if (s.patterns.length > 0) {
        lines.push(`- **Detected patterns:** ${s.patterns.slice(0, 4).join('; ')}`);
      }
      if (s.entryPoints.length > 0) {
        lines.push(`- **Entry points:** ${s.entryPoints.slice(0, 3).join(', ')}`);
      }
      lines.push('');
    }

    const needsConventions = [AR.DEVELOPER, AR.REVIEWER].includes(role);

    if (needsConventions) {
      lines.push('### Code Conventions');
      lines.push(`- **Naming — files:** ${s.naming.files}`);
      lines.push(`- **Naming — variables/functions:** ${s.naming.variables} / ${s.naming.functions}`);
      lines.push(`- **Naming — classes:** ${s.naming.classes}`);
      lines.push(`- **Naming — test files:** ${s.naming.testFiles}`);
      lines.push(`- **Formatting:** ${s.formatting.indentation}, ${s.formatting.quotes} quotes, ${s.formatting.semicolons ? 'semicolons' : 'no semicolons'}`);
      lines.push(`- **Imports:** ${s.imports.moduleSystem}`);
      if (s.imports.pathStyle) lines.push(`- **Import paths:** ${s.imports.pathStyle}`);
      if (s.imports.nodeProtocol) lines.push('- **node: protocol:** yes — use `node:fs` not `fs`');
      lines.push('');
    }

    const needsTesting = [AR.DEVELOPER, AR.REVIEWER].includes(role);

    if (needsTesting && s.testDirs.length > 0) {
      lines.push('### Testing');
      lines.push(`- **Test directories:** ${s.testDirs.slice(0, 4).join(', ')}`);
      if (s.naming.testFiles) lines.push(`- **Test file naming:** ${s.naming.testFiles}`);
      lines.push('');
    }

    const needsApi = [AR.ARCHITECT, AR.DEVELOPER, AR.REVIEWER].includes(role);

    if (needsApi && s.apiStyle !== 'none') {
      lines.push('### API');
      lines.push(`- **Style:** ${s.apiStyle}`);
      lines.push('');
    }

    const needsDeps = [AR.PLANNER, AR.ARCHITECT, AR.DEVELOPER].includes(role);

    if (needsDeps && s.keyDeps.length > 0) {
      lines.push('### Key Dependencies');
      lines.push(s.keyDeps.slice(0, 10).map((d) => `- ${d}`).join('\n'));
      lines.push('');
    }

    const needsInfra = [AR.OPERATOR].includes(role);

    if (needsInfra) {
      const infra: string[] = [];
      if (s.ciProvider !== 'unknown') infra.push(`- **CI:** ${s.ciProvider}`);
      if (s.deployTarget !== 'unknown') infra.push(`- **Deploy target:** ${s.deployTarget}`);
      if (s.cloudProvider !== 'unknown' && s.cloudProvider !== 'none') {
        infra.push(`- **Cloud:** ${s.cloudProvider}`);
      }
      if (infra.length > 0) {
        lines.push('### Infrastructure');
        lines.push(infra.join('\n'));
        lines.push('');
      }
    }

    lines.push('> Read `.cdm/analysis/overview.md` for project context, `.cdm/analysis/codestyle.md` for conventions, and the relevant `.cdm/analysis/<entity>.md` for module details.\n');

    return lines.join('\n');
  }

  private tailorFilePatterns(genericPatterns: string[], language: string): string[] {
    const langPatterns: Record<string, string[]> = {
      typescript: ['src/**/*.ts', 'src/**/*.tsx', 'lib/**/*.ts', 'tests/**/*.ts'],
      javascript: ['src/**/*.js', 'src/**/*.jsx', 'lib/**/*.js', 'tests/**/*.js'],
      python: ['**/*.py', 'tests/**/*.py', 'src/**/*.py'],
      go: ['**/*.go', 'cmd/**/*.go', 'pkg/**/*.go'],
      rust: ['src/**/*.rs', 'tests/**/*.rs'],
      ruby: ['**/*.rb', 'spec/**/*.rb', 'lib/**/*.rb'],
      java: ['src/**/*.java', 'src/test/**/*.java'],
      kotlin: ['src/**/*.kt', 'src/test/**/*.kt'],
      csharp: ['**/*.cs', 'src/**/*.cs', 'tests/**/*.cs'],
      php: ['src/**/*.php', 'tests/**/*.php'],
    };

    const lang = language.toLowerCase();
    const replacement = langPatterns[lang];
    if (!replacement) return genericPatterns;

    const generic = new Set(['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx', 'lib/**/*']);
    const hasOnlyGeneric = genericPatterns.every((p) => generic.has(p));
    return hasOnlyGeneric ? replacement : genericPatterns;
  }

  parseArtifacts(output: string, task: AgentTask): Artifact[] {
    const artifacts: Artifact[] = [];
    const regex = /---ARTIFACT_START---([\s\S]*?)---ARTIFACT_END---/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(output)) !== null) {
      const block = match[1].trim();
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const nameMatch = block.match(/^Name:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*(.+)$/m);
      const contentMatch = block.match(/Content:\s*([\s\S]*)$/m);

      if (typeMatch && nameMatch && contentMatch) {
        const artifactType = this.resolveArtifactType(typeMatch[1].trim());
        if (artifactType) {
          artifacts.push({
            id: uuidv4(),
            type: artifactType,
            name: nameMatch[1].trim(),
            description: descMatch?.[1]?.trim() ?? '',
            filePath: `.cdm/artifacts/${nameMatch[1].trim().toLowerCase().replace(/\s+/g, '-')}.md`,
            createdBy: task.assignedTo,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
            content: contentMatch[1].trim(),
            metadata: {
              taskId: task.id,
              step: task.step,
              featureId: task.featureId,
              skills: task.activeSkills,
            },
            status: ArtifactStatus.DRAFT,
            reviewStatus: ReviewStatus.PENDING,
          });
        }
      }
    }

    return artifacts;
  }

  parseIssues(output: string, task: AgentTask): Issue[] {
    const issues: Issue[] = [];
    const regex = /---ISSUE_START---([\s\S]*?)---ISSUE_END---/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(output)) !== null) {
      const block = match[1].trim();
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const sevMatch = block.match(/^Severity:\s*(.+)$/m);
      const titleMatch = block.match(/^Title:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*([\s\S]*)$/m);

      if (typeMatch && titleMatch) {
        issues.push({
          id: uuidv4(),
          featureId: task.featureId,
          type: this.resolveIssueType(typeMatch[1].trim()),
          severity: this.resolveIssueSeverity(sevMatch?.[1]?.trim() ?? 'medium'),
          title: titleMatch[1].trim(),
          description: descMatch?.[1]?.trim() ?? '',
          reportedBy: task.assignedTo,
          step: task.step,
          stepIndex: task.stepIndex,
          status: 'open' as Issue['status'],
          createdAt: new Date(),
        });
      }
    }

    return issues;
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

  private writePromptFile(role: AgentRole, taskId: string, prompt: string): void {
    const dir = path.join(this.options.projectPath, '.cdm', 'agent-prompts', role);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, `${taskId}.md`), prompt, 'utf-8');
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
