import { useState, useEffect } from 'react';
import { ProjectContext } from '../../orchestrator/context.js';
import { loadConfig, type CDMConfig } from '../../utils/config.js';
import type { Project, Feature } from '../../types.js';

export interface UseProjectResult {
  project: Project | null;
  features: Feature[];
  config: CDMConfig | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useProject(projectPath: string): UseProjectResult {
  const [project, setProject] = useState<Project | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [config, setConfig] = useState<CDMConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    try {
      setLoading(true);
      setError(null);

      const context = new ProjectContext(projectPath);
      const proj = context.getProject();
      const feats = context.getAllFeatures();
      const cfg = loadConfig(projectPath);

      setProject(proj);
      setFeatures(feats);
      setConfig(cfg);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [projectPath, refreshCounter]);

  const refresh = (): void => {
    setRefreshCounter((c) => c + 1);
  };

  return { project, features, config, loading, error, refresh };
}
