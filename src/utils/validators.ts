/**
 * Validation utilities for CDM.
 * Refactored for dynamic persona system.
 */

import {
  type Artifact,
  ArtifactType,
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
  if (!artifact.createdBy || artifact.createdBy.trim().length === 0) {
    errors.push(new ValidationError('Creator persona ID is required', 'createdBy', artifact.createdBy));
  }
  if (!artifact.content || artifact.content.trim().length === 0) {
    errors.push(new ValidationError('Artifact content cannot be empty', 'content', ''));
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

export function hasBlockingIssues(issues: Issue[]): boolean {
  return issues.some(
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

export function validatePersonaId(personaId: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!personaId || personaId.trim().length === 0) {
    errors.push(new ValidationError('Persona ID is required', 'personaId', personaId));
  }

  if (personaId && !/^[a-z0-9-]+$/.test(personaId)) {
    errors.push(new ValidationError(
      'Persona ID must contain only lowercase letters, numbers, and hyphens',
      'personaId',
      personaId,
    ));
  }

  return errors;
}
