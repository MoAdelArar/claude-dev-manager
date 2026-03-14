import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { z } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { colors } from '../utils/colors.js';
import { Spinner } from '../components/Spinner.js';
import { Header } from '../components/Header.js';
import { PipelineProgress } from '../components/PipelineProgress.js';
import { EnhancedErrorDisplay } from '../components/EnhancedErrorDisplay.js';
import { InteractiveWizard } from '../components/InteractiveWizard.js';
import { ProjectContext } from '../../orchestrator/context.js';
import { ArtifactStore } from '../../workspace/artifact-store.js';
import { PipelineOrchestrator, type PipelineOptions } from '../../orchestrator/pipeline.js';
import { loadConfig } from '../../utils/config.js';
import { addFileTransport } from '../../utils/logger.js';
import { isRtkInstalled, getRtkGain } from '../../utils/rtk.js';
import { getTemplateEstimate, estimateFromDescription } from '../../utils/cost-estimator.js';
import { CostEstimate } from '../components/CostEstimate.js';
import { formatAgentName, getAgentIcon, formatDuration, formatTokens } from '../utils/format.js';
import { FeaturePriority, StepStatus, type PipelineResult } from '../../types.js';
import { EXIT_CODES, type PipelineStepUI } from '../types.js';

const packageJsonPath = path.join(import.meta.dirname, '..', '..', '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const VERSION = packageJson.version;

export const args = z.tuple([
  z.string().optional().describe('Feature description (launches wizard if omitted)'),
]);

export const options = z.object({
  priority: z.string().default('medium').describe('Feature priority (low|medium|high|critical)'),
  template: z.string().optional().describe('Pipeline template (quick-fix|feature|full-feature|review-only|design-only|deploy)'),
  skipSteps: z.string().default('').describe('Comma-separated step indices to skip'),
  maxRetries: z.string().default('2').describe('Maximum retries per step'),
  dryRun: z.boolean().default(false).describe('Show what would happen without executing'),
  interactive: z.boolean().default(true).describe('Run with interactive prompts'),
  project: z.string().default(process.cwd()).describe('Project path'),
  mode: z.string().default('claude-cli').describe('Execution mode: claude-cli or simulation'),
  model: z.string().optional().describe('Claude model to use (e.g. claude-sonnet-4-20250514)'),
  verbose: z.boolean().default(false).describe('Verbose output'),
  json: z.boolean().default(false).describe('Output result as JSON'),
  estimate: z.boolean().default(false).describe('Show cost/time estimate without running'),
});

type Props = {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
};

interface WizardResult {
  description: string;
  template: string;
  priority: string;
}

type StartPhase = 'init' | 'planning' | 'running' | 'done' | 'error';

interface StartState {
  phase: StartPhase;
  projectName?: string;
  language?: string;
  framework?: string;
  currentStep: number;
  steps: PipelineStepUI[];
  currentAgent?: string;
  currentTask?: string;
  result?: PipelineResult;
  error?: Error;
}

function mapPriority(p: string): FeaturePriority {
  const map: Record<string, FeaturePriority> = {
    low: FeaturePriority.LOW,
    medium: FeaturePriority.MEDIUM,
    high: FeaturePriority.HIGH,
    critical: FeaturePriority.CRITICAL,
  };
  return map[p.toLowerCase()] ?? FeaturePriority.MEDIUM;
}

function guardSelfInit(projectPath: string): void {
  const selfPkg = path.join(path.resolve(projectPath), 'package.json');
  if (fs.existsSync(selfPkg)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(selfPkg, 'utf-8'));
      if (pkg.name === 'claude-dev-manager') {
        console.error('Error: Cannot run CDM on its own source/install directory.');
        console.error('Use --project <path> to point to your target project.');
        process.exit(EXIT_CODES.GENERAL_ERROR);
      }
    } catch { /* not parseable, fine to proceed */ }
  }
}

