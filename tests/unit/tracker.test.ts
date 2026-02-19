import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  type Feature,
  type StageResult,
  type AgentResult,
  TrackingEventType,
  PipelineStage,
  AgentRole,
  StageStatus,
  FeatureStatus,
  FeaturePriority,
  ArtifactType,
  IssueSeverity,
  IssueType,
  IssueStatus,
} from '../../src/types';
import { DevelopmentTracker } from '../../src/tracker/development-tracker';

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    projectId: 'proj-1',
    name: 'Test Feature',
    description: 'A test feature for tracking',
    requestedBy: 'tester',
    createdAt: new Date(),
    updatedAt: new Date(),
    currentStage: PipelineStage.REQUIREMENTS_GATHERING,
    stageResults: new Map(),
    artifacts: [],
    issues: [],
    status: FeatureStatus.DRAFT,
    priority: FeaturePriority.HIGH,
    metadata: {},
    ...overrides,
  };
}

function makeStageResult(overrides: Partial<StageResult> = {}): StageResult {
  return {
    stage: PipelineStage.REQUIREMENTS_GATHERING,
    status: StageStatus.APPROVED,
    startedAt: new Date(),
    completedAt: new Date(),
    agentResults: [],
    artifacts: [
      {
        id: 'art-1',
        type: ArtifactType.REQUIREMENTS_DOC,
        name: 'Requirements',
        description: 'Test requirements',
        filePath: 'test.md',
        createdBy: AgentRole.PRODUCT_MANAGER,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        content: 'content',
        metadata: {},
        status: 'draft' as any,
        reviewStatus: 'pending' as any,
      },
    ],
    issues: [
      {
        id: 'iss-1',
        featureId: 'feat-1',
        type: IssueType.BUG,
        severity: IssueSeverity.MEDIUM,
        title: 'Test issue',
        description: 'desc',
        reportedBy: AgentRole.QA_ENGINEER,
        stage: PipelineStage.TESTING,
        status: IssueStatus.OPEN,
        createdAt: new Date(),
      },
    ],
    metrics: {
      tokensUsed: 5000,
      durationMs: 1200,
      retryCount: 0,
      artifactsProduced: 1,
      issuesFound: 1,
      issuesResolved: 0,
    },
    ...overrides,
  };
}

function makeAgentResult(status: 'success' | 'failure' = 'success'): AgentResult {
  return {
    agentRole: AgentRole.PRODUCT_MANAGER,
    status,
    output: 'Agent output text',
    artifacts: status === 'success'
      ? [{
          id: 'art-2',
          type: ArtifactType.REQUIREMENTS_DOC,
          name: 'Requirements',
          description: 'desc',
          filePath: 'test.md',
          createdBy: AgentRole.PRODUCT_MANAGER,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
          content: 'content',
          metadata: {},
          status: 'draft' as any,
          reviewStatus: 'pending' as any,
        }]
      : [],
    issues: [],
    tokensUsed: 1000,
    durationMs: 500,
    metadata: {},
  };
}

