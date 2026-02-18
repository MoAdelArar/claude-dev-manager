import {
  AgentConfig,
  AgentRole,
  AgentTask,
  Artifact,
  ArtifactType,
  Issue,
  IssueType,
  IssueSeverity,
  PipelineStage,
} from '../types';
import { BaseAgent } from './base-agent';
import { ArtifactStore } from '../workspace/artifact-store';
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

const ENGINEERING_MANAGER_SYSTEM_PROMPT = `You are a Senior Engineering Manager with 12+ years of experience leading high-performing
software teams. You excel at translating product requirements and architecture decisions
into actionable implementation plans with accurate effort estimates.

Your primary responsibilities are:
1. Analyzing requirements documents, user stories, and architecture specifications
2. Decomposing features into granular, implementable engineering tasks
3. Estimating effort using story points and time-based estimates
4. Creating sprint plans that balance velocity with quality
5. Identifying technical risks, dependencies, and resource constraints

When breaking down work, you MUST:
- Create tasks that are independently testable and deliverable
- Ensure each task has a clear definition of done
- Keep individual tasks under 8 story points (split larger items)
- Identify parallelizable work streams for maximum team throughput
- Account for code review time, testing overhead, and integration effort
- Include infrastructure and DevOps tasks alongside feature work
- Budget time for technical debt reduction (minimum 15% of sprint capacity)
- Plan for documentation tasks alongside implementation

For each Task in the Task List, include:
- Task ID: unique, sequential identifier (T-001, T-002, etc.)
- Title: concise, action-oriented description
- Description: detailed explanation of what needs to be done
- Type: feature | bugfix | infrastructure | testing | documentation | refactor
- Story Points: 1 | 2 | 3 | 5 | 8 (Fibonacci, nothing above 8)
- Assigned Role: which agent role should handle this task
- Dependencies: list of blocking task IDs
- Acceptance Criteria: specific conditions for task completion
- Technical Notes: implementation hints, relevant patterns, or gotchas

For Sprint Planning, follow these principles:
- Sprint duration: 2 weeks (10 working days)
- Plan to 80% capacity to account for interruptions and unexpected complexity
- Front-load high-risk and blocking tasks
- Pair complex tasks with their corresponding test tasks in the same sprint
- Reserve the final 2 days for integration testing and bug fixes
- Include a buffer of 10-15% for scope creep and estimation errors

Risk Assessment guidelines:
- Evaluate each task for technical uncertainty (1-5 scale)
- Identify single points of failure in the task dependency graph
- Flag tasks that require unfamiliar technologies or patterns
- Assess integration risk between components
- Consider operational risks (deployment, monitoring, rollback)

Resource allocation principles:
- Senior developers handle high-complexity and architectural tasks
- Junior developers handle well-defined tasks with clear patterns
- Pair programming recommended for critical path items
- Code reviewers should not review their own implementation sprint
- QA involvement from sprint planning through completion

When you identify issues, focus on:
- Timeline risks from dependency chains and critical path analysis
- Technical debt that could slow future development
- Resource bottlenecks (single developer dependencies)
- Missing or incomplete requirements that block task creation
- Architecture gaps that need resolution before implementation starts
- Testing strategy gaps (missing test types or coverage targets)
- Integration points that need contract definitions

You think in terms of delivery risk, team velocity, and sustainable pace. You balance the
urgency of shipping features with the long-term health of the codebase. You are pragmatic
about trade-offs and explicit about the consequences of cutting corners.

Output everything using the artifact markers as instructed. Be specific and actionable—
every task should be something a developer can pick up and start working on without
needing additional context beyond the referenced artifacts.`;

export const engineeringManagerConfig: AgentConfig = {
  role: AgentRole.ENGINEERING_MANAGER,
  name: 'engineering-manager',
  title: 'Senior Engineering Manager',
  description:
    'Breaks down requirements and architecture into implementable tasks, estimates effort, creates sprint plans, and coordinates development work across the team.',
  systemPrompt: ENGINEERING_MANAGER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'task_breakdown',
      description: 'Decompose requirements into granular engineering tasks with estimates',
      allowedTools: ['Read', 'Write', 'Glob'],
      filePatterns: ['docs/tasks/**', 'docs/sprints/**'],
    },
    {
      name: 'sprint_planning',
      description: 'Create sprint plans with resource allocation and dependency management',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['docs/sprints/**', 'docs/plans/**'],
    },
    {
      name: 'risk_assessment',
      description: 'Evaluate technical risks, resource constraints, and timeline concerns',
      allowedTools: ['Read', 'Write', 'Glob'],
      filePatterns: ['docs/risks/**', 'docs/assessments/**'],
    },
  ],
  maxTokenBudget: 32000,
  allowedFilePatterns: ['docs/**', '*.md', 'specs/**'],
  blockedFilePatterns: ['src/**', 'test/**', '*.ts', '*.js'],
  reportsTo: AgentRole.PRODUCT_MANAGER,
  directReports: [AgentRole.SENIOR_DEVELOPER, AgentRole.JUNIOR_DEVELOPER, AgentRole.CODE_REVIEWER],
  requiredInputArtifacts: [
    ArtifactType.REQUIREMENTS_DOC,
    ArtifactType.USER_STORIES,
    ArtifactType.ARCHITECTURE_DOC,
  ],
  outputArtifacts: [ArtifactType.TASK_LIST, ArtifactType.SPRINT_PLAN],
};

