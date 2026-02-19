import * as fs from 'node:fs';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import {
  type TrackingEvent,
  type DevelopmentHistory,
  type HistorySummary,
  type StageResult,
  type AgentResult,
  type Feature,
  TrackingEventType,
  PipelineStage,
  AgentRole,
} from '../types';
import logger from '../utils/logger';

export class DevelopmentTracker {
  private events: TrackingEvent[] = [];
  private readonly historyDir: string;
  private readonly eventsFile: string;
  private projectId: string;
  private projectName: string;

  constructor(projectPath: string, projectId: string, projectName: string) {
    this.historyDir = path.join(projectPath, '.cdm', 'history');
    this.eventsFile = path.join(this.historyDir, 'events.json');
    this.projectId = projectId;
    this.projectName = projectName;
    this.ensureDir();
    this.loadEvents();
  }

  // ── Event recording ───────────────────────────────────────────────────

  recordFeatureCreated(feature: Feature): void {
    this.record({
      type: TrackingEventType.FEATURE_CREATED,
      featureId: feature.id,
      featureName: feature.name,
      message: `Feature created: "${feature.name}" [${feature.priority}]`,
      details: { priority: feature.priority, description: feature.description },
    });
  }

  recordPipelineStarted(featureId: string, featureName: string, mode: string): void {
    this.record({
      type: TrackingEventType.PIPELINE_STARTED,
      featureId,
      featureName,
      message: `Pipeline started for "${featureName}" (mode: ${mode})`,
      details: { mode },
    });
  }

  recordPipelineCompleted(featureId: string, featureName: string, durationMs: number, tokensUsed: number, artifactCount: number, issueCount: number): void {
    this.record({
      type: TrackingEventType.PIPELINE_COMPLETED,
      featureId,
      featureName,
      message: `Pipeline completed for "${featureName}" — ${artifactCount} artifacts, ${issueCount} issues`,
      details: { artifactCount, issueCount },
      durationMs,
      tokensUsed,
    });
  }

  recordPipelineFailed(featureId: string, featureName: string, failedStage: PipelineStage, error?: string): void {
    this.record({
      type: TrackingEventType.PIPELINE_FAILED,
      featureId,
      featureName,
      stage: failedStage,
      message: `Pipeline failed at ${failedStage} for "${featureName}"${error ? `: ${error}` : ''}`,
      details: { failedStage, error },
    });
  }

  recordStageStarted(featureId: string, stage: PipelineStage, primaryAgent: AgentRole): void {
    this.record({
      type: TrackingEventType.STAGE_STARTED,
      featureId,
      stage,
      agentRole: primaryAgent,
      message: `Stage started: ${stage} (primary: ${primaryAgent})`,
      details: { primaryAgent },
    });
  }

  recordStageCompleted(featureId: string, stage: PipelineStage, result: StageResult): void {
    this.record({
      type: TrackingEventType.STAGE_COMPLETED,
      featureId,
      stage,
      message: `Stage completed: ${stage} [${result.status}] — ${result.artifacts.length} artifacts, ${result.issues.length} issues`,
      details: {
        status: result.status,
        artifactCount: result.artifacts.length,
        issueCount: result.issues.length,
        artifactNames: result.artifacts.map(a => a.name),
        issueTypes: result.issues.map(i => `${i.severity}:${i.type}`),
      },
      durationMs: result.metrics.durationMs,
      tokensUsed: result.metrics.tokensUsed,
    });
  }

  recordStageFailed(featureId: string, stage: PipelineStage, error: string): void {
    this.record({
      type: TrackingEventType.STAGE_FAILED,
      featureId,
      stage,
      message: `Stage failed: ${stage} — ${error}`,
      details: { error },
    });
  }

  recordStageSkipped(featureId: string, stage: PipelineStage, reason: string): void {
    this.record({
      type: TrackingEventType.STAGE_SKIPPED,
      featureId,
      stage,
      message: `Stage skipped: ${stage} — ${reason}`,
      details: { reason },
    });
  }

  recordStageRetried(featureId: string, stage: PipelineStage, attempt: number, maxRetries: number): void {
    this.record({
      type: TrackingEventType.STAGE_RETRIED,
      featureId,
      stage,
      message: `Stage retry: ${stage} (attempt ${attempt}/${maxRetries})`,
      details: { attempt, maxRetries },
    });
  }

