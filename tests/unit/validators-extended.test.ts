import {
  validateArtifact,
  validateHandoff,
  validateStageTransition,
  validateFeatureDescription,
  hasBlockingIssues,
  areRequiredArtifactsPresent,
  ValidationError,
} from '../../src/utils/validators';
import {
  type Artifact,
  type Feature,
  type StageResult,
  type HandoffPayload,
  type Issue,
  ArtifactType,
  ArtifactStatus,
  ReviewStatus,
  AgentRole,
  PipelineStage,
  StageStatus,
  IssueSeverity,
  IssueType,
  IssueStatus,
  FeatureStatus,
  FeaturePriority,
} from '../../src/types';

function createArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'art-1',
    type: ArtifactType.REQUIREMENTS_DOC,
    name: 'Test Artifact',
    description: 'A test artifact',
    filePath: 'test/artifact.md',
    createdBy: AgentRole.PRODUCT_MANAGER,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    content: 'Non-empty artifact content for validation tests.',
    metadata: {},
    status: ArtifactStatus.DRAFT,
    reviewStatus: ReviewStatus.PENDING,
    ...overrides,
  };
}

function createHandoff(overrides: Partial<HandoffPayload> = {}): HandoffPayload {
  return {
    fromAgent: AgentRole.PRODUCT_MANAGER,
    toAgent: AgentRole.ENGINEERING_MANAGER,
    stage: PipelineStage.REQUIREMENTS_GATHERING,
    context: 'Handing off requirements to engineering',
    artifacts: [createArtifact()],
    instructions: 'Please review and break down into tasks',
    constraints: ['Follow sprint limits'],
    ...overrides,
  };
}

function createFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    projectId: 'proj-1',
    name: 'Test Feature',
    description: 'Test feature description for validation',
    requestedBy: 'tester',
    createdAt: new Date(),
    updatedAt: new Date(),
    currentStage: PipelineStage.REQUIREMENTS_GATHERING,
    stageResults: new Map(),
    artifacts: [],
    issues: [],
    status: FeatureStatus.IN_PROGRESS,
    priority: FeaturePriority.HIGH,
    metadata: {},
    ...overrides,
  };
}

function createIssue(severity: IssueSeverity): Issue {
  return {
    id: 'iss-1',
    featureId: 'feat-1',
    type: IssueType.BUG,
    severity,
    title: 'Test Issue',
    description: 'A test issue',
    reportedBy: AgentRole.QA_ENGINEER,
    stage: PipelineStage.TESTING,
    status: IssueStatus.OPEN,
    createdAt: new Date(),
  };
}

function createStageResult(overrides: Partial<StageResult> = {}): StageResult {
  return {
    stage: PipelineStage.TESTING,
    status: StageStatus.IN_PROGRESS,
    startedAt: new Date(),
    agentResults: [],
    artifacts: [],
    issues: [],
    metrics: {
      tokensUsed: 0,
      durationMs: 0,
      retryCount: 0,
      artifactsProduced: 0,
      issuesFound: 0,
      issuesResolved: 0,
    },
    ...overrides,
  };
}

