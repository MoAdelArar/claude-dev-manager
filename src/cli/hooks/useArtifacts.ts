import { useState, useEffect, useCallback } from 'react';
import { ArtifactStore } from '../../workspace/artifact-store.js';
import type { Artifact } from '../../types.js';

export interface ArtifactSummary {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
}

export interface UseArtifactsResult {
  artifacts: Artifact[];
  summary: ArtifactSummary;
  loading: boolean;
  error: Error | null;
  getById: (id: string) => Artifact | undefined;
  getByName: (name: string) => Artifact | undefined;
  refresh: () => void;
}

export function useArtifacts(projectPath: string): UseArtifactsResult {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [summary, setSummary] = useState<ArtifactSummary>({ total: 0, byType: {}, byStatus: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [store, setStore] = useState<ArtifactStore | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    try {
      setLoading(true);
      setError(null);

      const artifactStore = new ArtifactStore(projectPath);
      setStore(artifactStore);
      
      const allArtifacts = artifactStore.getAll();
      const artifactSummary = artifactStore.getSummary();

      setArtifacts(allArtifacts);
      setSummary(artifactSummary);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [projectPath, refreshCounter]);

  const getById = useCallback((id: string): Artifact | undefined => {
    return store?.getById(id);
  }, [store]);

  const getByName = useCallback((name: string): Artifact | undefined => {
    return store?.getByName(name);
  }, [store]);

  const refresh = (): void => {
    setRefreshCounter((c) => c + 1);
  };

  return { artifacts, summary, loading, error, getById, getByName, refresh };
}