  recordAgentTask(featureId: string, stage: PipelineStage, role: AgentRole, taskTitle: string, result: AgentResult): void {
    const eventType = result.status === 'success'
      ? TrackingEventType.AGENT_TASK_COMPLETED
      : TrackingEventType.AGENT_TASK_FAILED;

    this.record({
      type: eventType,
      featureId,
      stage,
      agentRole: role,
      message: `${role} ${result.status}: "${taskTitle}" — ${result.artifacts.length} artifacts, ${result.issues.length} issues`,
      details: {
        taskTitle,
        status: result.status,
        artifactCount: result.artifacts.length,
        issueCount: result.issues.length,
      },
      durationMs: result.durationMs,
      tokensUsed: result.tokensUsed,
    });
  }

  recordArtifactProduced(featureId: string, stage: PipelineStage, artifactName: string, artifactType: string, agentRole: AgentRole): void {
    this.record({
      type: TrackingEventType.ARTIFACT_PRODUCED,
      featureId,
      stage,
      agentRole,
      message: `Artifact produced: "${artifactName}" (${artifactType}) by ${agentRole}`,
      details: { artifactName, artifactType },
    });
  }

  recordIssueFound(featureId: string, stage: PipelineStage, issueTitle: string, severity: string, agentRole: AgentRole): void {
    this.record({
      type: TrackingEventType.ISSUE_FOUND,
      featureId,
      stage,
      agentRole,
      message: `Issue found [${severity}]: "${issueTitle}" by ${agentRole}`,
      details: { issueTitle, severity },
    });
  }

  recordAnalysisGenerated(modules: number, lines: number): void {
    this.record({
      type: TrackingEventType.ANALYSIS_GENERATED,
      message: `Project analysis generated: ${modules} modules, ${lines.toLocaleString()} lines`,
      details: { modules, lines },
    });
  }

  // ── Query ─────────────────────────────────────────────────────────────

  getEvents(): TrackingEvent[] {
    return [...this.events];
  }

  getEventsForFeature(featureId: string): TrackingEvent[] {
    return this.events.filter(e => e.featureId === featureId);
  }

  getEventsByType(type: TrackingEventType): TrackingEvent[] {
    return this.events.filter(e => e.type === type);
  }

  getRecentEvents(count: number): TrackingEvent[] {
    return this.events.slice(-count);
  }

  // ── Summary computation ───────────────────────────────────────────────

  buildSummary(): HistorySummary {
    const agentActivity: HistorySummary['agentActivity'] = {};
    const stageRuns: Record<string, { durations: number[]; tokens: number[]; failures: number; total: number }> = {};

    let totalTokens = 0;
    let totalDuration = 0;
    let totalArtifacts = 0;
    let totalIssuesFound = 0;
    let totalIssuesResolved = 0;
    let completedFeatures = 0;
    let failedFeatures = 0;
    const featureIds = new Set<string>();

    for (const event of this.events) {
      if (event.featureId) featureIds.add(event.featureId);

      if (event.agentRole) {
        if (!agentActivity[event.agentRole]) {
          agentActivity[event.agentRole] = { tasks: 0, tokensUsed: 0, durationMs: 0 };
        }
        if (event.type === TrackingEventType.AGENT_TASK_COMPLETED || event.type === TrackingEventType.AGENT_TASK_FAILED) {
          agentActivity[event.agentRole].tasks++;
          agentActivity[event.agentRole].tokensUsed += event.tokensUsed ?? 0;
          agentActivity[event.agentRole].durationMs += event.durationMs ?? 0;
        }
      }

      if (event.stage && (event.type === TrackingEventType.STAGE_COMPLETED || event.type === TrackingEventType.STAGE_FAILED)) {
        if (!stageRuns[event.stage]) {
          stageRuns[event.stage] = { durations: [], tokens: [], failures: 0, total: 0 };
        }
        stageRuns[event.stage].total++;
        stageRuns[event.stage].durations.push(event.durationMs ?? 0);
        stageRuns[event.stage].tokens.push(event.tokensUsed ?? 0);
        if (event.type === TrackingEventType.STAGE_FAILED) stageRuns[event.stage].failures++;
      }

      if (event.type === TrackingEventType.PIPELINE_COMPLETED) {
        completedFeatures++;
        totalTokens += event.tokensUsed ?? 0;
        totalDuration += event.durationMs ?? 0;
      }
      if (event.type === TrackingEventType.PIPELINE_FAILED) failedFeatures++;
      if (event.type === TrackingEventType.ARTIFACT_PRODUCED) totalArtifacts++;
      if (event.type === TrackingEventType.ISSUE_FOUND) totalIssuesFound++;
      if (event.type === TrackingEventType.ISSUE_RESOLVED) totalIssuesResolved++;
    }

    const stageMetrics: HistorySummary['stageMetrics'] = {};
    for (const [stage, data] of Object.entries(stageRuns)) {
      const avgDur = data.durations.length > 0 ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length : 0;
      const avgTok = data.tokens.length > 0 ? data.tokens.reduce((a, b) => a + b, 0) / data.tokens.length : 0;
      stageMetrics[stage] = {
        runs: data.total,
        avgDurationMs: Math.round(avgDur),
        avgTokens: Math.round(avgTok),
        failureRate: data.total > 0 ? data.failures / data.total : 0,
      };
    }

    return {
      totalFeatures: featureIds.size,
      completedFeatures,
      failedFeatures,
      totalStagesExecuted: Object.values(stageRuns).reduce((sum, d) => sum + d.total, 0),
      totalArtifactsProduced: totalArtifacts,
      totalIssuesFound,
      totalIssuesResolved,
      totalTokensUsed: totalTokens,
      totalDurationMs: totalDuration,
      agentActivity,
      stageMetrics,
    };
  }

