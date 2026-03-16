import * as path from 'node:path';
import * as fs from 'node:fs';
import type { DynamicResult, FeaturePriority } from '../../types.js';
import type { ResolvedPersonas } from '../../personas/types.js';
import { ProjectContext } from '../../orchestrator/context.js';
import { ArtifactStore } from '../../workspace/artifact-store.js';
import { ClaudeCodeBridge } from '../../orchestrator/claude-code-bridge.js';
import {
  PersonaCatalog,
  PersonaResolver,
  getCatalogIndexPath,
} from '../../personas/index.js';
import { PromptComposer } from '../../personas/composer.js';
import { loadConfig } from '../../utils/config.js';
import { FeaturePriority as FP } from '../../types.js';
import type { StateStore } from './store.js';

export class ExecutionEngine {
  private store: StateStore;
  private projectPath: string;
  private aborted = false;

  constructor(store: StateStore, projectPath: string) {
    this.store = store;
    this.projectPath = projectPath;
  }

  abort(): void {
    this.aborted = true;
    this.store.abortExecution();
  }

  resolvePersonas(description: string): ResolvedPersonas | null {
    try {
      const config = loadConfig(this.projectPath);
      const catalogPath = getCatalogIndexPath(this.projectPath);
      const catalog = PersonaCatalog.loadFromIndex(catalogPath);

      if (!catalog || catalog.getCount() === 0) {
        return null;
      }

      const context = new ProjectContext(this.projectPath);
      const project = context.getProject();

      const resolver = new PersonaResolver(config.personas);
      return resolver.resolve(description, project.config, catalog);
    } catch {
      return null;
    }
  }

  async execute(
    description: string,
    onChunk: (chunk: string) => void,
    priority: FeaturePriority = FP.MEDIUM,
  ): Promise<DynamicResult> {
    this.aborted = false;

    this.store.setStatus({ mode: 'executing' });
    this.store.setExecutionProgress('resolving-personas');

    try {
      const config = loadConfig(this.projectPath);
      const catalogPath = getCatalogIndexPath(this.projectPath);
      const catalog = PersonaCatalog.loadFromIndex(catalogPath);

      if (!catalog || catalog.getCount() === 0) {
        throw new Error('Persona catalog is empty. Run /init first.');
      }

      const context = new ProjectContext(this.projectPath);
      const project = context.getProject();
      const resolver = new PersonaResolver(config.personas);
      const resolved = resolver.resolve(description, project.config, catalog);

      this.store.setHeader({ persona: resolved.primary.frontmatter.name });

      if (this.aborted) {
        throw new Error('Execution cancelled');
      }

      this.store.setExecutionProgress('executing-main');

      const feature = context.createFeature(description, description, priority);
      this.store.startExecution(feature.id, resolved.primary.frontmatter.name);

      const analysisPath = path.join(
        this.projectPath,
        '.cdm',
        'analysis',
        'overview.md',
      );
      const codestylePath = path.join(
        this.projectPath,
        '.cdm',
        'analysis',
        'codestyle.md',
      );
      const analysisContent = fs.existsSync(analysisPath)
        ? fs.readFileSync(analysisPath, 'utf-8')
        : undefined;
      const codeStyleContent = fs.existsSync(codestylePath)
        ? fs.readFileSync(codestylePath, 'utf-8')
        : undefined;

      const bridge = new ClaudeCodeBridge({
        projectPath: this.projectPath,
        executionMode: config.execution.defaultMode,
        model: config.execution.model,
      });

      const artifactStore = new ArtifactStore(this.projectPath);
      const composer = new PromptComposer();

      const composerContext = {
        projectConfig: project.config,
        analysisContent,
        codeStyleContent,
        featureId: feature.id,
        featureName: feature.name,
      };

      const prompt = composer.compose(resolved, composerContext, description);

      this.store.setStatus({ mode: 'streaming' });

      const primaryResult = await bridge.executePromptStreaming(
        prompt,
        {
          featureId: feature.id,
          personaId: resolved.primary.id,
          step: 'implementation',
        },
        onChunk,
      );

      let reviewOutput: string | undefined;
      if (resolved.needsReviewPass && resolved.reviewLens.length > 0) {
        if (this.aborted) throw new Error('Execution cancelled');

        this.store.setExecutionProgress('executing-review');
        const reviewPrompt = composer.composeReviewPrompt(
          resolved,
          primaryResult.output,
          composerContext,
          description,
        );

        const reviewResult = await bridge.executePromptStreaming(
          reviewPrompt,
          {
            featureId: feature.id,
            personaId: resolved.reviewLens[0].id,
            step: 'review',
          },
          onChunk,
        );
        reviewOutput = reviewResult.output;
      }

      this.store.setExecutionProgress('parsing-artifacts');

      const artifacts = bridge.parseArtifacts(
        primaryResult.output + (reviewOutput ?? ''),
        feature.id,
        resolved.primary.id,
      );

      for (const artifact of artifacts) {
        artifactStore.store(artifact);
      }

      const issues = bridge.parseIssues(
        primaryResult.output + (reviewOutput ?? ''),
        feature.id,
        resolved.primary.id,
      );

      this.store.finishExecution(true, primaryResult.tokensUsed, primaryResult.durationMs);

      const result: DynamicResult = {
        featureId: feature.id,
        success: true,
        personas: {
          primary: resolved.primary.id,
          supporting: resolved.supporting.map((p) => p.id),
          reviewLens: resolved.reviewLens.map((p) => p.id),
        },
        output: primaryResult.output,
        reviewOutput,
        artifacts,
        issues,
        totalTokensUsed: primaryResult.tokensUsed,
        totalDurationMs: primaryResult.durationMs,
        hadReviewPass: !!reviewOutput,
        executionMode: bridge.getExecutionMode(),
      };

      return result;
    } catch (error) {
      this.store.finishExecution(false);
      throw error;
    }
  }
}

export function createExecutionEngine(
  store: StateStore,
  projectPath: string,
): ExecutionEngine {
  return new ExecutionEngine(store, projectPath);
}
