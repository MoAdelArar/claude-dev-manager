import { spawn, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type AgentRole,
  type AgentTask,
  type AgentResult,
  PipelineStage,
  type Artifact,
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

export class ClaudeCodeBridge {
  private agentRegistry: AgentRegistry;
  private artifactStore: ArtifactStore;
  private options: ClaudeCodeOptions;
  private agentInstructionsDir: string;
  private executionMode: ExecutionMode;
  private claudeAvailable: boolean | null = null;

  constructor(
    agentRegistry: AgentRegistry,
    artifactStore: ArtifactStore,
    options: ClaudeCodeOptions,
  ) {
    this.agentRegistry = agentRegistry;
    this.artifactStore = artifactStore;
    this.options = options;
    this.agentInstructionsDir = path.join(options.projectPath, '.cdm', 'agent-prompts');
    this.executionMode = options.executionMode ?? 'claude-cli';
    this.ensureDirectories();
  }

  getExecutionMode(): ExecutionMode {
    return this.executionMode;
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
    const agent = this.agentRegistry.getAgent(task.assignedTo);
    const startTime = Date.now();

    agentLog(task.assignedTo, `Preparing task: ${task.title}`, task.stage);

    const prompt = agent.buildClaudeCodePrompt(task);
    const promptFile = this.writePromptFile(task.assignedTo, task.id, prompt);

    try {
      const output = await this.invokeClaudeCode(promptFile, task);

      const artifacts = this.parseArtifacts(output, task);
      const issues = this.parseIssues(output, task);

      for (const artifact of artifacts) {
        this.artifactStore.store(artifact);
      }

      return {
        agentRole: task.assignedTo,
        status: 'success',
        output,
        artifacts,
        issues,
        tokensUsed: this.estimateTokens(prompt + output),
        durationMs: Date.now() - startTime,
        metadata: {
          taskId: task.id,
          promptFile,
          executionMode: this.resolveExecutionMode(),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      agentLog(task.assignedTo, `Task failed: ${errorMessage}`, task.stage, 'error');

      return {
        agentRole: task.assignedTo,
        status: 'failure',
        output: errorMessage,
        artifacts: [],
        issues: [],
        tokensUsed: this.estimateTokens(prompt),
        durationMs: Date.now() - startTime,
        metadata: { taskId: task.id, error: errorMessage },
      };
    }
  }

  generateSubagentPrompt(task: AgentTask): string {
    const agent = this.agentRegistry.getAgent(task.assignedTo);
    return agent.buildClaudeCodePrompt(task);
  }

  writeAgentInstructionFiles(): void {
    const configs = this.agentRegistry.getAllConfigs();
    const instructionsDir = path.join(this.options.projectPath, 'agents');

    if (!fs.existsSync(instructionsDir)) {
      fs.mkdirSync(instructionsDir, { recursive: true });
    }

    for (const config of configs) {
      const content = this.buildAgentInstructionFile(config);
      const filePath = path.join(instructionsDir, `${config.name}.md`);
      fs.writeFileSync(filePath, content, 'utf-8');
    }

    logger.info(`Generated ${configs.length} agent instruction files`);
  }

  generateMainClaudeMd(): string {
    const sections: string[] = [];

    sections.push('# Claude Dev Manager - Project Instructions\n');
    sections.push('This project uses a multi-agent development management system.');
    sections.push('Each agent has a specific role in the software development lifecycle.\n');

    sections.push('## Team Structure\n');
    sections.push('```');
    sections.push('Product Manager (top level)');
    sections.push('├── Engineering Manager');
    sections.push('│   ├── Senior Developer');
    sections.push('│   │   └── Junior Developer');
    sections.push('│   ├── Code Reviewer');
    sections.push('│   ├── QA Engineer');
    sections.push('│   ├── Security Engineer');
    sections.push('│   ├── DevOps Engineer');
    sections.push('│   └── Documentation Writer');
    sections.push('└── UI/UX Designer');
    sections.push('```\n');

    sections.push('## Development Pipeline\n');
    sections.push('Features go through these stages in order:\n');
    sections.push('1. **Requirements Gathering** → Product Manager');
    sections.push('2. **Architecture Design** → System Architect');
    sections.push('3. **UI/UX Design** → UI Designer');
    sections.push('4. **Task Breakdown** → Engineering Manager');
    sections.push('5. **Implementation** → Senior Developer + Junior Developer');
    sections.push('6. **Code Review** → Code Reviewer');
    sections.push('7. **Testing** → QA Engineer');
    sections.push('8. **Security Review** → Security Engineer');
    sections.push('9. **Documentation** → Documentation Writer');
    sections.push('10. **Deployment** → DevOps Engineer\n');

    sections.push('## Agent Delegation Protocol\n');
    sections.push('When delegating work to a subagent, use the Task tool with:');
    sections.push('- The agent\'s specific system prompt from the agents/ directory');
    sections.push('- All relevant input artifacts');
    sections.push('- Clear instructions about expected outputs');
    sections.push('- Any constraints or guidelines\n');

    sections.push('## Artifact Format\n');
    sections.push('Agents produce artifacts using this format:\n');
    sections.push('```');
    sections.push('---ARTIFACT_START---');
    sections.push('Type: <artifact_type>');
    sections.push('Name: <artifact_name>');
    sections.push('Description: <description>');
    sections.push('Content:');
    sections.push('<content>');
    sections.push('---ARTIFACT_END---');
    sections.push('```\n');

    sections.push('## Issue Format\n');
    sections.push('```');
    sections.push('---ISSUE_START---');
    sections.push('Type: <issue_type>');
    sections.push('Severity: <critical|high|medium|low|info>');
    sections.push('Title: <title>');
    sections.push('Description: <description>');
    sections.push('---ISSUE_END---');
    sections.push('```');

    return sections.join('\n');
  }

  private resolveExecutionMode(): ExecutionMode {
    if (this.executionMode === 'simulation') return 'simulation';
    return this.isClaudeAvailable() ? 'claude-cli' : 'simulation';
  }

  private async invokeClaudeCode(promptFile: string, task: AgentTask): Promise<string> {
    const mode = this.resolveExecutionMode();

    if (mode === 'claude-cli') {
      return this.invokeClaudeCLI(promptFile, task);
    }

    return this.invokeSimulation(task);
  }

  private async invokeClaudeCLI(promptFile: string, task: AgentTask): Promise<string> {
    const prompt = fs.readFileSync(promptFile, 'utf-8');
    const claudeBin = this.options.claudePath ?? 'claude';
    const timeoutMs = (this.options.timeout ?? 300) * 1000;

    agentLog(task.assignedTo, `Invoking Claude Code CLI [${task.title}]`, task.stage);

    const args = ['--print'];

    if (this.options.model) {
      args.push('--model', this.options.model);
    }

    if (this.options.maxTokens) {
      args.push('--max-tokens', String(this.options.maxTokens));
    }

    const agentConfig = this.agentRegistry.getConfig(task.assignedTo);
    const allowedTools = agentConfig.capabilities.flatMap(c => c.allowedTools);
    if (allowedTools.length > 0) {
      args.push('--allowedTools', allowedTools.join(','));
    }

    args.push(prompt);

    return new Promise<string>((resolve, reject) => {
      const proc = spawn(claudeBin, args, {
        cwd: this.options.projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: timeoutMs,
        env: {
          ...process.env,
          CDM_AGENT_ROLE: task.assignedTo,
          CDM_PIPELINE_STAGE: task.stage,
          CDM_FEATURE_ID: task.featureId,
        },
      });

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
            task.stage,
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
    agentLog(task.assignedTo, 'Running in simulation mode (Claude CLI not available)', task.stage);

    const agent = this.agentRegistry.getAgent(task.assignedTo);
    const result = await agent.execute(task);
    return result.output;
  }

  private writePromptFile(role: AgentRole, taskId: string, prompt: string): string {
    const dir = path.join(this.agentInstructionsDir, role);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, `${taskId}.md`);
    fs.writeFileSync(filePath, prompt, 'utf-8');
    return filePath;
  }

  private buildAgentInstructionFile(config: import('../types').AgentConfig): string {
    const sections: string[] = [];

    sections.push(`# ${config.title}\n`);
    sections.push(`**Role:** ${config.role}`);
    sections.push(`**Reports to:** ${config.reportsTo ?? 'None (top-level)'}`);
    sections.push(`**Direct reports:** ${config.directReports.join(', ') || 'None'}\n`);
    sections.push(`## Description\n${config.description}\n`);
    sections.push(`## System Prompt\n${config.systemPrompt}\n`);

    sections.push('## Capabilities\n');
    for (const cap of config.capabilities) {
      sections.push(`### ${cap.name}`);
      sections.push(cap.description);
      sections.push(`- Tools: ${cap.allowedTools.join(', ')}`);
      sections.push(`- File patterns: ${cap.filePatterns.join(', ')}\n`);
    }

    sections.push('## Input Artifacts\n');
    sections.push(config.requiredInputArtifacts.join(', ') || 'None required\n');

    sections.push('\n## Output Artifacts\n');
    sections.push(config.outputArtifacts.join(', ') || 'None\n');

    sections.push(`\n## Token Budget: ${config.maxTokenBudget}`);

    return sections.join('\n');
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
            metadata: { taskId: task.id, stage: task.stage },
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
          stage: task.stage,
          status: 'open' as any,
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
      architecture_doc: ArtifactType.ARCHITECTURE_DOC,
      architecture_document: ArtifactType.ARCHITECTURE_DOC,
      architecture: ArtifactType.ARCHITECTURE_DOC,
      system_diagram: ArtifactType.SYSTEM_DIAGRAM,
      api_spec: ArtifactType.API_SPEC,
      api_specification: ArtifactType.API_SPEC,
      data_model: ArtifactType.DATA_MODEL,
      ui_spec: ArtifactType.UI_SPEC,
      wireframe: ArtifactType.WIREFRAME,
      component_spec: ArtifactType.COMPONENT_SPEC,
      task_list: ArtifactType.TASK_LIST,
      sprint_plan: ArtifactType.SPRINT_PLAN,
      source_code: ArtifactType.SOURCE_CODE,
      code: ArtifactType.SOURCE_CODE,
      unit_tests: ArtifactType.UNIT_TESTS,
      integration_tests: ArtifactType.INTEGRATION_TESTS,
      e2e_tests: ArtifactType.E2E_TESTS,
      test_plan: ArtifactType.TEST_PLAN,
      test_report: ArtifactType.TEST_REPORT,
      code_review_report: ArtifactType.CODE_REVIEW_REPORT,
      code_review: ArtifactType.CODE_REVIEW_REPORT,
      security_report: ArtifactType.SECURITY_REPORT,
      deployment_plan: ArtifactType.DEPLOYMENT_PLAN,
      infrastructure_config: ArtifactType.INFRASTRUCTURE_CONFIG,
      ci_cd_config: ArtifactType.CI_CD_CONFIG,
      api_documentation: ArtifactType.API_DOCUMENTATION,
      user_documentation: ArtifactType.USER_DOCUMENTATION,
      developer_documentation: ArtifactType.DEVELOPER_DOCUMENTATION,
      changelog: ArtifactType.CHANGELOG,
      monitoring_config: ArtifactType.MONITORING_CONFIG,
      monitoring: ArtifactType.MONITORING_CONFIG,
      alerting_rules: ArtifactType.ALERTING_RULES,
      alerting: ArtifactType.ALERTING_RULES,
      scaling_policy: ArtifactType.SCALING_POLICY,
      scaling: ArtifactType.SCALING_POLICY,
      cost_analysis: ArtifactType.COST_ANALYSIS,
      cost: ArtifactType.COST_ANALYSIS,
      sla_definition: ArtifactType.SLA_DEFINITION,
      sla: ArtifactType.SLA_DEFINITION,
      disaster_recovery_plan: ArtifactType.DISASTER_RECOVERY_PLAN,
      disaster_recovery: ArtifactType.DISASTER_RECOVERY_PLAN,
      performance_benchmark: ArtifactType.PERFORMANCE_BENCHMARK,
      benchmark: ArtifactType.PERFORMANCE_BENCHMARK,
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

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.agentInstructionsDir)) {
      fs.mkdirSync(this.agentInstructionsDir, { recursive: true });
    }
  }
}
