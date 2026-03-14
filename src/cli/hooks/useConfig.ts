import { useState, useEffect, useCallback } from 'react';
import { loadConfig, saveConfig, getDefaultConfig, type CDMConfig } from '../../utils/config.js';

export interface UseConfigResult {
  config: CDMConfig | null;
  loading: boolean;
  error: Error | null;
  update: (updates: Partial<CDMConfig>) => void;
  setValue: (keyPath: string, value: unknown) => void;
  reset: () => void;
  reload: () => void;
}

function setNestedValue(obj: Record<string, unknown>, keyPath: string, value: unknown): void {
  const keys = keyPath.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

export function useConfig(projectPath: string): UseConfigResult {
  const [config, setConfig] = useState<CDMConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  useEffect(() => {
    try {
      setLoading(true);
      setError(null);
      const cfg = loadConfig(projectPath);
      setConfig(cfg);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [projectPath, reloadCounter]);

  const update = useCallback((updates: Partial<CDMConfig>): void => {
    if (!config) return;
    try {
      const newConfig = { ...config, ...updates } as CDMConfig;
      saveConfig(projectPath, newConfig);
      setConfig(newConfig);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [config, projectPath]);

  const setValue = useCallback((keyPath: string, value: unknown): void => {
    if (!config) return;
    try {
      const newConfig = structuredClone(config);
      setNestedValue(newConfig as unknown as Record<string, unknown>, keyPath, value);
      saveConfig(projectPath, newConfig);
      setConfig(newConfig);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [config, projectPath]);

  const reset = useCallback((): void => {
    try {
      const defaultConfig = getDefaultConfig();
      saveConfig(projectPath, defaultConfig);
      setConfig(defaultConfig);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [projectPath]);

  const reload = useCallback((): void => {
    setReloadCounter((c) => c + 1);
  }, []);

  return { config, loading, error, update, setValue, reset, reload };
}
