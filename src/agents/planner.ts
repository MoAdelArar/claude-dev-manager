import { v4 as uuidv4 } from 'uuid';
import {
  type AgentConfig,
  AgentRole,
  type AgentTask,
  type Artifact,
  ArtifactType,
  type Issue,
  type ExecutionPlan,
  type ExecutionStep,
  ArtifactStatus,
  ReviewStatus,
} from '../types';
import { BaseAgent } from './base-agent';
import { type ArtifactStore } from '../workspace/artifact-store';
import { agentLog } from '../utils/logger';

const PLANNER_SYSTEM_PROMPT = `You analyze development tasks and create execution plans.
Classify the task type, determine which agents and skills are needed, and produce an ordered execution plan.
You think in terms of dependencies, parallelization opportunities, and appropriate skill selection.
Output structured execution plans, not code.`;

export const PLANNER_CONFIG: AgentConfig = {
  role: AgentRole.PLANNER,
  name: 'planner',
  title: 'Planner',
  description: 'Analyzes tasks, classifies them, and creates execution plans that determine which agents and skills to activate',
  systemPrompt: PLANNER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'task_analysis',
      description: 'Analyzes task descriptions to understand requirements and scope',
      allowedTools: ['Read'],
      filePatterns: ['**/*.md', '**/*.txt'],
    },
    {
      name: 'plan_generation',
      description: 'Generates structured execution plans with agent and skill assignments',
      allowedTools: ['Write'],
      filePatterns: ['.cdm/**/*.json'],
    },
  ],
  maxTokenBudget: 15000,
  allowedFilePatterns: ['docs/**', '**/*.md'],
  blockedFilePatterns: ['src/**', 'test/**'],
  compatibleSkills: ['requirements-analysis', 'task-decomposition'],
  requiredInputArtifacts: [],
  outputArtifacts: [ArtifactType.EXECUTION_PLAN, ArtifactType.REQUIREMENTS_DOC],
};

