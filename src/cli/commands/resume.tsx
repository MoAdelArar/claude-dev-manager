import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { colors } from '../utils/colors.js';
import { Spinner } from '../components/Spinner.js';
import { PipelineProgress } from '../components/PipelineProgress.js';
import { EnhancedErrorDisplay } from '../components/EnhancedErrorDisplay.js';
import { ProjectContext } from '../../orchestrator/context.js';
import { ArtifactStore } from '../../workspace/artifact-store.js';
import { PipelineOrchestrator, type PipelineOptions } from '../../orchestrator/pipeline.js';
import { loadConfig } from '../../utils/config.js';
import { addFileTransport } from '../../utils/logger.js';
import { isRtkInstalled, getRtkGain } from '../../utils/rtk.js';
import { formatAgentName, getAgentIcon, formatDuration, formatTokens } from '../utils/format.js';
import { FeatureStatus, StepStatus, type Feature, type PipelineResult } from '../../types.js';
import { EXIT_CODES, type PipelineStepUI } from '../types.js';

export const args = z.tuple([
  z.string().optional().describe('Feature ID to resume (uses most recent if omitted)'),
]);

export const options = z.object({
  skipSteps: z.string().default('').describe('Comma-separated step indices to skip'),
  maxRetries: z.string().default('2').describe('Maximum retries per step'),
  project: z.string().default(process.cwd()).describe('Project path'),
  mode: z.string().default('claude-cli').describe('Execution mode: claude-cli or simulation'),
  model: z.string().optional().describe('Claude model to use'),
  verbose: z.boolean().default(false).describe('Verbose output'),
  json: z.boolean().default(false).describe('Output result as JSON'),
});

type Props = {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
};

type ResumePhase = 'loading' | 'running' | 'done' | 'error';

interface ResumeState {
  phase: ResumePhase;
  feature?: Feature;
  currentStep: number;
  steps: PipelineStepUI[];
  currentAgent?: string;
  currentTask?: string;
  result?: PipelineResult;
  error?: Error;
}

function findResumeStep(feature: Feature): number | null {
  if (!feature.executionPlan?.steps) return null;
  for (const step of feature.executionPlan.steps) {
    const result = feature.stepResults.get(step.index);
    if (!result || result.status === StepStatus.FAILED) {
      return step.index;
    }
  }
  return null;
}

