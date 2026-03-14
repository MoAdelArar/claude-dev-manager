import {
  type PipelineTemplate,
  type ExecutionStep,
  AgentRole,
} from '../types';

export type { PipelineTemplate } from '../types';

// ─── Template Definitions ────────────────────────────────────────────────────

export const QUICK_FIX_TEMPLATE: PipelineTemplate = {
  id: 'quick-fix',
  name: 'Quick Fix',
  description: 'Simple fix requiring implementation and review only. For bugs, typos, and small tweaks.',
  applicableWhen: 'Task involves fixing a bug, typo, or making a small change',
  steps: [
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
  ],
};

export const FEATURE_TEMPLATE: PipelineTemplate = {
  id: 'feature',
  name: 'Feature',
  description: 'Standard feature development with design, implementation, and review.',
  applicableWhen: 'Task involves building a new feature or significant enhancement',
  steps: [
    {
      index: 0,
      agent: AgentRole.PLANNER,
      skills: ['requirements-analysis'],
      description: 'Analyze requirements and define acceptance criteria',
      gateCondition: 'hasArtifact:requirements_doc',
    },
    {
      index: 1,
      agent: AgentRole.ARCHITECT,
      skills: ['system-design', 'api-design'],
      description: 'Design system architecture and API contracts',
      dependsOn: [0],
      gateCondition: 'hasArtifact:architecture_doc',
    },
    {
      index: 2,
      agent: AgentRole.DEVELOPER,
      skills: ['code-implementation', 'test-writing'],
      description: 'Implement feature with comprehensive tests',
      dependsOn: [1],
      gateCondition: 'hasArtifact:source_code',
    },
    {
      index: 3,
      agent: AgentRole.REVIEWER,
      skills: ['code-review'],
      description: 'Review implementation for quality and correctness',
      dependsOn: [2],
      gateCondition: 'noCriticalIssues',
    },
  ],
};

