import { useState, useCallback } from 'react';
import { ProjectContext } from '../../orchestrator/context.js';
import { ArtifactStore } from '../../workspace/artifact-store.js';
import { PipelineOrchestrator, type PipelineOptions } from '../../orchestrator/pipeline.js';
import { loadConfig } from '../../utils/config.js';
import type { Feature, PipelineResult, AgentRole } from '../../types.js';

export type ExecutionMode = 'claude-cli' | 'simulation';

export type PipelineStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface UsePipelineOptions {
  projectPath: string;
  executionMode?: ExecutionMode;
  model?: string;
}

export interface UsePipelineResult {
  status: PipelineStatus;
  currentStep: number;
  result: PipelineResult | null;
  error: Error | null;
  run: (feature: Feature, options: PipelineOptions) => Promise<PipelineResult>;
  reset: () => void;
}

export interface PipelineCallbacks {
  onStepStart?: (step: { index: number; description: string; agent: AgentRole; skills: string[] }) => void;
  onStepComplete?: (step: { index: number; description: string; agent: AgentRole; skills: string[] }) => void;
  onAgentWork?: (role: AgentRole, task: unknown) => void;
  onError?: (stepIndex: number, error: Error) => void;
}

export function usePipeline(options: UsePipelineOptions): UsePipelineResult {
  const [status, setStatus] = useState<PipelineStatus>('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async (
    feature: Feature,
    pipelineOptions: PipelineOptions
  ): Promise<PipelineResult> => {
    setStatus('running');
    setError(null);
    setResult(null);
    setCurrentStep(0);

    try {
      const context = new ProjectContext(options.projectPath);
      const artifactStore = new ArtifactStore(options.projectPath);
      const config = loadConfig(options.projectPath);

      const bridgeOptions = {
        executionMode: options.executionMode ?? 'claude-cli' as ExecutionMode,
        model: options.model,
      };

      const orchestrator = new PipelineOrchestrator(context, artifactStore, config, bridgeOptions);

      const wrappedOptions: PipelineOptions = {
        ...pipelineOptions,
        onStepStart: (step) => {
          setCurrentStep(step.index);
          pipelineOptions.onStepStart?.(step);
        },
        onStepComplete: pipelineOptions.onStepComplete,
        onAgentWork: pipelineOptions.onAgentWork,
        onError: pipelineOptions.onError,
      };

      const pipelineResult = await orchestrator.runFeaturePipeline(feature, wrappedOptions);

      setResult(pipelineResult);
      setStatus(pipelineResult.success ? 'completed' : 'failed');

      return pipelineResult;
    } catch (err) {
      const pipelineError = err instanceof Error ? err : new Error(String(err));
      setError(pipelineError);
      setStatus('failed');
      throw pipelineError;
    }
  }, [options.projectPath, options.executionMode, options.model]);

  const reset = useCallback((): void => {
    setStatus('idle');
    setCurrentStep(0);
    setResult(null);
    setError(null);
  }, []);

  return { status, currentStep, result, error, run, reset };
}
