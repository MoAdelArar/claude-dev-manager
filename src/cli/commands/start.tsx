import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { z } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { colors } from '../utils/colors.js';
import { Spinner } from '../components/Spinner.js';
import { Header } from '../components/Header.js';
import { EnhancedErrorDisplay } from '../components/EnhancedErrorDisplay.js';
import { InteractiveWizard } from '../components/InteractiveWizard.js';
import { ProjectContext } from '../../orchestrator/context.js';
import { ArtifactStore } from '../../workspace/artifact-store.js';
import { ClaudeCodeBridge } from '../../orchestrator/claude-code-bridge.js';
import { DynamicExecutor } from '../../executor/dynamic-executor.js';
import { PersonaCatalog, PersonaResolver, getCatalogIndexPath } from '../../personas/index.js';
import { loadConfig } from '../../utils/config.js';
import { addFileTransport } from '../../utils/logger.js';
import { isRtkInstalled, getRtkGain } from '../../utils/rtk.js';
import { formatDuration, formatTokens, getPersonaIcon, formatPersonaName } from '../utils/format.js';
import { FeaturePriority, type DynamicResult } from '../../types.js';
import { EXIT_CODES } from '../types.js';

const packageJsonPath = path.join(import.meta.dirname, '..', '..', '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const VERSION = packageJson.version;

export const args = z.tuple([
  z.string().optional().describe('Feature description (launches wizard if omitted)'),
]);

export const options = z.object({
  priority: z.string().default('medium').describe('Feature priority (low|medium|high|critical)'),
  persona: z.string().optional().describe('Force a specific primary persona by ID'),
  review: z.boolean().default(false).describe('Force a review pass'),
  dryRun: z.boolean().default(false).describe('Show persona selection without executing'),
  interactive: z.boolean().default(true).describe('Run with interactive prompts'),
  project: z.string().default(process.cwd()).describe('Project path'),
  mode: z.string().default('claude-cli').describe('Execution mode: claude-cli or simulation'),
  model: z.string().optional().describe('Claude model to use'),
  verbose: z.boolean().default(false).describe('Verbose output'),
  json: z.boolean().default(false).describe('Output result as JSON'),
  estimate: z.boolean().default(false).describe('Show persona selection without running'),
});

type Props = {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
};

interface WizardResult {
  description: string;
  priority: string;
}

type StartPhase = 'init' | 'resolving' | 'executing' | 'reviewing' | 'done' | 'error';

interface PersonaSelection {
  primaryName: string;
  primaryEmoji: string;
  primaryId: string;
  supportingNames: string[];
  reviewNames: string[];
  reason: string;
}

interface StartState {
  phase: StartPhase;
  projectName?: string;
  language?: string;
  framework?: string;
  personaSelection?: PersonaSelection;
  result?: DynamicResult;
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
  const effectivePriority = wizardResult?.priority ?? options.priority;

  const [state, setState] = useState<StartState>({ phase: 'init' });

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

    async function runExecution(): Promise<void> {
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

        const catalogPath = getCatalogIndexPath(projectPath);
        const catalog = PersonaCatalog.loadFromIndex(catalogPath);

        if (!catalog || catalog.getCount() === 0) {
          throw new Error('Persona catalog is empty. Run `cdm init` or `cdm personas update` first.');
        }

        setState((s) => ({ ...s, phase: 'resolving' }));

        const resolver = new PersonaResolver(config.personas);
        const resolved = resolver.resolve(
          description,
          project.config,
          catalog,
          {
            config: config.personas,
            forceReview: options.review,
            forcePrimaryPersona: options.persona,
          },
        );

        const selection: PersonaSelection = {
          primaryName: resolved.primary.frontmatter.name,
          primaryEmoji: resolved.primary.frontmatter.emoji || '🤖',
          primaryId: resolved.primary.id,
          supportingNames: resolved.supporting.map((p) => p.frontmatter.name),
          reviewNames: resolved.reviewLens.map((p) => p.frontmatter.name),
          reason: resolved.reason,
        };

        setState((s) => ({ ...s, personaSelection: selection }));

        if (options.dryRun || options.estimate) {
          setState((s) => ({ ...s, phase: 'done' }));
          return;
        }

        setState((s) => ({ ...s, phase: 'executing' }));

        const priority = mapPriority(effectivePriority);
        const feature = context.createFeature(description, description, priority);

        const analysisPath = path.join(projectPath, '.cdm', 'analysis', 'overview.md');
        const codestylePath = path.join(projectPath, '.cdm', 'analysis', 'codestyle.md');
        const analysisContent = fs.existsSync(analysisPath) ? fs.readFileSync(analysisPath, 'utf-8') : undefined;
        const codeStyleContent = fs.existsSync(codestylePath) ? fs.readFileSync(codestylePath, 'utf-8') : undefined;

        const bridge = new ClaudeCodeBridge({
          projectPath,
          executionMode: options.mode as 'claude-cli' | 'simulation',
          model: options.model,
        });

        const executor = new DynamicExecutor(bridge, artifactStore, config.execution);

        if (resolved.needsReviewPass && resolved.reviewLens.length > 0) {
          setState((s) => ({ ...s, phase: 'reviewing' }));
        }

        const result = await executor.execute(
          {
            projectPath,
            feature,
            resolved,
            analysisContent,
            codeStyleContent,
          },
          {
            config: config.execution,
            forceReview: options.review,
          },
        );

        setState((s) => ({
          ...s,
          phase: 'done',
          result,
        }));

        if (!result.success) {
          process.exitCode = EXIT_CODES.EXECUTION_FAILURE;
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

    runExecution();
  }, [description, showWizard, effectivePriority, options]);

  if (showWizard) {
    return (
      <InteractiveWizard
        onComplete={(result) => handleWizardComplete({ description: result.description, priority: result.priority })}
        onCancel={handleWizardCancel}
      />
    );
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
      <Header version={VERSION} title="Dynamic Persona-Based Development" />

      {state.projectName && (
        <Box marginLeft={2} flexDirection="column" marginBottom={1}>
          <Text>Project: <Text bold>{state.projectName}</Text></Text>
          <Text>Language: {state.language} | Framework: {state.framework}</Text>
          <Text>Feature: <Text bold>{description}</Text></Text>
        </Box>
      )}

      {!isRtkInstalled() && (
        <Text color={colors.muted}>Tip: Install rtk to reduce token usage by 60-90%: brew install rtk</Text>
      )}

      {(options.dryRun || options.estimate) && (
        <Box marginY={1}>
          <Text color={colors.warning}>📋 {options.estimate ? 'ESTIMATE' : 'DRY RUN'} — Showing persona selection:</Text>
        </Box>
      )}

      {state.phase === 'init' && <Spinner label="Initializing..." />}
      {state.phase === 'resolving' && <Spinner label="Resolving personas..." />}

      {state.personaSelection && (
        <Box marginTop={1} flexDirection="column">
          <Text color={colors.muted}>{'─'.repeat(60)}</Text>
          <Text bold> 🎭 Persona Selection</Text>
          <Text> </Text>
          <Box marginLeft={2} flexDirection="column">
            <Text>
              Primary: <Text bold>{state.personaSelection.primaryEmoji} {state.personaSelection.primaryName}</Text>
              <Text color={colors.muted}> ({state.personaSelection.primaryId})</Text>
            </Text>
            {state.personaSelection.supportingNames.length > 0 && (
              <Text>
                Supporting: <Text color={colors.info}>{state.personaSelection.supportingNames.join(', ')}</Text>
              </Text>
            )}
            {state.personaSelection.reviewNames.length > 0 && (
              <Text>
                Review: <Text color={colors.warning}>{state.personaSelection.reviewNames.join(', ')}</Text>
              </Text>
            )}
            <Text color={colors.muted}>Reason: {state.personaSelection.reason}</Text>
          </Box>
        </Box>
      )}

      {state.phase === 'executing' && (
        <Box marginTop={1}>
          <Spinner label={`${state.personaSelection?.primaryEmoji || '🤖'} ${state.personaSelection?.primaryName || 'Persona'} working...`} />
        </Box>
      )}

      {state.phase === 'reviewing' && (
        <Box marginTop={1}>
          <Spinner label={`🔍 Running review pass...`} />
        </Box>
      )}

      {state.phase === 'done' && state.result && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={colors.muted}>{'─'.repeat(60)}</Text>
          <Text> </Text>
          {state.result.success ? (
            <Text bold color={colors.success}>✅ Execution Completed Successfully!</Text>
          ) : (
            <>
              <Text bold color={colors.error}>❌ Execution Failed</Text>
              <Text color={colors.muted}>  Run `cdm resume` to retry.</Text>
            </>
          )}
          <Text> </Text>
          <Text bold>Summary:</Text>
          <Box marginLeft={2} flexDirection="column">
            <Text>Execution mode:   <Text color={colors.info}>{state.result.executionMode}</Text></Text>
            <Text>Primary persona:  <Text color={colors.info}>{state.result.personas.primary}</Text></Text>
            <Text>Review pass:      <Text color={state.result.hadReviewPass ? colors.success : colors.muted}>{state.result.hadReviewPass ? 'Yes' : 'No'}</Text></Text>
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

      {state.phase === 'done' && (options.dryRun || options.estimate) && (
        <Box marginTop={1}>
          <Text color={colors.muted}>Run without --dry-run or --estimate to execute.</Text>
        </Box>
      )}
    </Box>
  );
}

export const description = 'Start development for a new feature with dynamic persona selection';