export class PlannerAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(PLANNER_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Analyzing task and creating execution plan', task.step);

    const sections: string[] = [];
    sections.push('# Task Analysis and Execution Plan\n');

    const taskDescription = task.description;
    const taskType = this.classifyTask(taskDescription);

    sections.push(`## Task Classification\n`);
    sections.push(`- **Type**: ${taskType}`);
    sections.push(`- **Description**: ${task.title}`);

    const plan = this.generateExecutionPlan(taskType, taskDescription, task.featureId);

    sections.push('\n## Execution Plan\n');
    sections.push(`**Template**: ${plan.templateId}`);
    sections.push(`**Reasoning**: ${plan.reasoning}\n`);

    sections.push('### Steps\n');
    for (const step of plan.steps) {
      const deps = step.dependsOn?.length ? ` (depends on: ${step.dependsOn.join(', ')})` : '';
      const skip = step.canSkip ? ' [skippable]' : '';
      sections.push(`${step.index}. **${this.formatAgentName(step.agent)}** [${step.skills.join(', ')}]${deps}${skip}`);
      sections.push(`   - ${step.description}`);
      if (step.gateCondition) {
        sections.push(`   - Gate: ${step.gateCondition}`);
      }
    }

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: execution_plan');
    sections.push('Name: Execution Plan');
    sections.push('Description: Structured execution plan for the task');
    sections.push('Content:');
    sections.push(JSON.stringify(plan, null, 2));
    sections.push('---ARTIFACT_END---\n');

    agentLog(this.role, `Created execution plan with ${plan.steps.length} steps`, task.step);
    return sections.join('\n');
  }

  protected async produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]> {
    const artifacts: Artifact[] = [];

    const planMatch = output.match(/---ARTIFACT_START---[\s\S]*?Content:\s*([\s\S]*?)---ARTIFACT_END---/);
    if (planMatch) {
      try {
        const planJson = planMatch[1].trim();
        const plan = JSON.parse(planJson) as ExecutionPlan;

        const artifact: Artifact = {
          id: uuidv4(),
          type: ArtifactType.EXECUTION_PLAN,
          name: 'Execution Plan',
          description: `Execution plan for: ${task.title}`,
          filePath: `.cdm/plans/${task.featureId}/execution-plan.json`,
          createdBy: this.role,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
          content: planJson,
          metadata: {
            taskId: task.id,
            featureId: task.featureId,
            templateId: plan.templateId,
            stepCount: plan.steps.length,
          },
          status: ArtifactStatus.DRAFT,
          reviewStatus: ReviewStatus.PENDING,
        };
        this.artifactStore.store(artifact);
        artifacts.push(artifact);
      } catch {
        agentLog(this.role, 'Failed to parse execution plan JSON', task.step, 'warn');
      }
    }

    return artifacts;
  }

  protected async identifyIssues(_task: AgentTask, _output: string): Promise<Issue[]> {
    return [];
  }

  classifyTask(description: string): string {
    const desc = description.toLowerCase();

    if (/\b(fix|bug|typo|error|broken|crash|issue)\b/.test(desc)) {
      return 'bugfix';
    }
    if (/\b(refactor|clean|reorganize|restructure|simplify)\b/.test(desc)) {
      return 'refactor';
    }
    if (/\b(review|audit|assess|evaluate|check)\b/.test(desc)) {
      return 'review';
    }
    if (/\b(deploy|release|ship|publish|launch)\b/.test(desc)) {
      return 'deploy';
    }
    if (/\b(design|architect|plan|spec|rfc)\b/.test(desc)) {
      return 'design';
    }
    if (/\b(test|coverage|e2e|integration)\b/.test(desc)) {
      return 'testing';
    }

    return 'feature';
  }

  generateExecutionPlan(
    taskType: string,
    description: string,
    _featureId: string,
  ): ExecutionPlan {
    const steps = this.getStepsForTaskType(taskType, description);

    return {
      id: uuidv4(),
      taskType,
      templateId: this.getTemplateIdForTaskType(taskType),
      steps,
      reasoning: this.getReasoningForTaskType(taskType),
    };
  }

  private getTemplateIdForTaskType(taskType: string): string {
    const mapping: Record<string, string> = {
      bugfix: 'quick-fix',
      refactor: 'quick-fix',
      feature: 'feature',
      review: 'review-only',
      deploy: 'deploy',
      design: 'design-only',
      testing: 'feature',
    };
    return mapping[taskType] || 'feature';
  }

  private getReasoningForTaskType(taskType: string): string {
    const reasoning: Record<string, string> = {
      bugfix: 'Simple fix requiring implementation and review only',
      refactor: 'Code improvement requiring implementation and review',
      feature: 'New functionality requiring design, implementation, and review',
      review: 'Assessment task requiring review skills only',
      deploy: 'Deployment task requiring operations skills',
      design: 'Design exploration requiring planning and architecture',
      testing: 'Testing task requiring implementation of tests and validation',
    };
    return reasoning[taskType] || 'Standard feature development workflow';
  }

  private getStepsForTaskType(taskType: string, description: string): ExecutionStep[] {
    switch (taskType) {
      case 'bugfix':
      case 'refactor':
        return [
          {
            index: 0,
            agent: AgentRole.DEVELOPER,
            skills: ['code-implementation'],
            description: 'Implement the fix following project conventions',
            gateCondition: 'hasArtifact:source_code',
          },
          {
            index: 1,
            agent: AgentRole.REVIEWER,
            skills: ['code-review'],
            description: 'Review the changes for correctness and quality',
            dependsOn: [0],
            gateCondition: 'noCriticalIssues',
          },
        ];

      case 'review':
        return [
          {
            index: 0,
            agent: AgentRole.REVIEWER,
            skills: this.selectReviewSkills(description),
            description: 'Perform comprehensive review',
            gateCondition: 'hasArtifact:code_review_report',
          },
        ];

      case 'deploy':
        return [
          {
            index: 0,
            agent: AgentRole.OPERATOR,
            skills: ['ci-cd', 'deployment', 'monitoring'],
            description: 'Configure deployment pipeline and infrastructure',
            gateCondition: 'hasArtifact:deployment_plan',
          },
        ];

      case 'design':
        return [
          {
            index: 0,
            agent: AgentRole.PLANNER,
            skills: ['requirements-analysis'],
            description: 'Analyze and document requirements',
            gateCondition: 'hasArtifact:requirements_doc',
          },
          {
            index: 1,
            agent: AgentRole.ARCHITECT,
            skills: this.selectDesignSkills(description),
            description: 'Create system design and architecture',
            dependsOn: [0],
            gateCondition: 'hasArtifact:architecture_doc',
          },
        ];

      case 'feature':
      default:
        return [
          {
            index: 0,
            agent: AgentRole.PLANNER,
            skills: ['requirements-analysis'],
            description: 'Analyze requirements and acceptance criteria',
            gateCondition: 'hasArtifact:requirements_doc',
          },
          {
            index: 1,
            agent: AgentRole.ARCHITECT,
            skills: this.selectDesignSkills(description),
            description: 'Design system architecture',
            dependsOn: [0],
            gateCondition: 'hasArtifact:architecture_doc',
          },
          {
            index: 2,
            agent: AgentRole.DEVELOPER,
            skills: ['code-implementation', 'test-writing'],
            description: 'Implement feature with tests',
            dependsOn: [1],
            gateCondition: 'hasArtifact:source_code',
          },
          {
            index: 3,
            agent: AgentRole.REVIEWER,
            skills: ['code-review'],
            description: 'Review implementation quality',
            dependsOn: [2],
            gateCondition: 'noCriticalIssues',
          },
        ];
    }
  }

  private selectDesignSkills(description: string): string[] {
    const skills: string[] = ['system-design'];
    const desc = description.toLowerCase();

    if (/\b(api|endpoint|rest|graphql|grpc)\b/.test(desc)) {
      skills.push('api-design');
    }
    if (/\b(database|schema|model|table|migration)\b/.test(desc)) {
      skills.push('data-modeling');
    }
    if (/\b(ui|ux|interface|screen|page|component|button)\b/.test(desc)) {
      skills.push('ui-design');
    }

    return skills;
  }

  private selectReviewSkills(description: string): string[] {
    const skills: string[] = ['code-review'];
    const desc = description.toLowerCase();

    if (/\b(security|vulnerability|auth|permission)\b/.test(desc)) {
      skills.push('security-audit');
    }
    if (/\b(performance|speed|latency|load)\b/.test(desc)) {
      skills.push('performance-analysis');
    }
    if (/\b(accessibility|a11y|wcag|screen.?reader)\b/.test(desc)) {
      skills.push('accessibility-audit');
    }
    if (/\b(test|coverage|quality)\b/.test(desc)) {
      skills.push('test-validation');
    }

    return skills;
  }

  private formatAgentName(role: AgentRole): string {
    const names: Record<AgentRole, string> = {
      [AgentRole.PLANNER]: 'Planner',
      [AgentRole.ARCHITECT]: 'Architect',
      [AgentRole.DEVELOPER]: 'Developer',
      [AgentRole.REVIEWER]: 'Reviewer',
      [AgentRole.OPERATOR]: 'Operator',
    };
    return names[role] || role;
  }
}
