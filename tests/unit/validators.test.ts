import { describe, it, expect } from 'bun:test';
import {
  validateArtifact,
  validateFeatureDescription,
  areRequiredArtifactsPresent,
  hasBlockingIssues,
  validatePersonaId,
} from '../../src/utils/validators';
import {
  Artifact,
  ArtifactType,
  ArtifactStatus,
  ReviewStatus,
  Issue,
  IssueSeverity,
  IssueType,
  IssueStatus,
} from '../../src/types';

function createTestArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'test-artifact-1',
    type: ArtifactType.REQUIREMENTS_DOC,
    name: 'Test Requirements',
    description: 'Test requirements document',
    filePath: 'test/requirements.md',
    createdBy: 'software-engineer',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    content: 'This is the test content for the requirements document.',
    metadata: {},
    status: ArtifactStatus.DRAFT,
    reviewStatus: ReviewStatus.PENDING,
    ...overrides,
  };
}

function createTestIssue(severity: IssueSeverity): Issue {
  return {
    id: 'test-issue-1',
    featureId: 'test-feature-1',
    type: IssueType.BUG,
    severity,
    title: 'Test Issue',
    description: 'Test issue description',
    reportedBy: 'code-reviewer',
    step: 'main',
    status: IssueStatus.OPEN,
    createdAt: new Date(),
  };
}

describe('Validators', () => {
  describe('validateArtifact', () => {
    it('should return no errors for a valid artifact', () => {
      const artifact = createTestArtifact();
      const errors = validateArtifact(artifact);
      expect(errors).toHaveLength(0);
    });

    it('should return error for missing id', () => {
      const artifact = createTestArtifact({ id: '' });
      const errors = validateArtifact(artifact);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.field === 'id')).toBe(true);
    });

    it('should return error for missing name', () => {
      const artifact = createTestArtifact({ name: '' });
      const errors = validateArtifact(artifact);
      expect(errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('should return error for empty content', () => {
      const artifact = createTestArtifact({ content: '' });
      const errors = validateArtifact(artifact);
      expect(errors.some((e) => e.field === 'content')).toBe(true);
    });

    it('should return error for invalid artifact type', () => {
      const artifact = createTestArtifact({ type: 'invalid_type' as ArtifactType });
      const errors = validateArtifact(artifact);
      expect(errors.some((e) => e.field === 'type')).toBe(true);
    });

    it('should return error for missing createdBy persona ID', () => {
      const artifact = createTestArtifact({ createdBy: '' });
      const errors = validateArtifact(artifact);
      expect(errors.some((e) => e.field === 'createdBy')).toBe(true);
    });
  });

  describe('validateFeatureDescription', () => {
    it('should accept a valid description', () => {
      const errors = validateFeatureDescription('Add user authentication with JWT tokens');
      expect(errors).toHaveLength(0);
    });

    it('should reject empty description', () => {
      const errors = validateFeatureDescription('');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject too-short description', () => {
      const errors = validateFeatureDescription('fix bug');
      expect(errors.some((e) => e.message.includes('too short'))).toBe(true);
    });
  });

  describe('areRequiredArtifactsPresent', () => {
    it('should return satisfied when all artifacts present', () => {
      const required = [ArtifactType.REQUIREMENTS_DOC, ArtifactType.USER_STORIES];
      const available = [
        createTestArtifact({ type: ArtifactType.REQUIREMENTS_DOC }),
        createTestArtifact({ type: ArtifactType.USER_STORIES }),
      ];
      const result = areRequiredArtifactsPresent(required, available);
      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should return unsatisfied with missing artifacts', () => {
      const required = [ArtifactType.REQUIREMENTS_DOC, ArtifactType.USER_STORIES];
      const available = [createTestArtifact({ type: ArtifactType.REQUIREMENTS_DOC })];
      const result = areRequiredArtifactsPresent(required, available);
      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain(ArtifactType.USER_STORIES);
    });

    it('should return satisfied for empty requirements', () => {
      const result = areRequiredArtifactsPresent([], []);
      expect(result.satisfied).toBe(true);
    });
  });

  describe('hasBlockingIssues', () => {
    it('should return true when critical issues exist', () => {
      const issues = [createTestIssue(IssueSeverity.CRITICAL)];
      expect(hasBlockingIssues(issues)).toBe(true);
    });

    it('should return true when high severity issues exist', () => {
      const issues = [createTestIssue(IssueSeverity.HIGH)];
      expect(hasBlockingIssues(issues)).toBe(true);
    });

    it('should return false when only low severity issues exist', () => {
      const issues = [createTestIssue(IssueSeverity.LOW)];
      expect(hasBlockingIssues(issues)).toBe(false);
    });

    it('should return false for empty issues array', () => {
      expect(hasBlockingIssues([])).toBe(false);
    });

    it('should return false when only medium severity issues exist', () => {
      const issues = [createTestIssue(IssueSeverity.MEDIUM)];
      expect(hasBlockingIssues(issues)).toBe(false);
    });
  });

  describe('validatePersonaId', () => {
    it('should return no errors for a valid persona ID', () => {
      const errors = validatePersonaId('software-engineer');
      expect(errors).toHaveLength(0);
    });

    it('should return no errors for persona ID with numbers', () => {
      const errors = validatePersonaId('senior-dev-2');
      expect(errors).toHaveLength(0);
    });

    it('should return error for empty persona ID', () => {
      const errors = validatePersonaId('');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.field === 'personaId')).toBe(true);
    });

    it('should return error for persona ID with uppercase', () => {
      const errors = validatePersonaId('Software-Engineer');
      expect(errors.some((e) => e.message.includes('lowercase'))).toBe(true);
    });

    it('should return error for persona ID with spaces', () => {
      const errors = validatePersonaId('software engineer');
      expect(errors.some((e) => e.field === 'personaId')).toBe(true);
    });

    it('should return error for persona ID with special characters', () => {
      const errors = validatePersonaId('software_engineer');
      expect(errors.some((e) => e.field === 'personaId')).toBe(true);
    });
  });
});
