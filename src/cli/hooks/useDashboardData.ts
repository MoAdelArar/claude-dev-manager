import { useState, useEffect } from 'react';
import { ProjectContext } from '../../orchestrator/context.js';
import { ArtifactStore } from '../../workspace/artifact-store.js';
import { DevelopmentTracker } from '../../tracker/development-tracker.js';
import { loadConfig, type CDMConfig } from '../../utils/config.js';
import type { Project, Artifact, Issue, FeatureStatus, TrackingEvent } from '../../types.js';

export interface WeekStats {
  featuresCreated: number;
  pipelinesRun: number;
  tokensUsed: number;
  successRate: number;
}

export interface ActiveFeature {
  id: string;
  name: string;
  status: FeatureStatus;
  currentStep: number;
  totalSteps: number;
  createdAt: Date;
}

export interface RecentArtifact {
  id: string;
  name: string;
  type: string;
  createdAt: Date;
  featureId?: string;
}

export interface OpenIssue {
  id: string;
  title: string;
  severity: string;
  featureId?: string;
  createdAt: Date;
}

export interface DashboardData {
  project: Project | null;
  weekStats: WeekStats;
  activeFeatures: ActiveFeature[];
  recentArtifacts: RecentArtifact[];
  openIssues: OpenIssue[];
  config: CDMConfig | null;
}

export interface UseDashboardDataResult {
  data: DashboardData | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

function getWeekStart(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const weekStart = new Date(now);
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

export function useDashboardData(projectPath: string): UseDashboardDataResult {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    try {
      setLoading(true);
      setError(null);

      const context = new ProjectContext(projectPath);
      const artifactStore = new ArtifactStore(projectPath);
      const project = context.getProject();
      const tracker = new DevelopmentTracker(projectPath, project.id, project.name);
      const config = loadConfig(projectPath);

      const features = context.getAllFeatures();
      const allArtifacts = artifactStore.getAll();

      const weekStart = getWeekStart();

      const featuresThisWeek = features.filter(
        (f) => new Date(f.createdAt) >= weekStart
      );

      const history = tracker.getEvents();
      const pipelineCompletedEvents = history.filter(
        (e: TrackingEvent) =>
          e.type === 'pipeline_completed' &&
          new Date(e.timestamp) >= weekStart
      );

      const pipelineFailedEvents = history.filter(
        (e: TrackingEvent) =>
          e.type === 'pipeline_failed' &&
          new Date(e.timestamp) >= weekStart
      );

      const totalPipelines = pipelineCompletedEvents.length + pipelineFailedEvents.length;

      let tokensThisWeek = 0;
      for (const event of pipelineCompletedEvents) {
        const eventData = event as TrackingEvent;
        tokensThisWeek += eventData.tokensUsed ?? 0;
      }
      for (const event of pipelineFailedEvents) {
        const eventData = event as TrackingEvent;
        tokensThisWeek += eventData.tokensUsed ?? 0;
      }

      const weekStats: WeekStats = {
        featuresCreated: featuresThisWeek.length,
        pipelinesRun: totalPipelines,
        tokensUsed: tokensThisWeek,
        successRate:
          totalPipelines > 0
            ? Math.round((pipelineCompletedEvents.length / totalPipelines) * 100)
            : 0,
      };

      const activeFeatures: ActiveFeature[] = features
        .filter((f) => f.status === 'in_progress' || f.status === 'on_hold')
        .slice(0, 5)
        .map((f) => ({
          id: f.id,
          name: f.name,
          status: f.status,
          currentStep: f.currentStepIndex ?? 0,
          totalSteps: f.executionPlan?.steps?.length ?? 0,
          createdAt: new Date(f.createdAt),
        }));

      const recentArtifacts: RecentArtifact[] = allArtifacts
        .sort((a: Artifact, b: Artifact) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
        .map((a: Artifact) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          createdAt: new Date(a.createdAt),
          featureId: (a.metadata?.featureId as string) ?? undefined,
        }));

      const allIssues: Issue[] = [];
      for (const feature of features) {
        if (feature.issues) {
          for (const issue of feature.issues) {
            allIssues.push({ ...issue, featureId: feature.id } as Issue & { featureId: string });
          }
        }
      }

      const openIssues: OpenIssue[] = allIssues
        .filter((i) => i.status !== 'resolved')
        .sort((a, b) => {
          const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
          return (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4);
        })
        .slice(0, 5)
        .map((i) => ({
          id: i.id,
          title: i.title,
          severity: i.severity,
          featureId: (i as Issue & { featureId?: string }).featureId,
          createdAt: new Date(i.createdAt),
        }));

      setData({
        project,
        weekStats,
        activeFeatures,
        recentArtifacts,
        openIssues,
        config,
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [projectPath, refreshCounter]);

  const refresh = (): void => {
    setRefreshCounter((c) => c + 1);
  };

  return { data, loading, error, refresh };
}
