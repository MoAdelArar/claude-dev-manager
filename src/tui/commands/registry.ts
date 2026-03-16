import * as path from 'node:path';
import * as fs from 'node:fs';
import { ProjectContext } from '../../orchestrator/context.js';
import { ArtifactStore } from '../../workspace/artifact-store.js';
import {
  PersonaCatalog,
  PersonaFetcher,
  getCatalogIndexPath,
} from '../../personas/index.js';
import { loadConfig, saveConfig, getDefaultConfig } from '../../utils/config.js';
import { ProjectAnalyzer } from '../../analyzer/project-analyzer.js';
import { CodeStyleProfiler } from '../../analyzer/codestyle-profiler.js';
import { ClaudeCodeBridge } from '../../orchestrator/claude-code-bridge.js';
import { ensureRtkInitialized } from '../../utils/rtk.js';

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  handler: (args: string[], projectPath?: string) => Promise<string>;
}

export type CommandCallbacks = {
  onClear: () => void;
  onExit: () => void;
  onShowDialog?: (type: 'help' | 'status' | 'init') => void;
};

export function createCommandRegistry(callbacks: CommandCallbacks): SlashCommand[] {
  return [
    {
      name: 'help',
      description: 'Show available commands',
      usage: '/help',
      handler: async () => {
        return `Available Commands:

  /init              Initialize CDM in current directory
  /analyze           Re-analyze project structure
  /status            Show project and feature status
  /personas [query]  List personas or resolve for query
  /artifacts         List recent artifacts
  /history           Show development history
  /config            Show current configuration
  /clear             Clear chat history
  /exit              Exit CDM

Type a message to start working with Claude.`;
      },
    },
    {
      name: 'init',
      description: 'Initialize CDM in current directory',
      usage: '/init',
      handler: async (_args: string[], projectPath?: string) => {
        if (!projectPath) return 'No project path available';
        try {
          const config = getDefaultConfig();
          const context = new ProjectContext(projectPath);
          const project = context.getProject();

          saveConfig(projectPath, config);

          const analyzer = new ProjectAnalyzer(projectPath);
          const analysis = await analyzer.analyze();
          const analysisDir = path.join(projectPath, '.cdm', 'analysis');
          const analysisFiles = analyzer.generateAnalysisFiles(analysis);
          analyzer.saveAnalysisFolder(analysisDir, analysisFiles);

          const profiler = new CodeStyleProfiler(projectPath);
          const codeStyleProfile = await profiler.profile();
          const profileMd = profiler.generateMarkdown(codeStyleProfile);
          profiler.saveProfile(path.join(analysisDir, 'codestyle.md'), profileMd);

          const fetcher = new PersonaFetcher(config.personas);
          const fetchResult = await fetcher.fetchPersonas(projectPath);

          let personaCount = 0;
          if (fetchResult.success && fetchResult.personaCount > 0) {
            const sourceDir = fetcher.getSourceDir(projectPath);
            const catalog = await PersonaCatalog.buildFromDirectory(
              sourceDir,
              config.personas.repo,
              fetchResult.commit,
            );
            catalog.persist(getCatalogIndexPath(projectPath));
            personaCount = catalog.getCount();
          }

          const bridge = new ClaudeCodeBridge({ projectPath });
          const claudeMd = bridge.generateMainClaudeMd();
          fs.writeFileSync(path.join(projectPath, 'CLAUDE.md'), claudeMd, 'utf-8');

          ensureRtkInitialized();

          return `Project initialized successfully!

  Project: ${project.name}
  Language: ${project.config.language}
  Framework: ${project.config.framework}
  Personas: ${personaCount} indexed

You can now start working. Type a task description to begin.`;
        } catch (error) {
          return `Initialization failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    },
    {
      name: 'analyze',
      description: 'Re-analyze project structure',
      usage: '/analyze',
      handler: async (_args: string[], projectPath?: string) => {
        if (!projectPath) return 'No project path available';
        try {
          const analyzer = new ProjectAnalyzer(projectPath);
          const analysis = await analyzer.analyze();
          const analysisDir = path.join(projectPath, '.cdm', 'analysis');
          const analysisFiles = analyzer.generateAnalysisFiles(analysis);
          analyzer.saveAnalysisFolder(analysisDir, analysisFiles);
          return `Project analysis updated. ${analysisFiles.size} files generated.`;
        } catch (error) {
          return `Analysis failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    },
    {
      name: 'history',
      description: 'Show development history',
      usage: '/history',
      handler: async (_args: string[], projectPath?: string) => {
        if (!projectPath) return 'No project path available';
        try {
          const context = new ProjectContext(projectPath);
          const project = context.getProject();
          const { DevelopmentTracker } = await import(
            '../../tracker/development-tracker.js'
          );
          const tracker = new DevelopmentTracker(projectPath, project.id, project.name);
          const history = tracker.buildHistory();
          const summary = history.summary;
          return `Development History:

  Features: ${summary.totalFeatures} (${summary.completedFeatures} completed)
  Executions: ${summary.totalExecutions}
  Artifacts: ${summary.totalArtifactsProduced}
  Issues: ${summary.totalIssuesFound} found, ${summary.totalIssuesResolved} resolved
  Tokens used: ${summary.totalTokensUsed.toLocaleString()}`;
        } catch {
          return 'No history available yet.';
        }
      },
    },
    {
      name: 'status',
      description: 'Show project status',
      usage: '/status',
      handler: async (_args: string[], projectPath?: string) => {
        if (!projectPath) return 'No project path available';
        try {
          const context = new ProjectContext(projectPath);
          const project = context.getProject();
          const features = context.getAllFeatures();
          const active = features.filter((f) => f.status === 'in_progress');
          const completed = features.filter((f) => f.status === 'completed');

          return `Project Status:

  Name: ${project.name}
  Language: ${project.config.language}
  Framework: ${project.config.framework}
  Features: ${features.length} total
    - Completed: ${completed.length}
    - Active: ${active.length}`;
        } catch {
          return 'Project not initialized. Run /init to set up CDM.';
        }
      },
    },
    {
      name: 'personas',
      description: 'List or resolve personas',
      usage: '/personas [query]',
      handler: async (args: string[], projectPath?: string) => {
        if (!projectPath) return 'No project path available';
        try {
          const catalogPath = getCatalogIndexPath(projectPath);
          const catalog = PersonaCatalog.loadFromIndex(catalogPath);
          if (!catalog) return 'Persona catalog not found. Run /init first.';

          if (args.length === 0) {
            const divisions = catalog.getDivisions();
            const counts = divisions.map(
              (d) => `  ${d}: ${catalog.getByDivision(d).length}`,
            );
            return `Persona Catalog (${catalog.getCount()} personas)\n\n${counts.join('\n')}`;
          }

          const query = args.join(' ');
          const results = catalog.search(query.split(' '));
          if (results.length === 0) return 'No matching personas found.';

          const list = results
            .slice(0, 5)
            .map((p) => `  ${p.frontmatter.emoji} ${p.frontmatter.name} (${p.id})`)
            .join('\n');
          return `Matching Personas:\n\n${list}`;
        } catch {
          return 'Failed to load personas.';
        }
      },
    },
    {
      name: 'artifacts',
      description: 'List recent artifacts',
      usage: '/artifacts',
      handler: async (_args: string[], projectPath?: string) => {
        if (!projectPath) return 'No project path available';
        try {
          const store = new ArtifactStore(projectPath);
          const artifacts = store.getAll();
          if (artifacts.length === 0) return 'No artifacts found.';

          const list = artifacts
            .slice(0, 10)
            .map((a) => `  - ${a.name} (${a.type})`)
            .join('\n');
          return `Recent Artifacts:\n\n${list}`;
        } catch {
          return 'Failed to load artifacts.';
        }
      },
    },
    {
      name: 'config',
      description: 'Show configuration',
      usage: '/config',
      handler: async (_args: string[], projectPath?: string) => {
        if (!projectPath) return 'No project path available';
        try {
          const config = loadConfig(projectPath);
          return `Configuration:

  Execution Mode: ${config.execution.defaultMode}
  Review Pass: ${config.execution.reviewPass}
  Max Retries: ${config.execution.maxRetries}
  Timeout: ${config.execution.timeoutMinutes} min`;
        } catch {
          return 'No configuration found.';
        }
      },
    },
    {
      name: 'clear',
      description: 'Clear chat history',
      usage: '/clear',
      handler: async () => {
        callbacks.onClear();
        return 'Chat cleared.';
      },
    },
    {
      name: 'exit',
      description: 'Exit CDM',
      usage: '/exit',
      handler: async () => {
        callbacks.onExit();
        return 'Goodbye!';
      },
    },
  ];
}