export const FULL_FEATURE_TEMPLATE: PipelineTemplate = {
  id: 'full-feature',
  name: 'Full Feature',
  description: 'Complete feature development including security review and deployment.',
  applicableWhen: 'Task involves features touching auth, payments, or requiring deployment',
  steps: [
    {
      index: 0,
      agent: AgentRole.PLANNER,
      skills: ['requirements-analysis'],
      description: 'Analyze requirements and define acceptance criteria',
      gateCondition: 'hasArtifact:requirements_doc',
    },
    {
      index: 1,
      agent: AgentRole.ARCHITECT,
      skills: ['system-design', 'api-design', 'data-modeling'],
      description: 'Design system architecture, APIs, and data model',
      dependsOn: [0],
      gateCondition: 'hasArtifact:architecture_doc',
    },
    {
      index: 2,
      agent: AgentRole.DEVELOPER,
      skills: ['code-implementation', 'test-writing', 'documentation'],
      description: 'Implement feature with tests and documentation',
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
    {
      index: 4,
      agent: AgentRole.REVIEWER,
      skills: ['security-audit'],
      description: 'Perform security audit',
      dependsOn: [3],
      canSkip: true,
      gateCondition: 'noCriticalIssues',
    },
    {
      index: 5,
      agent: AgentRole.OPERATOR,
      skills: ['deployment', 'monitoring'],
      description: 'Configure deployment and monitoring',
      dependsOn: [4],
      canSkip: true,
      gateCondition: 'hasArtifact:deployment_plan',
    },
  ],
};

export const REVIEW_ONLY_TEMPLATE: PipelineTemplate = {
  id: 'review-only',
  name: 'Review Only',
  description: 'Comprehensive review without implementation. For audits and assessments.',
  applicableWhen: 'Task is a review, audit, or assessment',
  steps: [
    {
      index: 0,
      agent: AgentRole.REVIEWER,
      skills: ['code-review', 'security-audit', 'performance-analysis'],
      description: 'Perform comprehensive multi-lens review',
      gateCondition: 'hasArtifact:code_review_report',
    },
  ],
};

export const DESIGN_ONLY_TEMPLATE: PipelineTemplate = {
  id: 'design-only',
  name: 'Design Only',
  description: 'Architecture exploration without implementation. For design spikes and RFCs.',
  applicableWhen: 'Task is a design exploration, architecture spike, or RFC',
  steps: [
    {
      index: 0,
      agent: AgentRole.PLANNER,
      skills: ['requirements-analysis'],
      description: 'Gather and analyze requirements',
      gateCondition: 'hasArtifact:requirements_doc',
    },
    {
      index: 1,
      agent: AgentRole.ARCHITECT,
      skills: ['system-design', 'data-modeling'],
      description: 'Create system design and data model',
      dependsOn: [0],
      gateCondition: 'hasArtifact:architecture_doc',
    },
  ],
};

export const DEPLOY_TEMPLATE: PipelineTemplate = {
  id: 'deploy',
  name: 'Deploy',
  description: 'Deployment configuration for existing code. For shipping releases.',
  applicableWhen: 'Task is to deploy, release, or ship existing code',
  steps: [
    {
      index: 0,
      agent: AgentRole.OPERATOR,
      skills: ['ci-cd', 'deployment', 'monitoring'],
      description: 'Configure CI/CD, deployment, and monitoring',
      gateCondition: 'hasArtifact:deployment_plan',
    },
  ],
};

// ─── Template Registry ───────────────────────────────────────────────────────

const ALL_TEMPLATES: PipelineTemplate[] = [
  QUICK_FIX_TEMPLATE,
  FEATURE_TEMPLATE,
  FULL_FEATURE_TEMPLATE,
  REVIEW_ONLY_TEMPLATE,
  DESIGN_ONLY_TEMPLATE,
  DEPLOY_TEMPLATE,
];

const TEMPLATE_MAP: Map<string, PipelineTemplate> = new Map(
  ALL_TEMPLATES.map((t) => [t.id, t]),
);

export function getTemplate(id: string): PipelineTemplate | undefined {
  return TEMPLATE_MAP.get(id);
}

export function getTemplateOrThrow(id: string): PipelineTemplate {
  const template = TEMPLATE_MAP.get(id);
  if (!template) {
    throw new Error(`Unknown template: ${id}. Available: ${Array.from(TEMPLATE_MAP.keys()).join(', ')}`);
  }
  return template;
}

export function getAllTemplates(): PipelineTemplate[] {
  return [...ALL_TEMPLATES];
}

export function getTemplateIds(): string[] {
  return Array.from(TEMPLATE_MAP.keys());
}

// ─── Template Matching ───────────────────────────────────────────────────────

interface TemplateMatch {
  template: PipelineTemplate;
  confidence: number;
  reason: string;
}

export function matchTemplate(description: string): TemplateMatch {
  const desc = description.toLowerCase();

  if (/\b(fix|bug|typo|error|broken|crash|hotfix|patch)\b/.test(desc)) {
    return {
      template: QUICK_FIX_TEMPLATE,
      confidence: 0.9,
      reason: 'Task mentions fix, bug, or error',
    };
  }

  if (/\b(deploy|release|ship|publish|launch|rollout)\b/.test(desc)) {
    return {
      template: DEPLOY_TEMPLATE,
      confidence: 0.9,
      reason: 'Task mentions deployment or release',
    };
  }

  if (/\b(review|audit|assess|evaluate|check|analyze|inspect)\b/.test(desc)) {
    if (!/\b(implement|build|create|add|feature)\b/.test(desc)) {
      return {
        template: REVIEW_ONLY_TEMPLATE,
        confidence: 0.8,
        reason: 'Task is a review or audit',
      };
    }
  }

  if (/\b(design|architect|plan|spec|rfc|explore|spike)\b/.test(desc)) {
    if (!/\b(implement|build|code)\b/.test(desc)) {
      return {
        template: DESIGN_ONLY_TEMPLATE,
        confidence: 0.8,
        reason: 'Task is a design exploration',
      };
    }
  }

  if (/\b(auth|login|password|security|payment|billing|sensitive|encrypt)\b/.test(desc)) {
    return {
      template: FULL_FEATURE_TEMPLATE,
      confidence: 0.85,
      reason: 'Task involves security-sensitive functionality',
    };
  }

  return {
    template: FEATURE_TEMPLATE,
    confidence: 0.7,
    reason: 'Default template for feature development',
  };
}

export function matchTemplateByKeywords(keywords: string[]): TemplateMatch {
  return matchTemplate(keywords.join(' '));
}

// ─── Template Customization ──────────────────────────────────────────────────

export function customizeTemplate(
  baseTemplate: PipelineTemplate,
  modifications: {
    addSteps?: ExecutionStep[];
    removeStepIndices?: number[];
    modifyStep?: { index: number; changes: Partial<ExecutionStep> };
  },
): PipelineTemplate {
  let steps = [...baseTemplate.steps];

  if (modifications.removeStepIndices) {
    steps = steps.filter((s) => !modifications.removeStepIndices!.includes(s.index));
  }

  if (modifications.modifyStep) {
    const { index, changes } = modifications.modifyStep;
    steps = steps.map((s) => (s.index === index ? { ...s, ...changes } : s));
  }

  if (modifications.addSteps) {
    steps = [...steps, ...modifications.addSteps];
  }

  steps = steps.map((s, i) => ({ ...s, index: i }));

  return {
    ...baseTemplate,
    id: `${baseTemplate.id}-custom`,
    name: `${baseTemplate.name} (Custom)`,
    steps,
  };
}

// ─── Template Validation ─────────────────────────────────────────────────────

export function validateTemplate(template: PipelineTemplate): string[] {
  const errors: string[] = [];

  if (!template.id) {
    errors.push('Template must have an id');
  }

  if (!template.name) {
    errors.push('Template must have a name');
  }

  if (!template.steps || template.steps.length === 0) {
    errors.push('Template must have at least one step');
  }

  const indices = new Set<number>();
  for (const step of template.steps) {
    if (indices.has(step.index)) {
      errors.push(`Duplicate step index: ${step.index}`);
    }
    indices.add(step.index);

    if (step.dependsOn) {
      for (const dep of step.dependsOn) {
        if (!indices.has(dep) && dep >= step.index) {
          errors.push(`Step ${step.index} depends on non-existent or future step ${dep}`);
        }
      }
    }
  }

  return errors;
}
