import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  type Feature,
  type StageResult,
  type Artifact,
  type Issue,
  PipelineStage,
  StageStatus,
  ArtifactType,
  ArtifactStatus,
  ReviewStatus,
  AgentRole,
  IssueSeverity,
  IssueType,
  IssueStatus,
  FeatureStatus,
  FeaturePriority,
} from '../../src/types';
import { TransitionEngine } from '../../src/pipeline/transitions';
import { ArtifactStore } from '../../src/workspace/artifact-store';

let tempDir: string;
let store: ArtifactStore;
let engine: TransitionEngine;

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: ArtifactType.REQUIREMENTS_DOC,
    name: 'Test Artifact',
    description: 'desc',
    filePath: 'test/artifact.md',
    createdBy: AgentRole.PRODUCT_MANAGER,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    content: 'content',
    metadata: {},
    status: ArtifactStatus.DRAFT,
    reviewStatus: ReviewStatus.PENDING,
    ...overrides,
  };
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: `issue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    featureId: 'feat-1',
    type: IssueType.BUG,
    severity: IssueSeverity.MEDIUM,
    title: 'Test Issue',
    description: 'A test issue',
    reportedBy: AgentRole.QA_ENGINEER,
    stage: PipelineStage.TESTING,
    status: IssueStatus.OPEN,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeStageResult(overrides: Partial<StageResult> = {}): StageResult {
  return {
    stage: PipelineStage.REQUIREMENTS_GATHERING,
    status: StageStatus.APPROVED,
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

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    projectId: 'proj-1',
    name: 'Test Feature',
    description: 'A test feature',
    requestedBy: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    currentStage: PipelineStage.REQUIREMENTS_GATHERING,
    stageResults: new Map(),
    artifacts: [],
    issues: [],
    status: FeatureStatus.IN_PROGRESS,
    priority: FeaturePriority.MEDIUM,
    metadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-transition-test-'));
  store = new ArtifactStore(tempDir);
  engine = new TransitionEngine(store);
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('TransitionEngine', () => {
  describe('evaluateTransition()', () => {
    it('should block when stage has not been executed yet', () => {
      const feature = makeFeature();
      const result = engine.evaluateTransition(feature, PipelineStage.REQUIREMENTS_GATHERING);

      expect(result.allowed).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.blockers[0]).toContain('has not been executed yet');
    });

    it('should allow transition when stage is approved', () => {
      const stageResults = new Map<PipelineStage, StageResult>();
      stageResults.set(
        PipelineStage.REQUIREMENTS_GATHERING,
        makeStageResult({
          stage: PipelineStage.REQUIREMENTS_GATHERING,
          status: StageStatus.APPROVED,
          artifacts: [
            makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }),
            makeArtifact({ type: ArtifactType.USER_STORIES }),
          ],
        }),
      );

      store.store(makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }));
      store.store(makeArtifact({ type: ArtifactType.USER_STORIES }));
      store.store(makeArtifact({ type: ArtifactType.ACCEPTANCE_CRITERIA }));

      const feature = makeFeature({ stageResults });
      const result = engine.evaluateTransition(feature, PipelineStage.REQUIREMENTS_GATHERING);

      expect(result.allowed).toBe(true);
      expect(result.blockers).toHaveLength(0);
      expect(result.nextStage).toBe(PipelineStage.ARCHITECTURE_DESIGN);
    });

    it('should block when stage has failed', () => {
      const stageResults = new Map<PipelineStage, StageResult>();
      stageResults.set(
        PipelineStage.REQUIREMENTS_GATHERING,
        makeStageResult({ status: StageStatus.FAILED }),
      );
      const feature = makeFeature({ stageResults });

      const result = engine.evaluateTransition(feature, PipelineStage.REQUIREMENTS_GATHERING);

      expect(result.allowed).toBe(false);
      expect(result.blockers.some(b => b.includes('must be approved or skipped'))).toBe(true);
    });

    it('should allow transition when stage is skipped', () => {
      const stageResults = new Map<PipelineStage, StageResult>();
      stageResults.set(
        PipelineStage.UI_UX_DESIGN,
        makeStageResult({
          stage: PipelineStage.UI_UX_DESIGN,
          status: StageStatus.SKIPPED,
          artifacts: [makeArtifact({ type: ArtifactType.UI_SPEC })],
        }),
      );

      store.store(makeArtifact({ type: ArtifactType.UI_SPEC }));
      store.store(makeArtifact({ type: ArtifactType.WIREFRAME }));
      store.store(makeArtifact({ type: ArtifactType.COMPONENT_SPEC }));

      const feature = makeFeature({ stageResults });
      const result = engine.evaluateTransition(feature, PipelineStage.UI_UX_DESIGN);

      expect(result.allowed).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it('should block when stage is in progress', () => {
      const stageResults = new Map<PipelineStage, StageResult>();
      stageResults.set(
        PipelineStage.REQUIREMENTS_GATHERING,
        makeStageResult({ status: StageStatus.IN_PROGRESS }),
      );
      const feature = makeFeature({ stageResults });

      const result = engine.evaluateTransition(feature, PipelineStage.REQUIREMENTS_GATHERING);

      expect(result.allowed).toBe(false);
      expect(result.blockers.some(b => b.includes('must be approved or skipped'))).toBe(true);
    });

    it('should block when stage is awaiting review', () => {
      const stageResults = new Map<PipelineStage, StageResult>();
      stageResults.set(
        PipelineStage.REQUIREMENTS_GATHERING,
        makeStageResult({ status: StageStatus.AWAITING_REVIEW }),
      );
      const feature = makeFeature({ stageResults });

      const result = engine.evaluateTransition(feature, PipelineStage.REQUIREMENTS_GATHERING);

      expect(result.allowed).toBe(false);
      expect(result.blockers.some(b => b.includes('must be approved or skipped'))).toBe(true);
    });

    it('should return allowed=false and unknown stage blocker for unknown stage', () => {
      const feature = makeFeature();
      const result = engine.evaluateTransition(feature, 'nonexistent_stage' as PipelineStage);

      expect(result.allowed).toBe(false);
      expect(result.nextStage).toBeNull();
      expect(result.blockers.some(b => b.includes('Unknown stage'))).toBe(true);
    });

    describe('gate conditions', () => {
      it('hasArtifact passes when artifact exists in stage result', () => {
        const stageResults = new Map<PipelineStage, StageResult>();
        stageResults.set(
          PipelineStage.REQUIREMENTS_GATHERING,
          makeStageResult({
            status: StageStatus.APPROVED,
            artifacts: [
              makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }),
              makeArtifact({ type: ArtifactType.USER_STORIES }),
            ],
          }),
        );

        store.store(makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }));
        store.store(makeArtifact({ type: ArtifactType.USER_STORIES }));
        store.store(makeArtifact({ type: ArtifactType.ACCEPTANCE_CRITERIA }));

        const feature = makeFeature({ stageResults });
        const result = engine.evaluateTransition(feature, PipelineStage.REQUIREMENTS_GATHERING);

        expect(result.allowed).toBe(true);
        expect(result.blockers).toHaveLength(0);
      });

      it('hasArtifact passes when artifact exists in artifact store', () => {
        store.store(makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }));
        store.store(makeArtifact({ type: ArtifactType.USER_STORIES }));
        store.store(makeArtifact({ type: ArtifactType.ACCEPTANCE_CRITERIA }));

        const stageResults = new Map<PipelineStage, StageResult>();
        stageResults.set(
          PipelineStage.REQUIREMENTS_GATHERING,
          makeStageResult({ status: StageStatus.APPROVED, artifacts: [] }),
        );

        const feature = makeFeature({ stageResults });
        const result = engine.evaluateTransition(feature, PipelineStage.REQUIREMENTS_GATHERING);

        expect(result.allowed).toBe(true);
      });

      it('hasArtifact fails and blocks when required artifact is missing', () => {
        const stageResults = new Map<PipelineStage, StageResult>();
        stageResults.set(
          PipelineStage.REQUIREMENTS_GATHERING,
          makeStageResult({ status: StageStatus.APPROVED, artifacts: [] }),
        );

        const feature = makeFeature({ stageResults });
        const result = engine.evaluateTransition(feature, PipelineStage.REQUIREMENTS_GATHERING);

        expect(result.allowed).toBe(false);
        expect(result.blockers.some(b => b.includes('Gate condition failed'))).toBe(true);
        expect(result.blockers.some(b => b.includes('requirements_doc'))).toBe(true);
      });

      it('noCriticalIssues passes when no critical issues exist', () => {
        const stageResults = new Map<PipelineStage, StageResult>();
        stageResults.set(
          PipelineStage.ARCHITECTURE_DESIGN,
          makeStageResult({
            stage: PipelineStage.ARCHITECTURE_DESIGN,
            status: StageStatus.APPROVED,
            artifacts: [makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC })],
            issues: [makeIssue({ severity: IssueSeverity.LOW })],
          }),
        );

        store.store(makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC }));
        store.store(makeArtifact({ type: ArtifactType.API_SPEC }));
        store.store(makeArtifact({ type: ArtifactType.DATA_MODEL }));

        const feature = makeFeature({ stageResults });
        const result = engine.evaluateTransition(feature, PipelineStage.ARCHITECTURE_DESIGN);

        const criticalGateBlocker = result.blockers.find(b =>
          b.includes('noCriticalIssues') || b.includes('critical issues found'),
        );
        expect(criticalGateBlocker).toBeUndefined();
      });

      it('noCriticalIssues fails when critical issues are present', () => {
        const stageResults = new Map<PipelineStage, StageResult>();
        stageResults.set(
          PipelineStage.ARCHITECTURE_DESIGN,
          makeStageResult({
            stage: PipelineStage.ARCHITECTURE_DESIGN,
            status: StageStatus.APPROVED,
            artifacts: [makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC })],
            issues: [makeIssue({ severity: IssueSeverity.CRITICAL, title: 'Bad arch' })],
          }),
        );

        store.store(makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC }));
        store.store(makeArtifact({ type: ArtifactType.API_SPEC }));
        store.store(makeArtifact({ type: ArtifactType.DATA_MODEL }));

        const feature = makeFeature({ stageResults });
        const result = engine.evaluateTransition(feature, PipelineStage.ARCHITECTURE_DESIGN);

        expect(result.allowed).toBe(false);
        expect(result.blockers.some(b => b.includes('critical issues found') || b.includes('critical issue(s)'))).toBe(true);
      });

      it('noHighIssues passes when no high/critical issues exist', () => {
        const stageResults = new Map<PipelineStage, StageResult>();
        stageResults.set(
          PipelineStage.CODE_REVIEW,
          makeStageResult({
            stage: PipelineStage.CODE_REVIEW,
            status: StageStatus.APPROVED,
            artifacts: [makeArtifact({ type: ArtifactType.CODE_REVIEW_REPORT })],
            issues: [makeIssue({ severity: IssueSeverity.LOW })],
          }),
        );

        store.store(makeArtifact({ type: ArtifactType.CODE_REVIEW_REPORT }));

        const feature = makeFeature({ stageResults });
        const result = engine.evaluateTransition(feature, PipelineStage.CODE_REVIEW);

        expect(result.blockers.filter(b => b.includes('high/critical'))).toHaveLength(0);
      });

      it('should produce a warning (not a blocker) for optional gate condition not met', () => {
        const stageResults = new Map<PipelineStage, StageResult>();
        stageResults.set(
          PipelineStage.REQUIREMENTS_GATHERING,
          makeStageResult({
            status: StageStatus.APPROVED,
            artifacts: [
              makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }),
            ],
          }),
        );

        store.store(makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }));
        store.store(makeArtifact({ type: ArtifactType.USER_STORIES }));
        store.store(makeArtifact({ type: ArtifactType.ACCEPTANCE_CRITERIA }));

        const feature = makeFeature({ stageResults });
        const result = engine.evaluateTransition(feature, PipelineStage.REQUIREMENTS_GATHERING);

        expect(result.allowed).toBe(true);
      });

      it('should handle unknown validator type gracefully (pass=true)', () => {
        const stageResults = new Map<PipelineStage, StageResult>();
        stageResults.set(
          PipelineStage.REQUIREMENTS_GATHERING,
          makeStageResult({
            status: StageStatus.APPROVED,
            artifacts: [
              makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }),
              makeArtifact({ type: ArtifactType.USER_STORIES }),
            ],
          }),
        );

        store.store(makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }));
        store.store(makeArtifact({ type: ArtifactType.USER_STORIES }));
        store.store(makeArtifact({ type: ArtifactType.ACCEPTANCE_CRITERIA }));

        const feature = makeFeature({ stageResults });
        const result = engine.evaluateTransition(feature, PipelineStage.REQUIREMENTS_GATHERING);

        expect(result.allowed).toBe(true);
      });

      it('noHighIssues fails when high issues exist (code_review stage has noCriticalIssues, not noHighIssues)', () => {
        const stageResults = new Map<PipelineStage, StageResult>();
        stageResults.set(
          PipelineStage.CODE_REVIEW,
          makeStageResult({
            stage: PipelineStage.CODE_REVIEW,
            status: StageStatus.APPROVED,
            artifacts: [makeArtifact({ type: ArtifactType.CODE_REVIEW_REPORT })],
            issues: [makeIssue({ severity: IssueSeverity.HIGH, status: IssueStatus.OPEN })],
          }),
        );

        store.store(makeArtifact({ type: ArtifactType.CODE_REVIEW_REPORT }));

        const feature = makeFeature({ stageResults });
        const result = engine.evaluateTransition(feature, PipelineStage.CODE_REVIEW);

        expect(result.warnings.some(w => w.includes('high-severity issue'))).toBe(true);
      });
    });

    it('should block when critical issues are present in stage result', () => {
      const stageResults = new Map<PipelineStage, StageResult>();
      stageResults.set(
        PipelineStage.REQUIREMENTS_GATHERING,
        makeStageResult({
          status: StageStatus.APPROVED,
          artifacts: [
            makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }),
            makeArtifact({ type: ArtifactType.USER_STORIES }),
          ],
          issues: [
            makeIssue({ severity: IssueSeverity.CRITICAL, title: 'Missing scope definition' }),
          ],
        }),
      );

      store.store(makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }));
      store.store(makeArtifact({ type: ArtifactType.USER_STORIES }));
      store.store(makeArtifact({ type: ArtifactType.ACCEPTANCE_CRITERIA }));

      const feature = makeFeature({ stageResults });
      const result = engine.evaluateTransition(feature, PipelineStage.REQUIREMENTS_GATHERING);

      expect(result.allowed).toBe(false);
      expect(result.blockers.some(b => b.includes('critical issue(s)'))).toBe(true);
      expect(result.blockers.some(b => b.includes('Missing scope definition'))).toBe(true);
    });

    it('should warn when high-severity open issues exist', () => {
      const stageResults = new Map<PipelineStage, StageResult>();
      stageResults.set(
        PipelineStage.REQUIREMENTS_GATHERING,
        makeStageResult({
          status: StageStatus.APPROVED,
          artifacts: [
            makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }),
            makeArtifact({ type: ArtifactType.USER_STORIES }),
          ],
          issues: [
            makeIssue({ severity: IssueSeverity.HIGH, status: IssueStatus.OPEN as string as any, title: 'Ambiguous requirement' }),
          ],
        }),
      );

      store.store(makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }));
      store.store(makeArtifact({ type: ArtifactType.USER_STORIES }));
      store.store(makeArtifact({ type: ArtifactType.ACCEPTANCE_CRITERIA }));

      const feature = makeFeature({ stageResults });
      const result = engine.evaluateTransition(feature, PipelineStage.REQUIREMENTS_GATHERING);

      expect(result.warnings.some(w => w.includes('high-severity issue'))).toBe(true);
    });

    it('should warn when produced artifacts are missing from the artifact store', () => {
      const stageResults = new Map<PipelineStage, StageResult>();
      stageResults.set(
        PipelineStage.REQUIREMENTS_GATHERING,
        makeStageResult({
          status: StageStatus.APPROVED,
          artifacts: [
            makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }),
            makeArtifact({ type: ArtifactType.USER_STORIES }),
          ],
        }),
      );

      const feature = makeFeature({ stageResults });
      const result = engine.evaluateTransition(feature, PipelineStage.REQUIREMENTS_GATHERING);

      expect(result.warnings.some(w => w.includes('Expected artifact not found'))).toBe(true);
    });

    it('should set nextStage correctly', () => {
      const stageResults = new Map<PipelineStage, StageResult>();
      stageResults.set(
        PipelineStage.ARCHITECTURE_DESIGN,
        makeStageResult({
          stage: PipelineStage.ARCHITECTURE_DESIGN,
          status: StageStatus.APPROVED,
          artifacts: [makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC })],
        }),
      );

      store.store(makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC }));
      store.store(makeArtifact({ type: ArtifactType.API_SPEC }));
      store.store(makeArtifact({ type: ArtifactType.DATA_MODEL }));

      const feature = makeFeature({ stageResults });
      const result = engine.evaluateTransition(feature, PipelineStage.ARCHITECTURE_DESIGN);

      expect(result.nextStage).toBe(PipelineStage.UI_UX_DESIGN);
    });

    it('should return null nextStage for the last pipeline stage', () => {
      const stageResults = new Map<PipelineStage, StageResult>();
      stageResults.set(
        PipelineStage.DEPLOYMENT,
        makeStageResult({
          stage: PipelineStage.DEPLOYMENT,
          status: StageStatus.APPROVED,
          artifacts: [makeArtifact({ type: ArtifactType.DEPLOYMENT_PLAN })],
        }),
      );

      store.store(makeArtifact({ type: ArtifactType.DEPLOYMENT_PLAN }));
      store.store(makeArtifact({ type: ArtifactType.CI_CD_CONFIG }));
      store.store(makeArtifact({ type: ArtifactType.INFRASTRUCTURE_CONFIG }));
      store.store(makeArtifact({ type: ArtifactType.MONITORING_CONFIG }));
      store.store(makeArtifact({ type: ArtifactType.ALERTING_RULES }));
      store.store(makeArtifact({ type: ArtifactType.SCALING_POLICY }));
      store.store(makeArtifact({ type: ArtifactType.COST_ANALYSIS }));
      store.store(makeArtifact({ type: ArtifactType.SLA_DEFINITION }));
      store.store(makeArtifact({ type: ArtifactType.DISASTER_RECOVERY_PLAN }));
      store.store(makeArtifact({ type: ArtifactType.PERFORMANCE_BENCHMARK }));
      store.store(makeArtifact({ type: ArtifactType.RUNBOOK }));

      const feature = makeFeature({ stageResults });
      const result = engine.evaluateTransition(feature, PipelineStage.DEPLOYMENT);

      expect(result.nextStage).toBeNull();
    });
  });

  describe('canSkipStage()', () => {
    it('should return true for skippable stages', () => {
      expect(engine.canSkipStage(PipelineStage.UI_UX_DESIGN)).toBe(true);
      expect(engine.canSkipStage(PipelineStage.SECURITY_REVIEW)).toBe(true);
      expect(engine.canSkipStage(PipelineStage.DOCUMENTATION)).toBe(true);
      expect(engine.canSkipStage(PipelineStage.DEPLOYMENT)).toBe(true);
    });

    it('should return false for non-skippable stages', () => {
      expect(engine.canSkipStage(PipelineStage.REQUIREMENTS_GATHERING)).toBe(false);
      expect(engine.canSkipStage(PipelineStage.ARCHITECTURE_DESIGN)).toBe(false);
      expect(engine.canSkipStage(PipelineStage.IMPLEMENTATION)).toBe(false);
      expect(engine.canSkipStage(PipelineStage.CODE_REVIEW)).toBe(false);
      expect(engine.canSkipStage(PipelineStage.TESTING)).toBe(false);
      expect(engine.canSkipStage(PipelineStage.TASK_BREAKDOWN)).toBe(false);
    });

    it('should return false for an unknown stage', () => {
      expect(engine.canSkipStage('nonexistent' as PipelineStage)).toBe(false);
    });
  });

  describe('getRequiredArtifactsForStage()', () => {
    it('should return empty array for requirements gathering (no prerequisites)', () => {
      const required = engine.getRequiredArtifactsForStage(PipelineStage.REQUIREMENTS_GATHERING);
      expect(required).toEqual([]);
    });

    it('should return correct required artifacts for architecture design', () => {
      const required = engine.getRequiredArtifactsForStage(PipelineStage.ARCHITECTURE_DESIGN);
      expect(required).toContain(ArtifactType.REQUIREMENTS_DOC);
      expect(required).toContain(ArtifactType.USER_STORIES);
    });

    it('should return correct required artifacts for implementation', () => {
      const required = engine.getRequiredArtifactsForStage(PipelineStage.IMPLEMENTATION);
      expect(required).toContain(ArtifactType.ARCHITECTURE_DOC);
      expect(required).toContain(ArtifactType.API_SPEC);
      expect(required).toContain(ArtifactType.DATA_MODEL);
      expect(required).toContain(ArtifactType.TASK_LIST);
    });

    it('should return correct required artifacts for testing', () => {
      const required = engine.getRequiredArtifactsForStage(PipelineStage.TESTING);
      expect(required).toContain(ArtifactType.SOURCE_CODE);
      expect(required).toContain(ArtifactType.REQUIREMENTS_DOC);
      expect(required).toContain(ArtifactType.ACCEPTANCE_CRITERIA);
    });

    it('should return empty array for an unknown stage', () => {
      const required = engine.getRequiredArtifactsForStage('nonexistent' as PipelineStage);
      expect(required).toEqual([]);
    });
  });

  describe('getMissingArtifacts()', () => {
    it('should return all required artifacts when none are present', () => {
      const missing = engine.getMissingArtifacts(PipelineStage.ARCHITECTURE_DESIGN);
      expect(missing).toContain(ArtifactType.REQUIREMENTS_DOC);
      expect(missing).toContain(ArtifactType.USER_STORIES);
      expect(missing.length).toBe(2);
    });

    it('should return empty array when all required artifacts are present', () => {
      store.store(makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }));
      store.store(makeArtifact({ type: ArtifactType.USER_STORIES }));

      const missing = engine.getMissingArtifacts(PipelineStage.ARCHITECTURE_DESIGN);
      expect(missing).toEqual([]);
    });

    it('should return only the missing artifacts when some are present', () => {
      store.store(makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC }));

      const missing = engine.getMissingArtifacts(PipelineStage.ARCHITECTURE_DESIGN);
      expect(missing).toEqual([ArtifactType.USER_STORIES]);
    });

    it('should return empty array for a stage with no required artifacts', () => {
      const missing = engine.getMissingArtifacts(PipelineStage.REQUIREMENTS_GATHERING);
      expect(missing).toEqual([]);
    });
  });
});
