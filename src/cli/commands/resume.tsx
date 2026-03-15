import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { colors } from '../utils/colors.js';
import { Spinner } from '../components/Spinner.js';
import { EnhancedErrorDisplay } from '../components/EnhancedErrorDisplay.js';
import { ProjectContext } from '../../orchestrator/context.js';
import { ArtifactStore } from '../../workspace/artifact-store.js';
import { ClaudeCodeBridge } from '../../orchestrator/claude-code-bridge.js';
import { DynamicExecutor } from '../../executor/dynamic-executor.js';
import { PersonaCatalog, PersonaResolver, getCatalogIndexPath } from '../../personas/index.js';
import { loadConfig } from '../../utils/config.js';
import { addFileTransport } from '../../utils/logger.js';
import { isRtkInstalled, getRtkGain } from '../../utils/rtk.js';
import { formatDuration, formatTokens } from '../utils/format.js';
import { FeatureStatus, type Feature, type DynamicResult } from '../../types.js';
import { EXIT_CODES } from '../types.js';

export const args = z.tuple([
  z.string().optional().describe('Feature ID to resume (uses most recent if omitted)'),
]);

export const options = z.object({
  review: z.boolean().default(false).describe('Force a review pass'),
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

type ResumePhase = 'loading' | 'resolving' | 'executing' | 'done' | 'error';

interface ResumeState {
  phase: ResumePhase;
  feature?: Feature;
  personaName?: string;
  personaEmoji?: string;
  result?: DynamicResult;
  error?: Error;
}

export default function ResumeCommand({ args, options }: Props): React.ReactElement {
  const [featureId] = args;
  const [state, setState] = useState<ResumeState>({ phase: 'loading' });

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
            f.status === FeatureStatus.ON_HOLD ||
            f.status === FeatureStatus.IN_PROGRESS ||
            f.status === FeatureStatus.CANCELLED,
          ) ?? allFeatures[allFeatures.length - 1];
        }

        if (!feature) {
          throw new Error('No feature found to resume. Run `cdm start` first.');
        }

        if (feature.status === FeatureStatus.COMPLETED) {
          setState({ phase: 'done', feature });
          return;
        }

        setState({ phase: 'resolving', feature });

        const catalogPath = getCatalogIndexPath(projectPath);
        const catalog = PersonaCatalog.loadFromIndex(catalogPath);

        if (!catalog || catalog.getCount() === 0) {
          throw new Error('Persona catalog is empty. Run `cdm init` or `cdm personas update` first.');
        }

        const project = context.getProject();
        const resolver = new PersonaResolver(config.personas);
        const resolved = resolver.resolve(
          feature.description,
          project.config,
          catalog,
          {
            config: config.personas,
            forceReview: options.review,
          },
        );

        setState((s) => ({
          ...s,
          phase: 'executing',
          personaName: resolved.primary.frontmatter.name,
          personaEmoji: resolved.primary.frontmatter.emoji || '🤖',
        }));

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

    runResume();
  }, [featureId, options]);

  if (state.phase === 'error' && state.error) {
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
        <Text color={colors.warning}>This feature has already completed successfully.</Text>
      </Box>
    );
  }

  if (options.json && state.result) {
    console.log(JSON.stringify(state.result, null, 2));
    return <></>;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={colors.info}>🔄 Resuming Feature</Text>
      {state.feature && (
        <Box marginLeft={2} flexDirection="column" marginBottom={1}>
          <Text>Feature: <Text bold>{state.feature.name}</Text></Text>
          <Text>Status:  {state.feature.status}</Text>
          <Text>Description: <Text color={colors.muted}>{state.feature.description.slice(0, 80)}</Text></Text>
        </Box>
      )}

      {!isRtkInstalled() && (
        <Text color={colors.muted}>Tip: Install rtk to reduce token usage by 60-90%: brew install rtk</Text>
      )}

      {state.phase === 'resolving' && <Spinner label="Resolving personas..." />}

      {state.phase === 'executing' && (
        <Box marginTop={1}>
          <Spinner label={`${state.personaEmoji || '🤖'} ${state.personaName || 'Persona'} working...`} />
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
              <Text color={colors.muted}>  Run `cdm resume` to retry again.</Text>
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

export const description = 'Resume a failed or incomplete feature by re-running it';