  // ── Report generation ─────────────────────────────────────────────────

  buildHistory(): DevelopmentHistory {
    return {
      projectId: this.projectId,
      projectName: this.projectName,
      generatedAt: new Date().toISOString(),
      events: this.events,
      summary: this.buildSummary(),
    };
  }

  generateMarkdown(): string {
    const history = this.buildHistory();
    const s = history.summary;
    const lines: string[] = [];

    lines.push(`# Development History: ${history.projectName}`);
    lines.push(`> Generated: ${history.generatedAt}\n`);

    // Summary
    lines.push('## Summary');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Features | ${s.totalFeatures} (${s.completedFeatures} completed, ${s.failedFeatures} failed) |`);
    lines.push(`| Stages executed | ${s.totalStagesExecuted} |`);
    lines.push(`| Artifacts produced | ${s.totalArtifactsProduced} |`);
    lines.push(`| Issues found | ${s.totalIssuesFound} |`);
    lines.push(`| Issues resolved | ${s.totalIssuesResolved} |`);
    lines.push(`| Total tokens used | ${s.totalTokensUsed.toLocaleString()} |`);
    lines.push(`| Total duration | ${(s.totalDurationMs / 1000).toFixed(1)}s |`);
    lines.push('');

    // Agent activity
    if (Object.keys(s.agentActivity).length > 0) {
      lines.push('## Agent Activity');
      lines.push('| Agent | Tasks | Tokens | Duration |');
      lines.push('|---|---|---|---|');
      for (const [role, data] of Object.entries(s.agentActivity)) {
        const name = role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        lines.push(`| ${name} | ${data.tasks} | ${data.tokensUsed.toLocaleString()} | ${(data.durationMs / 1000).toFixed(1)}s |`);
      }
      lines.push('');
    }

    // Stage metrics
    if (Object.keys(s.stageMetrics).length > 0) {
      lines.push('## Stage Metrics');
      lines.push('| Stage | Runs | Avg Duration | Avg Tokens | Failure Rate |');
      lines.push('|---|---|---|---|---|');
      for (const [stage, data] of Object.entries(s.stageMetrics)) {
        const name = stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        lines.push(`| ${name} | ${data.runs} | ${(data.avgDurationMs / 1000).toFixed(1)}s | ${data.avgTokens.toLocaleString()} | ${(data.failureRate * 100).toFixed(0)}% |`);
      }
      lines.push('');
    }

    // Timeline (most recent 100 events)
    const recentEvents = this.events.slice(-100);
    if (recentEvents.length > 0) {
      lines.push('## Timeline\n');
      let currentDate = '';
      for (const event of recentEvents) {
        const date = new Date(event.timestamp);
        const dateStr = date.toLocaleDateString();
        if (dateStr !== currentDate) {
          currentDate = dateStr;
          lines.push(`### ${dateStr}\n`);
        }

