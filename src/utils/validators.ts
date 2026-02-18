import {
  type Artifact,
  ArtifactType,
  AgentRole,
  PipelineStage,
  type Feature,
  type StageResult,
  StageStatus,
  type HandoffPayload,
  type Issue,
  IssueSeverity,
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
  if (!Object.values(PipelineStage).includes(handoff.stage)) {
    errors.push(new ValidationError('Invalid pipeline stage', 'stage', handoff.stage));
  }
  if (!handoff.context || handoff.context.trim().length === 0) {
    errors.push(new ValidationError('Handoff context is required', 'context', ''));
  }
  if (!handoff.instructions || handoff.instructions.trim().length === 0) {
    errors.push(new ValidationError('Handoff instructions are required', 'instructions', ''));
  }

  return errors;
}

export function validateStageTransition(
  feature: Feature,
  from: PipelineStage,
  to: PipelineStage,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const stageOrder = Object.values(PipelineStage);
  const fromIndex = stageOrder.indexOf(from);
  const toIndex = stageOrder.indexOf(to);

  if (fromIndex === -1) {
    errors.push(new ValidationError('Invalid source stage', 'from', from));
  }
  if (toIndex === -1) {
    errors.push(new ValidationError('Invalid target stage', 'to', to));
  }
  if (toIndex > fromIndex + 1) {
    errors.push(new ValidationError(
      `Cannot skip stages: ${from} -> ${to}. Stages in between must be completed or explicitly skipped.`,
      'transition',
      `${from}->${to}`,
    ));
  }

  const currentResult = feature.stageResults.get(from);
  if (currentResult && currentResult.status !== StageStatus.APPROVED && currentResult.status !== StageStatus.SKIPPED) {
    errors.push(new ValidationError(
      `Current stage ${from} must be approved before transitioning`,
      'stageStatus',
      currentResult.status,
    ));
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

export function hasBlockingIssues(stageResult: StageResult): boolean {
  return stageResult.issues.some(
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