export default function ResumeCommand({ args, options }: Props): React.ReactElement {
  const [featureId] = args;
  const [state, setState] = useState<ResumeState>({
    phase: 'loading',
    currentStep: 0,
    steps: [],
  });

  useEffect(() => {
    async function runResume(): Promise<void> {
      try {
        const projectPath = options.project;
        const config = loadConfig(projectPath);

        if (options.verbose) {
          process.env.CDM_LOG_LEVEL = 'debug';
        }
        addFileTransport(projectPath);

        const context = new ProjectContext(projectPath);
        const artifactStore = new ArtifactStore(projectPath);

        let feature: Feature | undefined;
        if (featureId) {
          feature = context.getFeature(featureId);
        } else {
          const allFeatures = context.getAllFeatures();
          feature = allFeatures.find((f) =>
            f.status === FeatureStatus.ON_HOLD || f.status === FeatureStatus.IN_PROGRESS,
          ) ?? allFeatures[allFeatures.length - 1];
        }

        if (!feature) {
          throw new Error('No feature found to resume. Run `cdm start` first.');
        }

        const nextStep = findResumeStep(feature);
        if (nextStep === null) {
          setState({
            phase: 'done',
            feature,
            currentStep: 0,
            steps: [],
          });
          return;
        }

        const initialSteps: PipelineStepUI[] = feature.executionPlan?.steps.map((s) => {
          const result = feature!.stepResults.get(s.index);
          return {
            index: s.index,
            description: s.description,
            status: result?.status ?? StepStatus.NOT_STARTED,
            agent: s.agent,
            skills: s.skills,
          };
        }) ?? [];

        setState({
          phase: 'running',
          feature,
          currentStep: nextStep,
          steps: initialSteps,
        });

        const skipSteps = options.skipSteps
          ? options.skipSteps.split(',').map((s) => s.trim())
          : [];

        const pipelineOptions: PipelineOptions = {
          skipSteps,
          maxRetries: parseInt(options.maxRetries, 10),
          dryRun: false,
          interactive: true,
          startFromStep: nextStep,
          onStepStart: (step) => {
            setState((s) => ({
              ...s,
              currentStep: step.index,
              steps: s.steps.map((st) =>
                st.index === step.index ? { ...st, status: StepStatus.IN_PROGRESS } : st
              ),
            }));
          },
          onStepComplete: (step) => {
            setState((s) => ({
              ...s,
              steps: s.steps.map((st) =>
                st.index === step.index ? { ...st, status: StepStatus.COMPLETED } : st
              ),
            }));
          },
          onAgentWork: (role, task) => {
            setState((s) => ({
              ...s,
              currentAgent: formatAgentName(role),
              currentTask: (task as { title?: string }).title ?? 'Processing...',
            }));
          },
          onError: (stepIndex, error) => {
            setState((s) => ({
              ...s,
              steps: s.steps.map((st) =>
                st.index === stepIndex ? { ...st, status: StepStatus.FAILED } : st
              ),
            }));
          },
        };

        const bridgeOptions = {
          executionMode: options.mode as 'claude-cli' | 'simulation',
          model: options.model,
        };
        const orchestrator = new PipelineOrchestrator(context, artifactStore, config, bridgeOptions);

        const result = await orchestrator.runFeaturePipeline(feature, pipelineOptions);

        setState((s) => ({
          ...s,
          phase: 'done',
          result,
        }));
      } catch (error) {
        setState((s) => ({
          ...s,
          phase: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        }));
      }
    }

    runResume();
  }, [featureId, options]);

  if (state.phase === 'error' && state.error) {
    process.exitCode = EXIT_CODES.PIPELINE_FAILURE;
    return <EnhancedErrorDisplay error={state.error} showDetails={options.verbose} />;
  }

  if (state.phase === 'loading') {
    return (
      <Box padding={1}>
        <Spinner label="Loading feature state..." />
      </Box>
    );
  }

  if (state.phase === 'done' && !state.result && state.feature) {
    return (
      <Box padding={1}>
        <Text color={colors.warning}>This feature has already completed all steps.</Text>
      </Box>
    );
  }

  if (options.json && state.result) {
    console.log(JSON.stringify(state.result, null, 2));
    return <></>;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={colors.info}>🔄 Resuming Pipeline</Text>
      {state.feature && (
        <Box marginLeft={2} flexDirection="column" marginBottom={1}>
          <Text>Feature: <Text bold>{state.feature.name}</Text></Text>
          <Text>Status:  {state.feature.status}</Text>
          <Text>Resuming from: <Text bold>Step {state.currentStep}</Text></Text>
        </Box>
      )}

      {!isRtkInstalled() && (
        <Text color={colors.muted}>Tip: Install rtk to reduce agent token usage by 60-90%: brew install rtk</Text>
      )}

      <Text> </Text>
      <Text color={colors.muted}>{'─'.repeat(60)}</Text>
      <Text> </Text>

      {state.steps.length > 0 && (
        <PipelineProgress steps={state.steps} currentStep={state.currentStep} />
      )}

      {state.phase === 'running' && state.currentAgent && (
        <Box marginTop={1} marginLeft={2}>
          <Spinner label={`${getAgentIcon(state.currentAgent)} ${state.currentAgent}: ${state.currentTask}`} />
        </Box>
      )}

      {state.phase === 'done' && state.result && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={colors.muted}>{'─'.repeat(60)}</Text>
          <Text> </Text>
          {state.result.success ? (
            <Text bold color={colors.success}>✅ Pipeline Completed Successfully!</Text>
          ) : (
            <>
              <Text bold color={colors.error}>❌ Pipeline Failed</Text>
              <Text color={colors.muted}>  Tip: Run `cdm resume` to retry from the failed step.</Text>
            </>
          )}
          <Text> </Text>
          <Text bold>Summary:</Text>
          <Box marginLeft={2} flexDirection="column">
            <Text>Execution mode:   <Text color={colors.info}>{state.result.executionMode}</Text></Text>
            <Text>Template used:    <Text color={colors.info}>{state.result.templateUsed || 'auto-selected'}</Text></Text>
            <Text>Steps completed:  <Text color={colors.success}>{state.result.stepsCompleted?.length ?? 0}</Text></Text>
            <Text>Steps failed:     <Text color={colors.error}>{state.result.stepsFailed?.length ?? 0}</Text></Text>
            <Text>Steps skipped:    <Text color={colors.warning}>{state.result.stepsSkipped?.length ?? 0}</Text></Text>
            <Text>Artifacts:        <Text color={colors.info}>{state.result.artifacts.length}</Text></Text>
            <Text>Issues:           <Text color={colors.warning}>{state.result.issues.length}</Text></Text>
            <Text>Tokens used:      {formatTokens(state.result.totalTokensUsed)}</Text>
            <Text>Duration:         {formatDuration(state.result.totalDurationMs)}</Text>
            {(() => {
              const rtkStats = getRtkGain();
              if (rtkStats && rtkStats.totalCommands > 0) {
                return (
                  <Text>RTK savings:      {formatTokens(rtkStats.tokensSaved)} tokens ({rtkStats.savingsPercent}%) across {rtkStats.totalCommands} commands</Text>
                );
              }
              return null;
            })()}
          </Box>

          {state.result.artifacts.length > 0 && (
            <>
              <Text> </Text>
              <Text bold>Artifacts Produced:</Text>
              {state.result.artifacts.slice(0, 10).map((artifact) => (
                <Text key={artifact.id}>  <Text color={colors.info}>•</Text> {artifact.name} <Text color={colors.muted}>({artifact.type})</Text></Text>
              ))}
              {state.result.artifacts.length > 10 && (
                <Text color={colors.muted}>  ... and {state.result.artifacts.length - 10} more</Text>
              )}
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

export const description = 'Resume a failed or paused feature pipeline from its last incomplete step';
