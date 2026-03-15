/**
 * DynamicExecutor - Executes tasks using resolved personas.
 * Handles single and dual-pass (review) execution flows.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type Feature,
  type DynamicResult,
  type Artifact,
  type Issue,
  FeatureStatus,
} from '../types';
import {
  type ResolvedPersonas,
  type ExecutionConfig,
  DEFAULT_EXECUTION_CONFIG,
} from '../personas/types';
import { PromptComposer, type ComposerContext } from '../personas/composer';
import { type ClaudeCodeBridge } from '../orchestrator/claude-code-bridge';
import { type ArtifactStore } from '../workspace/artifact-store';
import logger from '../utils/logger';

export interface ExecutorOptions {
  config: Partial<ExecutionConfig>;
  forceReview?: boolean;
  verbose?: boolean;
}

export interface ExecutionContext {
  projectPath: string;
  feature: Feature;
  resolved: ResolvedPersonas;
  analysisContent?: string;
  codeStyleContent?: string;
}

export class DynamicExecutor {
  private bridge: ClaudeCodeBridge;
  private artifactStore: ArtifactStore;
  private composer: PromptComposer;
  private config: ExecutionConfig;

  constructor(
    bridge: ClaudeCodeBridge,
    artifactStore: ArtifactStore,
    config: Partial<ExecutionConfig> = {},
  ) {
    this.bridge = bridge;
    this.artifactStore = artifactStore;
    this.composer = new PromptComposer();
    this.config = { ...DEFAULT_EXECUTION_CONFIG, ...config };
  }

  async execute(
    context: ExecutionContext,
    options: ExecutorOptions = { config: {} },
  ): Promise<DynamicResult> {
    const { feature, resolved, projectPath } = context;
    const startTime = Date.now();

    logger.info(`Starting execution for feature: ${feature.name}`);
    logger.info(`Primary persona: ${resolved.primary.frontmatter.name}`);

    if (resolved.supporting.length > 0) {
      const supportingNames = resolved.supporting.map((p) => p.frontmatter.name).join(', ');
      logger.info(`Supporting personas: ${supportingNames}`);
    }

    const composerContext: ComposerContext = {
      projectConfig: this.loadProjectConfig(projectPath),
      analysisContent: context.analysisContent,
      codeStyleContent: context.codeStyleContent,
      featureId: feature.id,
      featureName: feature.name,
    };

    const prompt = this.composer.compose(resolved, composerContext, feature.description);

    let output: string;
    let tokensUsed = 0;
    let reviewOutput: string | undefined;
    let hadReviewPass = false;

    try {
      const primaryResult = await this.bridge.executePrompt(prompt, {
        featureId: feature.id,
        personaId: resolved.primary.id,
        step: 'implementation',
      });

      output = primaryResult.output;
      tokensUsed += primaryResult.tokensUsed;

      const shouldReview = this.shouldRunReviewPass(resolved, options);

      if (shouldReview && resolved.reviewLens.length > 0) {
        hadReviewPass = true;
        logger.info(`Running review pass with ${resolved.reviewLens[0].frontmatter.name}`);

        const reviewPrompt = this.composer.composeReviewPrompt(
          resolved,
          output,
          composerContext,
          feature.description,
        );

        const reviewResult = await this.bridge.executePrompt(reviewPrompt, {
          featureId: feature.id,
          personaId: resolved.reviewLens[0].id,
          step: 'review',
        });

        reviewOutput = reviewResult.output;
        tokensUsed += reviewResult.tokensUsed;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Execution failed: ${errorMsg}`);

      return this.buildFailureResult(feature, resolved, errorMsg, startTime);
    }

    const artifacts = this.parseAndStoreArtifacts(
      output,
      reviewOutput,
      feature.id,
      resolved.primary.id,
    );

    const issues = this.parseAllIssues(
      output,
      reviewOutput,
      feature.id,
      resolved.primary.id,
      resolved.reviewLens[0]?.id,
    );

    this.persistFeatureState(projectPath, feature, resolved, artifacts, issues);

    const result: DynamicResult = {
      featureId: feature.id,
      success: true,
      personas: {
        primary: resolved.primary.id,
        supporting: resolved.supporting.map((p) => p.id),
        reviewLens: resolved.reviewLens.map((p) => p.id),
      },
      output,
      reviewOutput,
      artifacts,
      issues,
      totalTokensUsed: tokensUsed,
      totalDurationMs: Date.now() - startTime,
      hadReviewPass,
      executionMode: this.bridge.getExecutionMode(),
    };

    logger.info(`Execution completed: ${artifacts.length} artifacts, ${issues.length} issues`);

    return result;
  }

  private shouldRunReviewPass(
    resolved: ResolvedPersonas,
    options: ExecutorOptions,
  ): boolean {
    if (options.forceReview) return true;
    if (this.config.reviewPass === 'always') return true;
    if (this.config.reviewPass === 'never') return false;
    return resolved.needsReviewPass;
  }

  private parseAndStoreArtifacts(
    primaryOutput: string,
    reviewOutput: string | undefined,
    featureId: string,
    primaryPersonaId: string,
  ): Artifact[] {
    const artifacts: Artifact[] = [];

    const primaryArtifacts = this.bridge.parseArtifacts(
      primaryOutput,
      featureId,
      primaryPersonaId,
    );

    for (const artifact of primaryArtifacts) {
      this.artifactStore.store(artifact);
      artifacts.push(artifact);
    }

    if (reviewOutput) {
      const reviewArtifacts = this.bridge.parseArtifacts(
        reviewOutput,
        featureId,
        primaryPersonaId,
      );

      for (const artifact of reviewArtifacts) {
        const existing = artifacts.find(
          (a) => a.filePath === artifact.filePath || a.name === artifact.name,
        );

        if (existing) {
          existing.content = artifact.content;
          existing.version += 1;
          existing.updatedAt = new Date();
          this.artifactStore.store(existing);
        } else {
          this.artifactStore.store(artifact);
          artifacts.push(artifact);
        }
      }
    }

    return artifacts;
  }

  private parseAllIssues(
    primaryOutput: string,
    reviewOutput: string | undefined,
    featureId: string,
    primaryPersonaId: string,
    reviewPersonaId?: string,
  ): Issue[] {
    const issues: Issue[] = [];

    const primaryIssues = this.bridge.parseIssues(
      primaryOutput,
      featureId,
      primaryPersonaId,
    );
    issues.push(...primaryIssues);

    if (reviewOutput && reviewPersonaId) {
      const reviewIssues = this.bridge.parseIssues(
        reviewOutput,
        featureId,
        reviewPersonaId,
      );
      issues.push(...reviewIssues);
    }

    return issues;
  }

  private loadProjectConfig(projectPath: string): ComposerContext['projectConfig'] {
    const projectJsonPath = path.join(projectPath, '.cdm', 'project.json');

    try {
      if (fs.existsSync(projectJsonPath)) {
        const data = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
        return data.config || this.defaultProjectConfig();
      }
    } catch {
      logger.warn('Could not load project.json, using defaults');
    }

    return this.defaultProjectConfig();
  }

  private defaultProjectConfig(): ComposerContext['projectConfig'] {
    return {
      language: 'unknown',
      framework: 'none',
      testFramework: 'none',
      buildTool: 'none',
      ciProvider: 'none',
      deployTarget: 'none',
      cloudProvider: 'none' as any,
      codeStyle: 'standard',
      branchStrategy: 'main',
      customInstructions: '',
    };
  }

  private persistFeatureState(
    projectPath: string,
    feature: Feature,
    resolved: ResolvedPersonas,
    artifacts: Artifact[],
    issues: Issue[],
  ): void {
    const featuresDir = path.join(projectPath, '.cdm', 'features');

    if (!fs.existsSync(featuresDir)) {
      fs.mkdirSync(featuresDir, { recursive: true });
    }

    const state = {
      ...feature,
      status: FeatureStatus.COMPLETED,
      updatedAt: new Date().toISOString(),
      personas: {
        primary: resolved.primary.id,
        supporting: resolved.supporting.map((p) => p.id),
        reviewLens: resolved.reviewLens.map((p) => p.id),
      },
      artifacts: artifacts.map((a) => ({
        id: a.id,
        type: a.type,
        name: a.name,
        filePath: a.filePath,
      })),
      issues: issues.map((i) => ({
        id: i.id,
        type: i.type,
        severity: i.severity,
        title: i.title,
      })),
    };

    fs.writeFileSync(
      path.join(featuresDir, `${feature.id}.json`),
      JSON.stringify(state, null, 2),
    );
  }

  private buildFailureResult(
    feature: Feature,
    resolved: ResolvedPersonas,
    error: string,
    startTime: number,
  ): DynamicResult {
    return {
      featureId: feature.id,
      success: false,
      personas: {
        primary: resolved.primary.id,
        supporting: resolved.supporting.map((p) => p.id),
        reviewLens: resolved.reviewLens.map((p) => p.id),
      },
      output: `Execution failed: ${error}`,
      artifacts: [],
      issues: [],
      totalTokensUsed: 0,
      totalDurationMs: Date.now() - startTime,
      hadReviewPass: false,
      executionMode: this.bridge.getExecutionMode(),
    };
  }
}

export function createDynamicExecutor(
  bridge: ClaudeCodeBridge,
  artifactStore: ArtifactStore,
  config?: Partial<ExecutionConfig>,
): DynamicExecutor {
  return new DynamicExecutor(bridge, artifactStore, config);
}
