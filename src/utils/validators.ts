import {
  type Artifact,
  ArtifactType,
  AgentRole,
  type StepResult,
  type HandoffPayload,
  type Issue,
  IssueSeverity,
  type ExecutionStep,
  type ExecutionPlan,
} from '../types';

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateArtifact(artifact: Artifact): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!artifact.id || artifact.id.trim().length === 0) {
    errors.push(new ValidationError('Artifact ID is required', 'id', artifact.id));
  }
  if (!artifact.name || artifact.name.trim().length === 0) {
    errors.push(new ValidationError('Artifact name is required', 'name', artifact.name));
  }
  if (!Object.values(ArtifactType).includes(artifact.type)) {
    errors.push(new ValidationError('Invalid artifact type', 'type', artifact.type));
  }
  if (!Object.values(AgentRole).includes(artifact.createdBy)) {
    errors.push(new ValidationError('Invalid creator role', 'createdBy', artifact.createdBy));
  }
  if (!artifact.content || artifact.content.trim().length === 0) {
    errors.push(new ValidationError('Artifact content cannot be empty', 'content', ''));
  }

  return errors;
}

export function validateHandoff(handoff: HandoffPayload): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!Object.values(AgentRole).includes(handoff.fromAgent)) {
    errors.push(new ValidationError('Invalid source agent', 'fromAgent', handoff.fromAgent));
  }
  if (!Object.values(AgentRole).includes(handoff.toAgent)) {
    errors.push(new ValidationError('Invalid target agent', 'toAgent', handoff.toAgent));
  }
  if (handoff.fromAgent === handoff.toAgent) {
    errors.push(new ValidationError('Cannot hand off to the same agent', 'toAgent', handoff.toAgent));
  }
  if (!handoff.step || handoff.step.trim().length === 0) {
    errors.push(new ValidationError('Step identifier is required', 'step', handoff.step));
  }
  if (!handoff.context || handoff.context.trim().length === 0) {
    errors.push(new ValidationError('Handoff context is required', 'context', ''));
  }
  if (!handoff.instructions || handoff.instructions.trim().length === 0) {
    errors.push(new ValidationError('Handoff instructions are required', 'instructions', ''));
  }

  return errors;
}

export function validateStepTransition(
  plan: ExecutionPlan,
  fromStepIndex: number,
  toStepIndex: number,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (fromStepIndex < 0 || fromStepIndex >= plan.steps.length) {
    errors.push(new ValidationError('Invalid source step index', 'fromStepIndex', fromStepIndex));
  }
  if (toStepIndex < 0 || toStepIndex >= plan.steps.length) {
    errors.push(new ValidationError('Invalid target step index', 'toStepIndex', toStepIndex));
  }

  const fromStep = plan.steps[fromStepIndex];
  const toStep = plan.steps[toStepIndex];

  if (fromStep && toStep && toStep.dependsOn) {
    const unmetDependencies = toStep.dependsOn.filter(depIdx => {
      const depStep = plan.steps[depIdx];
      return depStep && (depStep as any).status !== 'completed';
    });

    if (unmetDependencies.length > 0) {
      errors.push(new ValidationError(
        `Cannot transition to step ${toStepIndex}: unmet dependencies at steps ${unmetDependencies.join(', ')}`,
        'dependencies',
        unmetDependencies,
      ));
    }
  }

  return errors;
}

export function validateExecutionStep(step: ExecutionStep): ValidationError[] {
  const errors: ValidationError[] = [];

  if (step.index < 0) {
    errors.push(new ValidationError('Step index must be non-negative', 'index', step.index));
  }
  if (!Object.values(AgentRole).includes(step.agent)) {
    errors.push(new ValidationError('Invalid agent role', 'agent', step.agent));
  }
  if (!step.skills || step.skills.length === 0) {
    errors.push(new ValidationError('Step must have at least one skill', 'skills', step.skills));
  }
  if (!step.description || step.description.trim().length === 0) {
    errors.push(new ValidationError('Step description is required', 'description', step.description));
  }

  return errors;
}

export function validateFeatureDescription(description: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!description || description.trim().length === 0) {
    errors.push(new ValidationError('Feature description is required', 'description', ''));
  }
  if (description && description.trim().length < 10) {
    errors.push(new ValidationError(
      'Feature description is too short. Please provide at least 10 characters.',
      'description',
      description,
    ));
  }

  return errors;
}

export function hasBlockingIssues(stepResult: StepResult): boolean {
  return stepResult.issues.some(
    (issue: Issue) =>
      issue.severity === IssueSeverity.CRITICAL ||
      issue.severity === IssueSeverity.HIGH,
  );
}

export function areRequiredArtifactsPresent(
  requiredTypes: ArtifactType[],
  availableArtifacts: Artifact[],
): { satisfied: boolean; missing: ArtifactType[] } {
  const availableTypes = new Set(availableArtifacts.map((a) => a.type));
  const missing = requiredTypes.filter((t) => !availableTypes.has(t));
  return {
    satisfied: missing.length === 0,
    missing,
  };
}
