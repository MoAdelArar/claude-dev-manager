/**
 * Development tracker for CDM.
 * Refactored for dynamic persona system.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import {
  type TrackingEvent,
  type DevelopmentHistory,
  type HistorySummary,
  type Feature,
  type DynamicResult,
  TrackingEventType,
} from '../types.js';
import logger from '../utils/logger.js';

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

  recordFeatureCreated(feature: Feature): void {
    this.record({
      type: TrackingEventType.FEATURE_CREATED,
      featureId: feature.id,
      featureName: feature.name,
      message: `Feature created: "${feature.name}" [${feature.priority}]`,
      details: { priority: feature.priority, description: feature.description },
    });
  }

  recordExecutionStarted(
    featureId: string,
    featureName: string,
    personaIds: { primary: string; supporting: string[]; reviewLens: string[] },
    mode: string,
  ): void {
    this.record({
      type: TrackingEventType.EXECUTION_STARTED,
      featureId,
      featureName,
      personaId: personaIds.primary,
      personaIds: [personaIds.primary, ...personaIds.supporting],
      message: `Execution started for "${featureName}" with ${personaIds.primary} (mode: ${mode})`,
      details: { mode, personas: personaIds },
    });
  }

  recordExecutionCompleted(
    featureId: string,
    featureName: string,
    result: DynamicResult,
  ): void {
    this.record({
      type: TrackingEventType.EXECUTION_COMPLETED,
      featureId,
      featureName,
      personaId: result.personas.primary,
      message: `Execution completed for "${featureName}" — ${result.artifacts.length} artifacts, ${result.issues.length} issues`,
      details: {
        artifactCount: result.artifacts.length,
        issueCount: result.issues.length,
        hadReviewPass: result.hadReviewPass,
        personas: result.personas,
      },
      durationMs: result.totalDurationMs,
      tokensUsed: result.totalTokensUsed,
    });
  }

  recordExecutionFailed(
    featureId: string,
    featureName: string,
    personaId: string,
    error?: string,
  ): void {
    this.record({
      type: TrackingEventType.EXECUTION_FAILED,
      featureId,
      featureName,
      personaId,
      message: `Execution failed for "${featureName}"${error ? `: ${error}` : ''}`,
      details: { error, personaId },
    });
  }

  recordReviewPassStarted(
    featureId: string,
    featureName: string,
    reviewPersonaId: string,
  ): void {
    this.record({
      type: TrackingEventType.REVIEW_PASS_STARTED,
      featureId,
      featureName,
      personaId: reviewPersonaId,
      message: `Review pass started for "${featureName}" with ${reviewPersonaId}`,
      details: { reviewPersonaId },
    });
  }

  recordReviewPassCompleted(
    featureId: string,
    featureName: string,
    reviewPersonaId: string,
    issueCount: number,
  ): void {
    this.record({
      type: TrackingEventType.REVIEW_PASS_COMPLETED,
      featureId,
      featureName,
      personaId: reviewPersonaId,
      message: `Review pass completed for "${featureName}" — ${issueCount} issues found`,
      details: { reviewPersonaId, issueCount },
    });
  }

  recordArtifactProduced(
    featureId: string,
    artifactName: string,
    artifactType: string,
    personaId: string,
  ): void {
    this.record({
      type: TrackingEventType.ARTIFACT_PRODUCED,
      featureId,
      personaId,
      message: `Artifact produced: "${artifactName}" (${artifactType}) by ${personaId}`,
      details: { artifactName, artifactType },
    });
  }

  recordIssueFound(
    featureId: string,
    issueTitle: string,
    severity: string,
    personaId: string,
  ): void {
    this.record({
      type: TrackingEventType.ISSUE_FOUND,
      featureId,
      personaId,
      message: `Issue found [${severity}]: "${issueTitle}" by ${personaId}`,
      details: { issueTitle, severity },
    });
  }

  recordPersonasFetched(personaCount: number, divisions: string[]): void {
    this.record({
      type: TrackingEventType.PERSONAS_FETCHED,
      message: `Fetched ${personaCount} personas from ${divisions.length} divisions`,
      details: { personaCount, divisions },
    });
  }

  recordPersonasResolved(
    featureId: string,
    primary: string,
    supporting: string[],
    reviewLens: string[],
    reason: string,
  ): void {
    this.record({
      type: TrackingEventType.PERSONAS_RESOLVED,
      featureId,
      personaId: primary,
      personaIds: [primary, ...supporting, ...reviewLens],
      message: `Personas resolved for feature: primary=${primary}, reason: ${reason}`,
      details: { primary, supporting, reviewLens, reason },
    });
  }

  recordAnalysisGenerated(modules: number, lines: number): void {
    this.record({
      type: TrackingEventType.ANALYSIS_GENERATED,
      message: `Project analysis generated: ${modules} modules, ${lines.toLocaleString()} lines`,
      details: { modules, lines },
    });
  }

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

  buildSummary(): HistorySummary {
    const personaUsage: HistorySummary['personaUsage'] = {};

    let totalTokens = 0;
    let totalDuration = 0;
    let totalArtifacts = 0;
    let totalIssuesFound = 0;
    let totalIssuesResolved = 0;
    let completedFeatures = 0;
    let failedFeatures = 0;
    let totalExecutions = 0;
    const featureIds = new Set<string>();

    for (const event of this.events) {
      if (event.featureId) featureIds.add(event.featureId);

      if (event.personaId) {
        if (!personaUsage[event.personaId]) {
          personaUsage[event.personaId] = { executions: 0, tokensUsed: 0, durationMs: 0 };
        }
        if (event.type === TrackingEventType.EXECUTION_COMPLETED) {
          personaUsage[event.personaId].executions++;
          personaUsage[event.personaId].tokensUsed += event.tokensUsed ?? 0;
          personaUsage[event.personaId].durationMs += event.durationMs ?? 0;
        }
      }

      if (event.type === TrackingEventType.EXECUTION_COMPLETED) {
        completedFeatures++;
        totalExecutions++;
        totalTokens += event.tokensUsed ?? 0;
        totalDuration += event.durationMs ?? 0;
      }
      if (event.type === TrackingEventType.EXECUTION_FAILED) failedFeatures++;
      if (event.type === TrackingEventType.ARTIFACT_PRODUCED) totalArtifacts++;
      if (event.type === TrackingEventType.ISSUE_FOUND) totalIssuesFound++;
      if (event.type === TrackingEventType.ISSUE_RESOLVED) totalIssuesResolved++;
    }

    return {
      totalFeatures: featureIds.size,
      completedFeatures,
      failedFeatures,
      totalExecutions,
      totalArtifactsProduced: totalArtifacts,
      totalIssuesFound,
      totalIssuesResolved,
      totalTokensUsed: totalTokens,
      totalDurationMs: totalDuration,
      personaUsage,
    };
  }

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

    lines.push('## Summary');
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Features | ${s.totalFeatures} (${s.completedFeatures} completed, ${s.failedFeatures} failed) |`);
    lines.push(`| Executions | ${s.totalExecutions} |`);
    lines.push(`| Artifacts produced | ${s.totalArtifactsProduced} |`);
    lines.push(`| Issues found | ${s.totalIssuesFound} |`);
    lines.push(`| Issues resolved | ${s.totalIssuesResolved} |`);
    lines.push(`| Total tokens used | ${s.totalTokensUsed.toLocaleString()} |`);
    lines.push(`| Total duration | ${(s.totalDurationMs / 1000).toFixed(1)}s |`);
    lines.push('');

    if (Object.keys(s.personaUsage).length > 0) {
      lines.push('## Persona Usage');
      lines.push('| Persona | Executions | Tokens | Duration |');
      lines.push('|---|---|---|---|');
      for (const [personaId, data] of Object.entries(s.personaUsage)) {
        lines.push(`| ${personaId} | ${data.executions} | ${data.tokensUsed.toLocaleString()} | ${(data.durationMs / 1000).toFixed(1)}s |`);
      }
      lines.push('');
    }

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

  private record(partial: Omit<TrackingEvent, 'id' | 'timestamp' | 'details'> & { details?: Record<string, unknown> }): void {
    const event: TrackingEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      details: {},
      ...partial,
    };
    this.events.push(event);
    this.appendEvent(event);
    logger.debug(`[tracker] ${event.message}`);
  }

  private appendEvent(event: TrackingEvent): void {
    try {
      fs.appendFileSync(this.eventsFile, JSON.stringify(event) + '\n', 'utf-8');
    } catch {
      // Non-critical — events are already in memory
    }
  }

  private loadEvents(): void {
    if (!fs.existsSync(this.eventsFile)) return;
    try {
      const raw = fs.readFileSync(this.eventsFile, 'utf-8').trim();
      if (!raw) return;

      if (raw.startsWith('[')) {
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
      [TrackingEventType.EXECUTION_STARTED]: '>',
      [TrackingEventType.EXECUTION_COMPLETED]: 'OK',
      [TrackingEventType.EXECUTION_FAILED]: 'FAIL',
      [TrackingEventType.REVIEW_PASS_STARTED]: 'REV>',
      [TrackingEventType.REVIEW_PASS_COMPLETED]: 'REV',
      [TrackingEventType.ARTIFACT_PRODUCED]: 'ART',
      [TrackingEventType.ISSUE_FOUND]: 'ISSUE',
      [TrackingEventType.ISSUE_RESOLVED]: 'FIX',
      [TrackingEventType.CONFIG_CHANGED]: 'CFG',
      [TrackingEventType.ANALYSIS_GENERATED]: 'SCAN',
      [TrackingEventType.PERSONAS_FETCHED]: 'FETCH',
      [TrackingEventType.PERSONAS_RESOLVED]: 'MATCH',
    };
    return `[${icons[type] ?? '?'}]`;
  }
}