export class EngineeringManagerAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(engineeringManagerConfig, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Analyzing requirements and architecture for task breakdown', task.stage);

    const inputSummary = this.summarizeInputArtifacts(task);
    const prompt = this.buildClaudeCodePrompt(task);
    const output = this.generateTaskBreakdown(task, inputSummary, prompt);

    agentLog(this.role, 'Task breakdown and sprint planning complete', task.stage);
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
          {
            featureId: task.featureId,
            stage: task.stage,
            inputArtifactCount: task.inputArtifacts.length,
          },
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

    issues.push(...this.detectPlanningRisks(task, output));

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

  private summarizeInputArtifacts(task: AgentTask): string {
    if (task.inputArtifacts.length === 0) {
      return 'No input artifacts provided. Generating task breakdown from task description only.';
    }

    const summaries = task.inputArtifacts.map((artifact) => {
      const preview = artifact.content.length > 500
        ? artifact.content.substring(0, 500) + '... [truncated]'
        : artifact.content;
      return `### ${artifact.name} (${artifact.type})\n${preview}`;
    });

    return summaries.join('\n\n');
  }

  private generateTaskBreakdown(task: AgentTask, inputSummary: string, _prompt: string): string {
    const sections: string[] = [];
    const hasArchDoc = task.inputArtifacts.some((a) => a.type === ArtifactType.ARCHITECTURE_DOC);
    const hasRequirements = task.inputArtifacts.some((a) => a.type === ArtifactType.REQUIREMENTS_DOC);

    sections.push('### Summary');
    sections.push(
      `Task breakdown and sprint plan for "${task.title}". ` +
      `Analyzed ${task.inputArtifacts.length} input artifact(s) to produce an implementation plan. ` +
      `${hasArchDoc ? 'Architecture document informed technical task decomposition. ' : ''}` +
      `${hasRequirements ? 'Requirements document drove feature task identification.' : ''}`,
    );

    sections.push(this.buildTaskListArtifact(task, hasArchDoc));
    sections.push(this.buildSprintPlanArtifact(task));

    if (!hasArchDoc) {
      sections.push(
        '---ISSUE_START---\n' +
        'Type: architecture_concern\n' +
        'Severity: medium\n' +
        'Title: Architecture document not provided\n' +
        'Description: Task breakdown was performed without an architecture document. ' +
        'Technical task decomposition may need revision once architecture decisions are finalized. ' +
        'Recommend completing architecture design before committing to the sprint plan.\n' +
        '---ISSUE_END---',
      );
    }

    sections.push('### Recommendations');
    sections.push(
      '- Senior developers should review task estimates before sprint commitment\n' +
      '- Schedule a sprint planning meeting to assign specific developers to tasks\n' +
      '- Set up CI/CD pipeline tasks early to unblock integration testing\n' +
      '- Consider a spike task if any technology choices are unvalidated\n' +
      '- Ensure code review assignments avoid conflicts of interest',
    );

    return sections.join('\n\n');
  }

  private buildTaskListArtifact(task: AgentTask, hasArchDoc: boolean): string {
    const lines = [
      '---ARTIFACT_START---',
      'Type: task_list',
      `Name: ${task.title} - Task List`,
      'Description: Granular engineering tasks with effort estimates, dependencies, and role assignments',
      'Content:',
      `# Task List: ${task.title}`,
      '',
      '## T-001: Project scaffolding and repository setup',
      '- **Type:** infrastructure',
      '- **Story Points:** 2',
      '- **Assigned Role:** SENIOR_DEVELOPER',
      '- **Dependencies:** None',
      '- **Description:** Initialize project structure, configure build tooling, linter, and formatter. Set up base configuration files.',
      '- **Acceptance Criteria:** Project builds successfully, linter passes, CI pipeline runs green.',
      '- **Technical Notes:** Follow established project conventions. Include .editorconfig and pre-commit hooks.',
      '',
      '## T-002: Data model and schema definition',
      '- **Type:** feature',
      '- **Story Points:** 3',
      '- **Assigned Role:** SENIOR_DEVELOPER',
      '- **Dependencies:** T-001',
      '- **Description:** Define data models, database schemas, and validation rules based on requirements.',
      '- **Acceptance Criteria:** Schema migrations run cleanly, models pass validation tests.',
      '- **Technical Notes:** Include indexes for expected query patterns. Plan for future schema evolution.',
      '',
      '## T-003: API endpoint implementation',
      '- **Type:** feature',
      '- **Story Points:** 5',
      '- **Assigned Role:** SENIOR_DEVELOPER',
      '- **Dependencies:** T-002',
      '- **Description:** Implement core API endpoints covering all functional requirements. Include input validation, error handling, and response formatting.',
      '- **Acceptance Criteria:** All endpoints respond correctly per API spec, input validation rejects malformed data, errors return structured responses.',
      '- **Technical Notes:** Use middleware for cross-cutting concerns (auth, logging, rate limiting).',
      '',
      '## T-004: Business logic implementation',
      '- **Type:** feature',
      '- **Story Points:** 5',
      '- **Assigned Role:** SENIOR_DEVELOPER',
      '- **Dependencies:** T-002',
      '- **Description:** Implement core business logic as described in requirements, including all identified edge cases and error scenarios.',
      '- **Acceptance Criteria:** All user stories satisfied, edge cases handled, business rules enforced.',
      '- **Technical Notes:** Keep business logic decoupled from transport layer for testability.',
      '',
      '## T-005: Unit test suite',
      '- **Type:** testing',
      '- **Story Points:** 3',
      '- **Assigned Role:** JUNIOR_DEVELOPER',
      '- **Dependencies:** T-003, T-004',
      '- **Description:** Write comprehensive unit tests for all business logic and API handlers. Target minimum 80% code coverage.',
      '- **Acceptance Criteria:** All tests pass, coverage ≥ 80%, edge cases covered.',
      '- **Technical Notes:** Use mocking for external dependencies. Include both positive and negative test cases.',
      '',
      '## T-006: Integration test suite',
      '- **Type:** testing',
      '- **Story Points:** 3',
      '- **Assigned Role:** JUNIOR_DEVELOPER',
      '- **Dependencies:** T-003, T-004, T-005',
      '- **Description:** Write integration tests covering API-to-database flows and cross-component interactions.',
      '- **Acceptance Criteria:** All integration paths tested, tests run in isolated environment.',
      '- **Technical Notes:** Use test containers or in-memory database for isolation.',
      '',
      '## T-007: Error handling and logging',
      '- **Type:** feature',
      '- **Story Points:** 2',
      '- **Assigned Role:** JUNIOR_DEVELOPER',
      '- **Dependencies:** T-003',
      '- **Description:** Implement structured logging, error classification, and audit trail as specified in requirements.',
      '- **Acceptance Criteria:** All operations logged with correlation IDs, errors classified by type.',
      '- **Technical Notes:** Use structured JSON logging. Include request/response correlation.',
      '',
      '## T-008: Code review and refactoring',
      '- **Type:** refactor',
      '- **Story Points:** 2',
      '- **Assigned Role:** CODE_REVIEWER',
      '- **Dependencies:** T-003, T-004, T-005',
      '- **Description:** Thorough code review of all implementation tasks. Identify code quality issues, suggest refactoring opportunities.',
      '- **Acceptance Criteria:** All review comments addressed, no critical or high-severity findings remain.',
      '- **Technical Notes:** Focus on SOLID principles, error handling patterns, and test quality.',
    ];

    if (hasArchDoc) {
      lines.push(
        '',
        '## T-009: Architecture alignment verification',
        '- **Type:** documentation',
        '- **Story Points:** 1',
        '- **Assigned Role:** SENIOR_DEVELOPER',
        '- **Dependencies:** T-003, T-004',
        '- **Description:** Verify implementation aligns with architecture document. Document any deviations with justification.',
        '- **Acceptance Criteria:** Architecture compliance report completed, deviations documented and approved.',
        '- **Technical Notes:** Cross-reference component boundaries, data flow patterns, and dependency rules.',
      );
    }

    lines.push('---ARTIFACT_END---');
    return lines.join('\n');
  }

  private buildSprintPlanArtifact(task: AgentTask): string {
    return [
      '---ARTIFACT_START---',
      'Type: sprint_plan',
      `Name: ${task.title} - Sprint Plan`,
      'Description: Two-week sprint plan with task scheduling, resource allocation, and risk buffers',
      'Content:',
      `# Sprint Plan: ${task.title}`,
      '',
      '## Sprint Overview',
      '- **Duration:** 2 weeks (10 working days)',
      '- **Total Story Points:** 26',
      '- **Planned Capacity:** 80% (effective: ~21 points)',
      '- **Risk Buffer:** 15% reserved for estimation error',
      '',
      '## Week 1: Foundation and Core Implementation',
      '',
      '### Days 1-2: Setup and Data Layer',
      '- T-001: Project scaffolding and repository setup (2 SP) → Senior Developer',
      '- T-002: Data model and schema definition (3 SP) → Senior Developer',
      '- **Daily standup focus:** Unblocking infrastructure, validating data model decisions',
      '',
      '### Days 3-5: Core Feature Development',
      '- T-003: API endpoint implementation (5 SP) → Senior Developer',
      '- T-004: Business logic implementation (5 SP) → Senior Developer (parallelizable with T-003)',
      '- T-007: Error handling and logging (2 SP) → Junior Developer (starts Day 4)',
      '- **Daily standup focus:** Progress on critical path, early integration testing',
      '',
      '## Week 2: Testing, Review, and Hardening',
      '',
      '### Days 6-7: Test Development',
      '- T-005: Unit test suite (3 SP) → Junior Developer',
      '- T-006: Integration test suite (3 SP) → Junior Developer (starts Day 7)',
      '- **Daily standup focus:** Test coverage metrics, blocking bugs',
      '',
      '### Days 8-9: Code Review and Fixes',
      '- T-008: Code review and refactoring (2 SP) → Code Reviewer',
      '- Bug fixes from review findings → Original task authors',
      '- **Daily standup focus:** Review findings, fix prioritization',
      '',
      '### Day 10: Integration and Stabilization',
      '- Final integration testing',
      '- Documentation updates',
      '- Sprint retrospective preparation',
      '- **Daily standup focus:** Release readiness, open issues triage',
      '',
      '## Risk Mitigation',
      '- **Critical path:** T-001 → T-002 → T-003/T-004 → T-005/T-006 → T-008',
      '- **Parallel streams:** T-003 and T-004 can proceed in parallel after T-002',
      '- **Buffer allocation:** 2 points reserved for unplanned work',
      '- **Escalation trigger:** If any critical-path task slips by more than 1 day',
      '',
      '## Definition of Done (Sprint Level)',
      '- All tasks marked complete with acceptance criteria verified',
      '- Code review completed with no open critical/high findings',
      '- Unit test coverage ≥ 80%',
      '- Integration tests passing in CI',
      '- No known P0/P1 bugs',
      '- Documentation updated for any API changes',
      '---ARTIFACT_END---',
    ].join('\n');
  }

  private generateDefaultArtifacts(task: AgentTask, output: string): Artifact[] {
    const artifacts: Artifact[] = [];

    artifacts.push(
      this.createArtifact(
        ArtifactType.TASK_LIST,
        `${task.title} - Task List`,
        'Auto-generated task list from raw output',
        output,
        `docs/tasks/${task.featureId}/task-list.md`,
        { featureId: task.featureId, autoGenerated: true },
      ),
    );

    return artifacts;
  }

  private detectPlanningRisks(task: AgentTask, output: string): Issue[] {
    const issues: Issue[] = [];
    const lowerOutput = output.toLowerCase();

    const missingArtifactTypes = this.config.requiredInputArtifacts.filter(
      (required) => !task.inputArtifacts.some((a) => a.type === required),
    );

    for (const missing of missingArtifactTypes) {
      const severity = missing === ArtifactType.REQUIREMENTS_DOC
        ? IssueSeverity.HIGH
        : IssueSeverity.MEDIUM;

      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.DOCUMENTATION_GAP,
          severity,
          `Missing required input: ${missing}`,
          `The ${missing} artifact was not provided as input. Task breakdown may be incomplete ` +
          `or inaccurate without this information. Consider completing the upstream stage first.`,
          task.stage,
        ),
      );
    }

    if (!lowerOutput.includes('test') && !lowerOutput.includes('testing')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.MISSING_TEST,
          IssueSeverity.HIGH,
          'No testing tasks in breakdown',
          'The task breakdown does not include dedicated testing tasks. Unit tests, integration tests, ' +
          'and test infrastructure setup must be included for production-quality delivery.',
          task.stage,
        ),
      );
    }

    if (!lowerOutput.includes('review') && !lowerOutput.includes('code review')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.CODE_QUALITY,
          IssueSeverity.MEDIUM,
          'No code review tasks planned',
          'Sprint plan does not include code review tasks. All implementation code must go through ' +
          'review before merging. Add code review tasks with appropriate dependency chains.',
          task.stage,
        ),
      );
    }

    const storyPointMatches = output.match(/Story Points?:\s*(\d+)/gi) || [];
    let totalPoints = 0;
    for (const match of storyPointMatches) {
      const num = parseInt(match.replace(/\D/g, ''), 10);
      if (!isNaN(num)) totalPoints += num;
    }

    if (totalPoints > 30) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.DESIGN_FLAW,
          IssueSeverity.HIGH,
          'Sprint may be over-committed',
          `Total estimated story points (${totalPoints}) exceed recommended sprint capacity (21-26 points ` +
          `at 80% utilization). Consider splitting work across multiple sprints or reducing scope.`,
          task.stage,
        ),
      );
    }

    const dependencyPattern = /Dependencies?:\s*([T\d,\s-]+)/gi;
    const depMatches = [...output.matchAll(dependencyPattern)];

    for (const depMatch of depMatches) {
      const depLine = depMatch[1];
      const refs = [...depLine.matchAll(/T-(\d+)/g)].map((r) => `T-${r[1]}`);
      if (refs.length > 3) {
        issues.push(
          this.createIssue(
            task.featureId,
            IssueType.ARCHITECTURE_CONCERN,
            IssueSeverity.MEDIUM,
            'Task has excessive dependencies',
            `A task has ${refs.length} dependencies, creating a potential bottleneck. ` +
            'Consider restructuring tasks to reduce coupling and enable more parallel work.',
            task.stage,
          ),
        );
        break;
      }
    }

    return issues;
  }

  private resolveArtifactType(raw: string): ArtifactType | null {
    const normalized = raw.toLowerCase().replace(/[\s-]/g, '_');
    const mapping: Record<string, ArtifactType> = {
      task_list: ArtifactType.TASK_LIST,
      tasks: ArtifactType.TASK_LIST,
      tasklist: ArtifactType.TASK_LIST,
      sprint_plan: ArtifactType.SPRINT_PLAN,
      sprint: ArtifactType.SPRINT_PLAN,
      sprintplan: ArtifactType.SPRINT_PLAN,
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
    const pathMap: Record<string, string> = {
      [ArtifactType.TASK_LIST]: `docs/tasks/${featureId}/task-list.md`,
      [ArtifactType.SPRINT_PLAN]: `docs/sprints/${featureId}/sprint-plan.md`,
    };
    return pathMap[type] || `docs/${featureId}/${type}.md`;
  }

  protected override buildHandoffInstructions(toAgent: AgentRole, stage: PipelineStage): string {
    if (toAgent === AgentRole.SENIOR_DEVELOPER) {
      return (
        'Task breakdown and sprint plan are ready. Please review the task list and begin ' +
        'implementation starting with the highest-priority, unblocked tasks. Follow the ' +
        'dependency order specified in the task list. Flag any tasks where the description ' +
        'is insufficient or the estimate seems inaccurate.'
      );
    }

    if (toAgent === AgentRole.JUNIOR_DEVELOPER) {
      return (
        'Tasks assigned to you are well-defined with clear acceptance criteria. Start with ' +
        'tasks that have no unresolved dependencies. Ask the senior developer or engineering ' +
        'manager for clarification if any task description is unclear. Write tests alongside ' +
        'your implementation code.'
      );
    }

    if (toAgent === AgentRole.CODE_REVIEWER) {
      return (
        'Implementation tasks are in progress. Prepare for code review by familiarizing yourself ' +
        'with the requirements and architecture documents. Review each task against its acceptance ' +
        'criteria and the overall architecture. Focus on correctness, maintainability, and test coverage.'
      );
    }

    return super.buildHandoffInstructions(toAgent, stage);
  }

  protected override getHandoffConstraints(toAgent: AgentRole): string[] {
    const base = super.getHandoffConstraints(toAgent);

    if (toAgent === AgentRole.SENIOR_DEVELOPER || toAgent === AgentRole.JUNIOR_DEVELOPER) {
      return [
        ...base,
        'Do not exceed the story point budget for your assigned tasks',
        'Update task status as you progress (in_progress, blocked, complete)',
        'Write unit tests for all new code before marking a task complete',
        'Follow the dependency order in the task list',
      ];
    }

    return base;
  }
}

export function createEngineeringManagerAgent(artifactStore: ArtifactStore): EngineeringManagerAgent {
  return new EngineeringManagerAgent(artifactStore);
}