describe('DevelopmentTracker', () => {
  let tempDir: string;
  let tracker: DevelopmentTracker;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-tracker-test-'));
    tracker = new DevelopmentTracker(tempDir, 'proj-1', 'Test Project');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('creates history directory', () => {
      const historyDir = path.join(tempDir, '.cdm', 'history');
      expect(fs.existsSync(historyDir)).toBe(true);
    });

    it('starts with empty events', () => {
      expect(tracker.getEvents()).toHaveLength(0);
    });
  });

  describe('recordFeatureCreated', () => {
    it('creates event with correct type and message', () => {
      const feature = makeFeature();
      tracker.recordFeatureCreated(feature);

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackingEventType.FEATURE_CREATED);
      expect(events[0].featureId).toBe('feat-1');
      expect(events[0].featureName).toBe('Test Feature');
      expect(events[0].message).toContain('Feature created');
      expect(events[0].message).toContain('Test Feature');
      expect(events[0].id).toBeTruthy();
      expect(events[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('recordPipelineStarted', () => {
    it('creates event with correct type and mode', () => {
      tracker.recordPipelineStarted('feat-1', 'Test Feature', 'full');

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackingEventType.PIPELINE_STARTED);
      expect(events[0].featureId).toBe('feat-1');
      expect(events[0].message).toContain('Pipeline started');
      expect(events[0].message).toContain('full');
    });
  });

  describe('recordPipelineCompleted', () => {
    it('creates event with metrics', () => {
      tracker.recordPipelineCompleted('feat-1', 'Test Feature', 5000, 10000, 5, 2);

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackingEventType.PIPELINE_COMPLETED);
      expect(events[0].durationMs).toBe(5000);
      expect(events[0].tokensUsed).toBe(10000);
      expect(events[0].message).toContain('5 artifacts');
      expect(events[0].message).toContain('2 issues');
    });
  });

  describe('recordPipelineFailed', () => {
    it('creates event with error message', () => {
      tracker.recordPipelineFailed('feat-1', 'Test Feature', PipelineStage.TESTING, 'timeout');

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackingEventType.PIPELINE_FAILED);
      expect(events[0].stage).toBe(PipelineStage.TESTING);
      expect(events[0].message).toContain('Pipeline failed');
      expect(events[0].message).toContain('timeout');
    });

    it('creates event without error message', () => {
      tracker.recordPipelineFailed('feat-1', 'Test Feature', PipelineStage.TESTING);

      const events = tracker.getEvents();
      expect(events[0].message).toContain('Pipeline failed');
      expect(events[0].message).not.toContain('undefined');
    });
  });

  describe('recordStageStarted', () => {
    it('creates event with stage and agent', () => {
      tracker.recordStageStarted('feat-1', PipelineStage.ARCHITECTURE_DESIGN, AgentRole.SYSTEM_ARCHITECT);

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackingEventType.STAGE_STARTED);
      expect(events[0].stage).toBe(PipelineStage.ARCHITECTURE_DESIGN);
      expect(events[0].agentRole).toBe(AgentRole.SYSTEM_ARCHITECT);
      expect(events[0].message).toContain('Stage started');
    });
  });

  describe('recordStageCompleted', () => {
    it('creates event with result metrics', () => {
      const result = makeStageResult();
      tracker.recordStageCompleted('feat-1', PipelineStage.REQUIREMENTS_GATHERING, result);

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackingEventType.STAGE_COMPLETED);
      expect(events[0].durationMs).toBe(1200);
      expect(events[0].tokensUsed).toBe(5000);
      expect(events[0].message).toContain('Stage completed');
      expect(events[0].message).toContain('1 artifacts');
      expect(events[0].message).toContain('1 issues');
    });
  });

  describe('recordStageFailed', () => {
    it('creates event with error', () => {
      tracker.recordStageFailed('feat-1', PipelineStage.IMPLEMENTATION, 'compilation error');

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackingEventType.STAGE_FAILED);
      expect(events[0].stage).toBe(PipelineStage.IMPLEMENTATION);
      expect(events[0].message).toContain('Stage failed');
      expect(events[0].message).toContain('compilation error');
    });
  });

  describe('recordStageSkipped', () => {
    it('creates event with reason', () => {
      tracker.recordStageSkipped('feat-1', PipelineStage.UI_UX_DESIGN, 'not applicable');

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackingEventType.STAGE_SKIPPED);
      expect(events[0].stage).toBe(PipelineStage.UI_UX_DESIGN);
      expect(events[0].message).toContain('Stage skipped');
      expect(events[0].message).toContain('not applicable');
    });
  });

  describe('recordStageRetried', () => {
    it('creates event with attempt info', () => {
      tracker.recordStageRetried('feat-1', PipelineStage.TESTING, 2, 3);

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackingEventType.STAGE_RETRIED);
      expect(events[0].message).toContain('Stage retry');
      expect(events[0].message).toContain('2/3');
    });
  });

  describe('recordAgentTask', () => {
    it('records successful agent task', () => {
      const result = makeAgentResult('success');
      tracker.recordAgentTask('feat-1', PipelineStage.REQUIREMENTS_GATHERING, AgentRole.PRODUCT_MANAGER, 'Gather Requirements', result);

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackingEventType.AGENT_TASK_COMPLETED);
      expect(events[0].agentRole).toBe(AgentRole.PRODUCT_MANAGER);
      expect(events[0].durationMs).toBe(500);
      expect(events[0].tokensUsed).toBe(1000);
      expect(events[0].message).toContain('success');
    });

    it('records failed agent task', () => {
      const result = makeAgentResult('failure');
      tracker.recordAgentTask('feat-1', PipelineStage.TESTING, AgentRole.QA_ENGINEER, 'Run Tests', result);

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackingEventType.AGENT_TASK_FAILED);
      expect(events[0].message).toContain('failure');
    });
  });

  describe('recordArtifactProduced', () => {
    it('creates event with artifact details', () => {
      tracker.recordArtifactProduced('feat-1', PipelineStage.REQUIREMENTS_GATHERING, 'Requirements Doc', 'requirements_doc', AgentRole.PRODUCT_MANAGER);

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackingEventType.ARTIFACT_PRODUCED);
      expect(events[0].agentRole).toBe(AgentRole.PRODUCT_MANAGER);
      expect(events[0].message).toContain('Artifact produced');
      expect(events[0].message).toContain('Requirements Doc');
    });
  });

  describe('recordIssueFound', () => {
    it('creates event with issue details', () => {
      tracker.recordIssueFound('feat-1', PipelineStage.SECURITY_REVIEW, 'SQL Injection', 'critical', AgentRole.SECURITY_ENGINEER);

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackingEventType.ISSUE_FOUND);
      expect(events[0].agentRole).toBe(AgentRole.SECURITY_ENGINEER);
      expect(events[0].message).toContain('Issue found');
      expect(events[0].message).toContain('critical');
      expect(events[0].message).toContain('SQL Injection');
    });
  });

  describe('recordAnalysisGenerated', () => {
    it('creates event with module/line counts', () => {
      tracker.recordAnalysisGenerated(15, 5000);

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackingEventType.ANALYSIS_GENERATED);
      expect(events[0].message).toContain('15 modules');
      expect(events[0].message).toContain('5,000');
    });
  });

  describe('getEvents', () => {
    it('returns all events', () => {
      tracker.recordFeatureCreated(makeFeature());
      tracker.recordPipelineStarted('feat-1', 'Test Feature', 'full');
      tracker.recordAnalysisGenerated(10, 1000);

      const events = tracker.getEvents();
      expect(events).toHaveLength(3);
    });

    it('returns a copy (not the internal array)', () => {
      tracker.recordFeatureCreated(makeFeature());
      const events = tracker.getEvents();
      events.push(null as any);
      expect(tracker.getEvents()).toHaveLength(1);
    });
  });

  describe('getEventsForFeature', () => {
    it('filters by featureId correctly', () => {
      tracker.recordFeatureCreated(makeFeature({ id: 'feat-1' }));
      tracker.recordFeatureCreated(makeFeature({ id: 'feat-2', name: 'Other Feature' }));
      tracker.recordPipelineStarted('feat-1', 'Test Feature', 'full');

      const events = tracker.getEventsForFeature('feat-1');
      expect(events).toHaveLength(2);
      expect(events.every((e) => e.featureId === 'feat-1')).toBe(true);
    });

    it('returns empty for unknown feature', () => {
      tracker.recordFeatureCreated(makeFeature());
      expect(tracker.getEventsForFeature('nonexistent')).toHaveLength(0);
    });
  });

  describe('getEventsByType', () => {
    it('filters by event type correctly', () => {
      tracker.recordFeatureCreated(makeFeature());
      tracker.recordPipelineStarted('feat-1', 'Test Feature', 'full');
      tracker.recordPipelineCompleted('feat-1', 'Test Feature', 5000, 10000, 3, 1);
      tracker.recordFeatureCreated(makeFeature({ id: 'feat-2', name: 'Feature 2' }));

      const featureEvents = tracker.getEventsByType(TrackingEventType.FEATURE_CREATED);
      expect(featureEvents).toHaveLength(2);
      expect(featureEvents.every((e) => e.type === TrackingEventType.FEATURE_CREATED)).toBe(true);

      const pipelineEvents = tracker.getEventsByType(TrackingEventType.PIPELINE_STARTED);
      expect(pipelineEvents).toHaveLength(1);
    });
  });

  describe('getRecentEvents', () => {
    it('returns correct count of most recent events', () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordFeatureCreated(makeFeature({ id: `feat-${i}`, name: `Feature ${i}` }));
      }

      const recent = tracker.getRecentEvents(3);
      expect(recent).toHaveLength(3);
      expect(recent[0].featureId).toBe('feat-7');
      expect(recent[2].featureId).toBe('feat-9');
    });

    it('returns all events when count exceeds total', () => {
      tracker.recordFeatureCreated(makeFeature());
      const recent = tracker.getRecentEvents(100);
      expect(recent).toHaveLength(1);
    });
  });

  describe('buildSummary', () => {
    it('computes correct summary after multiple events', () => {
      tracker.recordFeatureCreated(makeFeature({ id: 'feat-1' }));
      tracker.recordFeatureCreated(makeFeature({ id: 'feat-2', name: 'Feature 2' }));
      tracker.recordPipelineStarted('feat-1', 'Test Feature', 'full');

      tracker.recordStageCompleted('feat-1', PipelineStage.REQUIREMENTS_GATHERING, makeStageResult());
      tracker.recordStageFailed('feat-1', PipelineStage.IMPLEMENTATION, 'err');

      tracker.recordAgentTask('feat-1', PipelineStage.REQUIREMENTS_GATHERING, AgentRole.PRODUCT_MANAGER, 'Task 1', makeAgentResult('success'));
      tracker.recordAgentTask('feat-1', PipelineStage.TESTING, AgentRole.QA_ENGINEER, 'Task 2', makeAgentResult('failure'));

      tracker.recordArtifactProduced('feat-1', PipelineStage.REQUIREMENTS_GATHERING, 'Doc', 'req', AgentRole.PRODUCT_MANAGER);
      tracker.recordIssueFound('feat-1', PipelineStage.TESTING, 'Bug', 'high', AgentRole.QA_ENGINEER);

      tracker.recordPipelineCompleted('feat-1', 'Test Feature', 3000, 8000, 3, 1);
      tracker.recordPipelineFailed('feat-2', 'Feature 2', PipelineStage.TESTING, 'timeout');

      const summary = tracker.buildSummary();

      expect(summary.totalFeatures).toBe(2);
      expect(summary.completedFeatures).toBe(1);
      expect(summary.failedFeatures).toBe(1);
      expect(summary.totalArtifactsProduced).toBe(1);
      expect(summary.totalIssuesFound).toBe(1);
      expect(summary.totalTokensUsed).toBe(8000);
      expect(summary.totalDurationMs).toBe(3000);

      expect(summary.agentActivity[AgentRole.PRODUCT_MANAGER]).toBeDefined();
      expect(summary.agentActivity[AgentRole.PRODUCT_MANAGER].tasks).toBe(1);
      expect(summary.agentActivity[AgentRole.QA_ENGINEER]).toBeDefined();
      expect(summary.agentActivity[AgentRole.QA_ENGINEER].tasks).toBe(1);

      expect(summary.stageMetrics[PipelineStage.REQUIREMENTS_GATHERING]).toBeDefined();
      expect(summary.stageMetrics[PipelineStage.REQUIREMENTS_GATHERING].runs).toBe(1);
      expect(summary.stageMetrics[PipelineStage.IMPLEMENTATION]).toBeDefined();
      expect(summary.stageMetrics[PipelineStage.IMPLEMENTATION].failureRate).toBe(1);

      expect(summary.totalStagesExecuted).toBe(2);
    });

    it('returns zeros for empty tracker', () => {
      const summary = tracker.buildSummary();
      expect(summary.totalFeatures).toBe(0);
      expect(summary.completedFeatures).toBe(0);
      expect(summary.failedFeatures).toBe(0);
      expect(summary.totalArtifactsProduced).toBe(0);
      expect(summary.totalIssuesFound).toBe(0);
      expect(summary.totalTokensUsed).toBe(0);
      expect(summary.totalDurationMs).toBe(0);
      expect(Object.keys(summary.agentActivity)).toHaveLength(0);
      expect(Object.keys(summary.stageMetrics)).toHaveLength(0);
    });
  });

  describe('generateMarkdown', () => {
    it('returns non-empty markdown with expected sections', () => {
      tracker.recordFeatureCreated(makeFeature());
      tracker.recordPipelineStarted('feat-1', 'Test Feature', 'full');
      tracker.recordStageCompleted('feat-1', PipelineStage.REQUIREMENTS_GATHERING, makeStageResult());
      tracker.recordAgentTask('feat-1', PipelineStage.REQUIREMENTS_GATHERING, AgentRole.PRODUCT_MANAGER, 'Task', makeAgentResult());
      tracker.recordPipelineCompleted('feat-1', 'Test Feature', 2000, 5000, 2, 0);

      const markdown = tracker.generateMarkdown();

      expect(markdown.length).toBeGreaterThan(0);
      expect(markdown).toContain('# Development History');
      expect(markdown).toContain('Test Project');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('Features');
      expect(markdown).toContain('## Agent Activity');
      expect(markdown).toContain('## Stage Metrics');
      expect(markdown).toContain('## Timeline');
    });

    it('generates markdown even with no events', () => {
      const markdown = tracker.generateMarkdown();
      expect(markdown).toContain('# Development History');
      expect(markdown).toContain('## Summary');
    });
  });

  describe('saveHistory', () => {
    it('creates both markdown and JSON files on disk', () => {
      tracker.recordFeatureCreated(makeFeature());
      tracker.recordPipelineCompleted('feat-1', 'Test Feature', 1000, 2000, 1, 0);

      const result = tracker.saveHistory();

      expect(fs.existsSync(result.markdownPath)).toBe(true);
      expect(fs.existsSync(result.jsonPath)).toBe(true);

      expect(result.markdownPath).toContain('development-history.md');
      expect(result.jsonPath).toContain('development-history.json');

      const mdContent = fs.readFileSync(result.markdownPath, 'utf-8');
      expect(mdContent).toContain('# Development History');

      const jsonContent = JSON.parse(fs.readFileSync(result.jsonPath, 'utf-8'));
      expect(jsonContent.projectId).toBe('proj-1');
      expect(jsonContent.projectName).toBe('Test Project');
      expect(jsonContent.events).toHaveLength(2);
      expect(jsonContent.summary).toBeDefined();
    });

    it('creates files in custom output directory', () => {
      const outputDir = path.join(tempDir, 'custom-output');
      tracker.recordFeatureCreated(makeFeature());

      const result = tracker.saveHistory(outputDir);

      expect(fs.existsSync(result.markdownPath)).toBe(true);
      expect(result.markdownPath).toContain('custom-output');
    });
  });

  describe('persistence', () => {
    it('events survive constructor re-creation (load from disk)', () => {
      tracker.recordFeatureCreated(makeFeature());
      tracker.recordPipelineStarted('feat-1', 'Test Feature', 'full');
      tracker.recordPipelineCompleted('feat-1', 'Test Feature', 1000, 2000, 1, 0);

      const tracker2 = new DevelopmentTracker(tempDir, 'proj-1', 'Test Project');
      const events = tracker2.getEvents();

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe(TrackingEventType.FEATURE_CREATED);
      expect(events[1].type).toBe(TrackingEventType.PIPELINE_STARTED);
      expect(events[2].type).toBe(TrackingEventType.PIPELINE_COMPLETED);
      expect(events[0].timestamp).toBeInstanceOf(Date);
    });

    it('events file is written after each record call (NDJSON format)', () => {
      const eventsFile = path.join(tempDir, '.cdm', 'history', 'events.json');

      tracker.recordFeatureCreated(makeFeature());
      expect(fs.existsSync(eventsFile)).toBe(true);

      const lines1 = fs.readFileSync(eventsFile, 'utf-8').trim().split('\n').filter(l => l.trim());
      expect(lines1).toHaveLength(1);
      expect(JSON.parse(lines1[0]).type).toBe(TrackingEventType.FEATURE_CREATED);

      tracker.recordAnalysisGenerated(5, 100);
      const lines2 = fs.readFileSync(eventsFile, 'utf-8').trim().split('\n').filter(l => l.trim());
      expect(lines2).toHaveLength(2);
      expect(JSON.parse(lines2[1]).type).toBe(TrackingEventType.ANALYSIS_GENERATED);
    });
  });
});