        const time = date.toLocaleTimeString();
        const icon = this.eventIcon(event.type);
        const tokenStr = event.tokensUsed ? ` (${event.tokensUsed.toLocaleString()} tokens)` : '';
        const durStr = event.durationMs ? ` [${(event.durationMs / 1000).toFixed(1)}s]` : '';
        lines.push(`- \`${time}\` ${icon} ${event.message}${tokenStr}${durStr}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  saveHistory(outputDir?: string): { markdownPath: string; jsonPath: string } {
    const dir = outputDir ?? this.historyDir;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const markdownPath = path.join(dir, 'development-history.md');
    const jsonPath = path.join(dir, 'development-history.json');

    fs.writeFileSync(markdownPath, this.generateMarkdown(), 'utf-8');
    fs.writeFileSync(jsonPath, JSON.stringify(this.buildHistory(), null, 2), 'utf-8');

    return { markdownPath, jsonPath };
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private record(partial: Omit<TrackingEvent, 'id' | 'timestamp' | 'details'> & { details?: Record<string, unknown> }): void {
    const event: TrackingEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      details: {},
      ...partial,
    };
    this.events.push(event);
    this.appendEvent(event); // O(1) single-line append instead of O(n) full rewrite
    logger.debug(`[tracker] ${event.message}`);
  }

  // Append a single event as a newline-delimited JSON entry. O(1) per event.
  private appendEvent(event: TrackingEvent): void {
    try {
      fs.appendFileSync(this.eventsFile, JSON.stringify(event) + '\n', 'utf-8');
    } catch {
      // Non-critical — events are already in memory; persisted at saveHistory() time
    }
  }

  private loadEvents(): void {
    if (!fs.existsSync(this.eventsFile)) return;
    try {
      const raw = fs.readFileSync(this.eventsFile, 'utf-8').trim();
      if (!raw) return;

      if (raw.startsWith('[')) {
        // Legacy format: full JSON array — parse and migrate to NDJSON
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.events = parsed.map((e: any) => ({ ...e, timestamp: new Date(e.timestamp) }));
          fs.writeFileSync(
            this.eventsFile,
            this.events.map(e => JSON.stringify(e)).join('\n') + '\n',
            'utf-8',
          );
        }
      } else {
        // NDJSON: one JSON object per line
        this.events = raw
          .split('\n')
          .filter(l => l.trim())
          .map(l => {
            const e = JSON.parse(l);
            return { ...e, timestamp: new Date(e.timestamp) } as TrackingEvent;
          });
      }
    } catch {
      this.events = [];
    }
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }
  }

  private eventIcon(type: TrackingEventType): string {
    const icons: Record<TrackingEventType, string> = {
      [TrackingEventType.FEATURE_CREATED]: '+',
      [TrackingEventType.PIPELINE_STARTED]: '>',
      [TrackingEventType.PIPELINE_COMPLETED]: 'OK',
      [TrackingEventType.PIPELINE_FAILED]: 'FAIL',
      [TrackingEventType.STAGE_STARTED]: '>',
      [TrackingEventType.STAGE_COMPLETED]: 'OK',
      [TrackingEventType.STAGE_FAILED]: 'FAIL',
      [TrackingEventType.STAGE_SKIPPED]: 'SKIP',
      [TrackingEventType.STAGE_RETRIED]: 'RETRY',
      [TrackingEventType.AGENT_TASK_STARTED]: '>',
      [TrackingEventType.AGENT_TASK_COMPLETED]: 'OK',
      [TrackingEventType.AGENT_TASK_FAILED]: 'FAIL',
      [TrackingEventType.ARTIFACT_PRODUCED]: 'ART',
      [TrackingEventType.ISSUE_FOUND]: 'ISSUE',
      [TrackingEventType.ISSUE_RESOLVED]: 'FIX',
      [TrackingEventType.GATE_EVALUATED]: 'GATE',
      [TrackingEventType.HANDOFF_COMPLETED]: '->',
      [TrackingEventType.CONFIG_CHANGED]: 'CFG',
      [TrackingEventType.ANALYSIS_GENERATED]: 'SCAN',
    };
    return `[${icons[type] ?? '?'}]`;
  }
}