export default function StartCommand({ args, options }: Props): React.ReactElement {
  const { exit } = useApp();
  const [argDescription] = args;
  const [wizardResult, setWizardResult] = useState<WizardResult | null>(null);
  const [showWizard, setShowWizard] = useState(!argDescription && options.interactive);
  
  const description = wizardResult?.description ?? argDescription ?? '';
  const effectiveTemplate = wizardResult?.template ?? options.template;
  const effectivePriority = wizardResult?.priority ?? options.priority;

  const [state, setState] = useState<StartState>({
    phase: 'init',
    currentStep: 0,
    steps: [],
  });

  const handleWizardComplete = (result: WizardResult): void => {
    setWizardResult(result);
    setShowWizard(false);
  };

  const handleWizardCancel = (): void => {
    process.exitCode = EXIT_CODES.USER_INTERRUPT;
    exit();
  };

  useEffect(() => {
    if (showWizard || !description) {
      return;
    }

    async function runPipeline(): Promise<void> {
      try {
        const projectPath = options.project;
        guardSelfInit(projectPath);
        const config = loadConfig(projectPath);

        if (options.verbose) {
          process.env.CDM_LOG_LEVEL = 'debug';
        }
        addFileTransport(projectPath);

        const artifactStore = new ArtifactStore(projectPath);
        const context = new ProjectContext(projectPath);
        const project = context.getProject();

        setState((s) => ({
          ...s,
          projectName: project.name,
          language: project.config.language,
          framework: project.config.framework,
        }));

        const priority = mapPriority(effectivePriority);
        const feature = context.createFeature(description, description, priority);

        const skipSteps = options.skipSteps
          ? options.skipSteps.split(',').map((s) => s.trim())
          : [];

        setState((s) => ({ ...s, phase: 'planning' }));

        const pipelineOptions: PipelineOptions = {
          skipSteps,
          template: effectiveTemplate,
          maxRetries: parseInt(options.maxRetries, 10),
          dryRun: options.dryRun,
          interactive: options.interactive,
          onStepStart: (step) => {
            setState((s) => {
              const existingStep = s.steps.find((st) => st.index === step.index);
              if (existingStep) {
                return {
                  ...s,
                  currentStep: step.index,
                  steps: s.steps.map((st) =>
                    st.index === step.index ? { ...st, status: StepStatus.IN_PROGRESS } : st
                  ),
                };
              }
              const fullStep = step as { index: number; description: string; agent: import('../../types.js').AgentRole; skills: string[] };
              return {
                ...s,
                currentStep: step.index,
                steps: [...s.steps, {
                  index: step.index,
                  description: step.description,
                  status: StepStatus.IN_PROGRESS,
                  agent: fullStep.agent,
                  skills: fullStep.skills,
                }],
              };
            });
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
              phase: 'running',
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

        if (!result.success) {
          process.exitCode = EXIT_CODES.PIPELINE_FAILURE;
        }
      } catch (error) {
        setState((s) => ({
          ...s,
          phase: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        }));
        process.exitCode = EXIT_CODES.GENERAL_ERROR;
      }
    }

    runPipeline();
  }, [description, showWizard, effectiveTemplate, effectivePriority, options]);

  if (showWizard) {
    return (
      <InteractiveWizard
        onComplete={handleWizardComplete}
        onCancel={handleWizardCancel}
      />
    );
  }

  if (options.estimate && description) {
    const estimate = effectiveTemplate
      ? getTemplateEstimate(effectiveTemplate)
      : estimateFromDescription(description);
    return <CostEstimate estimate={estimate} description={description} />;
  }

  if (state.phase === 'error' && state.error) {
    return <EnhancedErrorDisplay error={state.error} showDetails={options.verbose} />;
  }

  if (options.json && state.result) {
    console.log(JSON.stringify(state.result, null, 2));
    return <></>;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header version={VERSION} title="Multi-Agent Development Pipeline powered by Claude Code" />

      {state.projectName && (
        <Box marginLeft={2} flexDirection="column" marginBottom={1}>
          <Text>Project: <Text bold>{state.projectName}</Text></Text>
          <Text>Language: {state.language} | Framework: {state.framework}</Text>
          <Text>Feature: <Text bold>{description}</Text></Text>
          {effectiveTemplate && <Text>Template: <Text bold>{effectiveTemplate}</Text></Text>}
        </Box>
      )}

      {!isRtkInstalled() && (
        <Text color={colors.muted}>Tip: Install rtk to reduce agent token usage by 60-90%: brew install rtk</Text>
      )}

      {options.dryRun && (
        <Box marginY={1}>
          <Text color={colors.warning}>📋 DRY RUN — Pipeline will analyze task and show plan:</Text>
        </Box>
      )}

      {state.phase === 'init' && <Spinner label="Initializing pipeline..." />}
      {state.phase === 'planning' && <Spinner label="Planning execution..." />}

      {(state.phase === 'running' || state.phase === 'done') && state.steps.length > 0 && (
        <>
          <Text> </Text>
          <Text color={colors.muted}>{'─'.repeat(60)}</Text>
          <Text bold> 📋 Pipeline Execution</Text>
          <Text> </Text>
          <PipelineProgress steps={state.steps} currentStep={state.currentStep} />
        </>
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
              {state.result.stepsFailed && state.result.stepsFailed.length > 0 && (
                <Text color={colors.muted}>  Tip: Run `cdm resume` to retry from the failed step.</Text>
              )}
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

          {state.result.issues.length > 0 && (
            <>
              <Text> </Text>
              <Text bold>Issues:</Text>
              <Box marginLeft={2} flexDirection="column">
                {Object.entries(
                  state.result.issues.reduce<Record<string, number>>((acc, issue) => {
                    acc[issue.severity] = (acc[issue.severity] ?? 0) + 1;
                    return acc;
                  }, {})
                ).map(([sev, count]) => {
                  const sevColor = sev === 'critical' ? colors.error : sev === 'high' ? colors.warning : colors.muted;
                  return <Text key={sev} color={sevColor}>{sev}: {count}</Text>;
                })}
              </Box>
            </>
          )}

          {state.result.stepsFailed && state.result.stepsFailed.length > 0 && (
            <>
              <Text> </Text>
              <Text bold color={colors.error}>Failed Steps:</Text>
              {state.result.stepsFailed.map((step) => (
                <Text key={step}>  <Text color={colors.error}>✗</Text> Step {step}</Text>
              ))}
            </>
          )}

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

export const description = 'Start the development pipeline for a new feature';