describe('validators (extended)', () => {
  describe('validateArtifact', () => {
    it('returns no errors for a valid artifact', () => {
      const errors = validateArtifact(createArtifact());
      expect(errors).toHaveLength(0);
    });

    it('returns error when id is missing', () => {
      const errors = validateArtifact(createArtifact({ id: '' }));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.field === 'id')).toBe(true);
    });

    it('returns error when id is whitespace only', () => {
      const errors = validateArtifact(createArtifact({ id: '   ' }));
      expect(errors.some((e) => e.field === 'id')).toBe(true);
    });

    it('returns error when name is missing', () => {
      const errors = validateArtifact(createArtifact({ name: '' }));
      expect(errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('returns error when type is invalid', () => {
      const errors = validateArtifact(createArtifact({ type: 'bogus' as ArtifactType }));
      expect(errors.some((e) => e.field === 'type')).toBe(true);
    });

    it('returns error when createdBy is invalid', () => {
      const errors = validateArtifact(createArtifact({ createdBy: 'nobody' as AgentRole }));
      expect(errors.some((e) => e.field === 'createdBy')).toBe(true);
    });

    it('returns error when content is empty', () => {
      const errors = validateArtifact(createArtifact({ content: '' }));
      expect(errors.some((e) => e.field === 'content')).toBe(true);
    });

    it('returns error when content is whitespace only', () => {
      const errors = validateArtifact(createArtifact({ content: '   ' }));
      expect(errors.some((e) => e.field === 'content')).toBe(true);
    });

    it('returns multiple errors for multiple invalid fields', () => {
      const errors = validateArtifact(
        createArtifact({ id: '', name: '', content: '', type: 'bad' as ArtifactType }),
      );
      expect(errors.length).toBeGreaterThanOrEqual(4);
      const fields = errors.map((e) => e.field);
      expect(fields).toContain('id');
      expect(fields).toContain('name');
      expect(fields).toContain('content');
      expect(fields).toContain('type');
    });

    it('ValidationError instances have correct properties', () => {
      const errors = validateArtifact(createArtifact({ id: '' }));
      const err = errors[0];
      expect(err).toBeInstanceOf(ValidationError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ValidationError');
      expect(err.field).toBe('id');
      expect(typeof err.message).toBe('string');
    });
  });

  describe('validateHandoff', () => {
    it('returns no errors for a valid handoff', () => {
      const errors = validateHandoff(createHandoff());
      expect(errors).toHaveLength(0);
    });

    it('returns error when fromAgent is invalid', () => {
      const errors = validateHandoff(createHandoff({ fromAgent: 'ghost' as AgentRole }));
      expect(errors.some((e) => e.field === 'fromAgent')).toBe(true);
    });

    it('returns error when toAgent is invalid', () => {
      const errors = validateHandoff(createHandoff({ toAgent: 'ghost' as AgentRole }));
      expect(errors.some((e) => e.field === 'toAgent')).toBe(true);
    });

    it('returns error when fromAgent equals toAgent', () => {
      const errors = validateHandoff(
        createHandoff({ fromAgent: AgentRole.PRODUCT_MANAGER, toAgent: AgentRole.PRODUCT_MANAGER }),
      );
      expect(errors.some((e) => e.field === 'toAgent')).toBe(true);
      expect(errors.some((e) => e.message.includes('same agent'))).toBe(true);
    });

    it('returns error when stage is invalid', () => {
      const errors = validateHandoff(createHandoff({ stage: 'unknown_stage' as PipelineStage }));
      expect(errors.some((e) => e.field === 'stage')).toBe(true);
    });

    it('returns error when context is empty', () => {
      const errors = validateHandoff(createHandoff({ context: '' }));
      expect(errors.some((e) => e.field === 'context')).toBe(true);
    });

    it('returns error when context is whitespace only', () => {
      const errors = validateHandoff(createHandoff({ context: '   ' }));
      expect(errors.some((e) => e.field === 'context')).toBe(true);
    });

    it('returns error when instructions are empty', () => {
      const errors = validateHandoff(createHandoff({ instructions: '' }));
      expect(errors.some((e) => e.field === 'instructions')).toBe(true);
    });

    it('returns error when instructions are whitespace only', () => {
      const errors = validateHandoff(createHandoff({ instructions: '  ' }));
      expect(errors.some((e) => e.field === 'instructions')).toBe(true);
    });

    it('returns multiple errors for multiple invalid fields', () => {
      const errors = validateHandoff(
        createHandoff({
          fromAgent: 'bad' as AgentRole,
          toAgent: 'bad' as AgentRole,
          stage: 'bad' as PipelineStage,
          context: '',
          instructions: '',
        }),
      );
      expect(errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('validateStageTransition', () => {
    it('returns no errors for a valid adjacent transition', () => {
      const feature = createFeature();
      feature.stageResults.set(PipelineStage.REQUIREMENTS_GATHERING, createStageResult({
        stage: PipelineStage.REQUIREMENTS_GATHERING,
        status: StageStatus.APPROVED,
      }));

      const errors = validateStageTransition(
        feature,
        PipelineStage.REQUIREMENTS_GATHERING,
        PipelineStage.ARCHITECTURE_DESIGN,
      );
      expect(errors).toHaveLength(0);
    });

    it('returns no errors when current stage is skipped', () => {
      const feature = createFeature();
      feature.stageResults.set(PipelineStage.REQUIREMENTS_GATHERING, createStageResult({
        stage: PipelineStage.REQUIREMENTS_GATHERING,
        status: StageStatus.SKIPPED,
      }));

      const errors = validateStageTransition(
        feature,
        PipelineStage.REQUIREMENTS_GATHERING,
        PipelineStage.ARCHITECTURE_DESIGN,
      );
      expect(errors).toHaveLength(0);
    });

    it('returns error when stage is not approved (in_progress)', () => {
      const feature = createFeature();
      feature.stageResults.set(PipelineStage.REQUIREMENTS_GATHERING, createStageResult({
        stage: PipelineStage.REQUIREMENTS_GATHERING,
        status: StageStatus.IN_PROGRESS,
      }));

      const errors = validateStageTransition(
        feature,
        PipelineStage.REQUIREMENTS_GATHERING,
        PipelineStage.ARCHITECTURE_DESIGN,
      );
      expect(errors.some((e) => e.field === 'stageStatus')).toBe(true);
      expect(errors.some((e) => e.message.includes('approved'))).toBe(true);
    });

    it('returns error when stage is failed', () => {
      const feature = createFeature();
      feature.stageResults.set(PipelineStage.REQUIREMENTS_GATHERING, createStageResult({
        stage: PipelineStage.REQUIREMENTS_GATHERING,
        status: StageStatus.FAILED,
      }));

      const errors = validateStageTransition(
        feature,
        PipelineStage.REQUIREMENTS_GATHERING,
        PipelineStage.ARCHITECTURE_DESIGN,
      );
      expect(errors.some((e) => e.field === 'stageStatus')).toBe(true);
    });

    it('returns error when skipping stages', () => {
      const feature = createFeature();
      feature.stageResults.set(PipelineStage.REQUIREMENTS_GATHERING, createStageResult({
        stage: PipelineStage.REQUIREMENTS_GATHERING,
        status: StageStatus.APPROVED,
      }));

      const errors = validateStageTransition(
        feature,
        PipelineStage.REQUIREMENTS_GATHERING,
        PipelineStage.IMPLEMENTATION,
      );
      expect(errors.some((e) => e.field === 'transition')).toBe(true);
      expect(errors.some((e) => e.message.includes('skip'))).toBe(true);
    });

    it('allows no errors when no result exists for current stage', () => {
      const feature = createFeature();
      const errors = validateStageTransition(
        feature,
        PipelineStage.REQUIREMENTS_GATHERING,
        PipelineStage.ARCHITECTURE_DESIGN,
      );
      expect(errors.some((e) => e.field === 'stageStatus')).toBe(false);
    });

    it('returns error for invalid source stage', () => {
      const feature = createFeature();
      const errors = validateStageTransition(
        feature,
        'nonexistent' as PipelineStage,
        PipelineStage.ARCHITECTURE_DESIGN,
      );
      expect(errors.some((e) => e.field === 'from')).toBe(true);
    });

    it('returns error for invalid target stage', () => {
      const feature = createFeature();
      const errors = validateStageTransition(
        feature,
        PipelineStage.REQUIREMENTS_GATHERING,
        'nonexistent' as PipelineStage,
      );
      expect(errors.some((e) => e.field === 'to')).toBe(true);
    });
  });

  describe('validateFeatureDescription', () => {
    it('accepts a valid description', () => {
      const errors = validateFeatureDescription('Implement user authentication with OAuth2 and JWT tokens');
      expect(errors).toHaveLength(0);
    });

    it('accepts description that is exactly 10 characters', () => {
      const errors = validateFeatureDescription('1234567890');
      expect(errors).toHaveLength(0);
    });

    it('rejects empty description', () => {
      const errors = validateFeatureDescription('');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.field === 'description')).toBe(true);
    });

    it('rejects too-short description (less than 10 chars)', () => {
      const errors = validateFeatureDescription('fix bug');
      expect(errors.some((e) => e.message.includes('too short'))).toBe(true);
    });

    it('rejects whitespace-only description', () => {
      const errors = validateFeatureDescription('         ');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('handles single character description as too short', () => {
      const errors = validateFeatureDescription('x');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('hasBlockingIssues', () => {
    it('returns true when critical issues exist', () => {
      const result = createStageResult({
        issues: [createIssue(IssueSeverity.CRITICAL)],
      });
      expect(hasBlockingIssues(result)).toBe(true);
    });

    it('returns true when high severity issues exist', () => {
      const result = createStageResult({
        issues: [createIssue(IssueSeverity.HIGH)],
      });
      expect(hasBlockingIssues(result)).toBe(true);
    });

    it('returns false when only medium issues exist', () => {
      const result = createStageResult({
        issues: [createIssue(IssueSeverity.MEDIUM)],
      });
      expect(hasBlockingIssues(result)).toBe(false);
    });

    it('returns false when only low issues exist', () => {
      const result = createStageResult({
        issues: [createIssue(IssueSeverity.LOW)],
      });
      expect(hasBlockingIssues(result)).toBe(false);
    });

    it('returns false when only info issues exist', () => {
      const result = createStageResult({
        issues: [createIssue(IssueSeverity.INFO)],
      });
      expect(hasBlockingIssues(result)).toBe(false);
    });

    it('returns false when no issues exist', () => {
      const result = createStageResult({ issues: [] });
      expect(hasBlockingIssues(result)).toBe(false);
    });

    it('returns true when mix of severities includes high', () => {
      const result = createStageResult({
        issues: [
          createIssue(IssueSeverity.LOW),
          createIssue(IssueSeverity.MEDIUM),
          createIssue(IssueSeverity.HIGH),
        ],
      });
      expect(hasBlockingIssues(result)).toBe(true);
    });

    it('returns false when mix of severities excludes critical and high', () => {
      const result = createStageResult({
        issues: [
          createIssue(IssueSeverity.INFO),
          createIssue(IssueSeverity.LOW),
          createIssue(IssueSeverity.MEDIUM),
        ],
      });
      expect(hasBlockingIssues(result)).toBe(false);
    });
  });

  describe('areRequiredArtifactsPresent', () => {
    it('returns satisfied when all required artifacts are present', () => {
      const required = [ArtifactType.REQUIREMENTS_DOC, ArtifactType.ARCHITECTURE_DOC];
      const available = [
        createArtifact({ type: ArtifactType.REQUIREMENTS_DOC }),
        createArtifact({ type: ArtifactType.ARCHITECTURE_DOC }),
        createArtifact({ type: ArtifactType.USER_STORIES }),
      ];
      const result = areRequiredArtifactsPresent(required, available);
      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('returns unsatisfied with correct missing types', () => {
      const required = [
        ArtifactType.REQUIREMENTS_DOC,
        ArtifactType.ARCHITECTURE_DOC,
        ArtifactType.TEST_PLAN,
      ];
      const available = [createArtifact({ type: ArtifactType.REQUIREMENTS_DOC })];
      const result = areRequiredArtifactsPresent(required, available);

      expect(result.satisfied).toBe(false);
      expect(result.missing).toHaveLength(2);
      expect(result.missing).toContain(ArtifactType.ARCHITECTURE_DOC);
      expect(result.missing).toContain(ArtifactType.TEST_PLAN);
    });

    it('returns satisfied for empty required list', () => {
      const result = areRequiredArtifactsPresent([], []);
      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('returns satisfied for empty required with available artifacts', () => {
      const result = areRequiredArtifactsPresent([], [createArtifact()]);
      expect(result.satisfied).toBe(true);
    });

    it('returns unsatisfied when all required are missing', () => {
      const required = [ArtifactType.REQUIREMENTS_DOC, ArtifactType.TEST_PLAN];
      const result = areRequiredArtifactsPresent(required, []);
      expect(result.satisfied).toBe(false);
      expect(result.missing).toHaveLength(2);
    });

    it('handles duplicate types in available artifacts', () => {
      const required = [ArtifactType.REQUIREMENTS_DOC];
      const available = [
        createArtifact({ id: 'a1', type: ArtifactType.REQUIREMENTS_DOC }),
        createArtifact({ id: 'a2', type: ArtifactType.REQUIREMENTS_DOC }),
      ];
      const result = areRequiredArtifactsPresent(required, available);
      expect(result.satisfied).toBe(true);
    });
  });
});
