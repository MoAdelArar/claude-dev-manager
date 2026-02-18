import {
  validateArtifact,
  validateHandoff,
  validateFeatureDescription,
  areRequiredArtifactsPresent,
  hasBlockingIssues,
  ValidationError,
} from '../../src/utils/validators';
import {
  Artifact,
  ArtifactType,
  ArtifactStatus,
  ReviewStatus,
  AgentRole,
  PipelineStage,
  HandoffPayload,
  StageResult,
  StageStatus,
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
    createdBy: AgentRole.PRODUCT_MANAGER,
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
    reportedBy: AgentRole.QA_ENGINEER,
    stage: PipelineStage.TESTING,
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

    it('should return error for invalid creator role', () => {
      const artifact = createTestArtifact({ createdBy: 'invalid_role' as AgentRole });
      const errors = validateArtifact(artifact);
      expect(errors.some((e) => e.field === 'createdBy')).toBe(true);
    });
  });

  describe('validateHandoff', () => {
    const validHandoff: HandoffPayload = {
      fromAgent: AgentRole.PRODUCT_MANAGER,
      toAgent: AgentRole.ENGINEERING_MANAGER,
      stage: PipelineStage.REQUIREMENTS_GATHERING,
      context: 'Requirements complete, handing off for task breakdown',
      artifacts: [createTestArtifact()],
      instructions: 'Please review requirements and create task breakdown',
      constraints: ['Follow sprint capacity limits'],
    };

    it('should return no errors for a valid handoff', () => {
      const errors = validateHandoff(validHandoff);
      expect(errors).toHaveLength(0);
    });

    it('should return error when handing off to same agent', () => {
      const handoff = { ...validHandoff, toAgent: AgentRole.PRODUCT_MANAGER };
      const errors = validateHandoff(handoff);
      expect(errors.some((e) => e.field === 'toAgent')).toBe(true);
    });

    it('should return error for missing context', () => {
      const handoff = { ...validHandoff, context: '' };
      const errors = validateHandoff(handoff);
      expect(errors.some((e) => e.field === 'context')).toBe(true);
    });

    it('should return error for missing instructions', () => {
      const handoff = { ...validHandoff, instructions: '' };
      const errors = validateHandoff(handoff);
      expect(errors.some((e) => e.field === 'instructions')).toBe(true);
    });

    it('should return error for invalid agent roles', () => {
      const handoff = { ...validHandoff, fromAgent: 'invalid' as AgentRole };
      const errors = validateHandoff(handoff);
      expect(errors.some((e) => e.field === 'fromAgent')).toBe(true);
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
      const stageResult: StageResult = {
        stage: PipelineStage.TESTING,
        status: StageStatus.IN_PROGRESS,
        startedAt: new Date(),
        agentResults: [],
        artifacts: [],
        issues: [createTestIssue(IssueSeverity.CRITICAL)],
        metrics: { tokensUsed: 0, durationMs: 0, retryCount: 0, artifactsProduced: 0, issuesFound: 1, issuesResolved: 0 },
      };
      expect(hasBlockingIssues(stageResult)).toBe(true);
    });

    it('should return true when high severity issues exist', () => {
      const stageResult: StageResult = {
        stage: PipelineStage.TESTING,
        status: StageStatus.IN_PROGRESS,
        startedAt: new Date(),
        agentResults: [],
        artifacts: [],
        issues: [createTestIssue(IssueSeverity.HIGH)],
        metrics: { tokensUsed: 0, durationMs: 0, retryCount: 0, artifactsProduced: 0, issuesFound: 1, issuesResolved: 0 },
      };
      expect(hasBlockingIssues(stageResult)).toBe(true);
    });

    it('should return false when only low severity issues exist', () => {
      const stageResult: StageResult = {
        stage: PipelineStage.TESTING,
        status: StageStatus.IN_PROGRESS,
        startedAt: new Date(),
        agentResults: [],
        artifacts: [],
        issues: [createTestIssue(IssueSeverity.LOW)],
        metrics: { tokensUsed: 0, durationMs: 0, retryCount: 0, artifactsProduced: 0, issuesFound: 1, issuesResolved: 0 },
      };
      expect(hasBlockingIssues(stageResult)).toBe(false);
    });
  });
});
