import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { colors } from '../utils/colors.js';
import { Spinner } from '../components/Spinner.js';
import { ErrorDisplay } from '../components/ErrorDisplay.js';
import { saveConfig, getDefaultConfig } from '../../utils/config.js';
import { ProjectContext } from '../../orchestrator/context.js';
import { ProjectAnalyzer } from '../../analyzer/project-analyzer.js';
import { CodeStyleProfiler } from '../../analyzer/codestyle-profiler.js';
import { ArtifactStore } from '../../workspace/artifact-store.js';
import { AgentRegistry } from '../../agents/index.js';
import { ClaudeCodeBridge, type ProjectSnapshot } from '../../orchestrator/claude-code-bridge.js';
import { ensureRtkInitialized, isRtkInstalled } from '../../utils/rtk.js';
import { EXIT_CODES } from '../types.js';

export const options = z.object({
  project: z.string().default(process.cwd()).describe('Project path'),
});

type Props = {
  options: z.infer<typeof options>;
};

type InitPhase = 'starting' | 'config' | 'analyzing' | 'profiling' | 'agents' | 'rtk' | 'done' | 'error';

interface InitState {
  phase: InitPhase;
  error?: Error;
  project?: { name: string; language: string; framework: string };
  analysisStats?: { files: number; modules: number; lines: number };
  codeStylePattern?: string;
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

export default function InitCommand({ options }: Props): React.ReactElement {
  const [state, setState] = useState<InitState>({ phase: 'starting' });
  const projectPath = path.resolve(options.project);

  useEffect(() => {
    async function runInit(): Promise<void> {
      try {
        guardSelfInit(projectPath);

        setState({ phase: 'config' });
        const config = getDefaultConfig();
        const context = new ProjectContext(projectPath);
        const project = context.getProject();
        
        setState((s) => ({ 
          ...s, 
          project: { 
            name: project.name, 
            language: project.config.language, 
            framework: project.config.framework 
          } 
        }));
        
        saveConfig(projectPath, config);

        setState((s) => ({ ...s, phase: 'analyzing' }));
        const analyzer = new ProjectAnalyzer(projectPath);
        const analysis = await analyzer.analyze();
        const analysisDir = path.join(projectPath, '.cdm', 'analysis');
        const analysisFiles = analyzer.generateAnalysisFiles(analysis);
        analyzer.saveAnalysisFolder(analysisDir, analysisFiles);

        setState((s) => ({ 
          ...s, 
          analysisStats: { 
            files: analysisFiles.size, 
            modules: analysis.modules.length, 
            lines: analysis.overview.totalLines 
          } 
        }));

        setState((s) => ({ ...s, phase: 'profiling' }));
        const profiler = new CodeStyleProfiler(projectPath);
        const codeStyleProfile = await profiler.profile();
        const profileMd = profiler.generateMarkdown(codeStyleProfile);
        profiler.saveProfile(path.join(analysisDir, 'codestyle.md'), profileMd);

        setState((s) => ({ ...s, codeStylePattern: codeStyleProfile.architecture.pattern }));

        setState((s) => ({ ...s, phase: 'agents' }));
        const topDirs = [...new Set(
          analysis.modules.map((m) => m.filePath.split('/')[0]).filter(Boolean),
        )].filter((d) => d !== '.' && !d.startsWith('.')) as string[];

        const snapshot: ProjectSnapshot = {
          projectName: analysis.projectName,
          language: analysis.overview.language,
          framework: analysis.overview.framework,
          testFramework: analysis.overview.testFramework,
          buildTool: analysis.overview.buildTool,
          ciProvider: project.config.ciProvider,
          deployTarget: project.config.deployTarget,
          cloudProvider: String(project.config.cloudProvider),
          naming: {
            files: codeStyleProfile.naming.files,
            directories: codeStyleProfile.naming.directories,
            variables: codeStyleProfile.naming.variables,
            functions: codeStyleProfile.naming.functions,
            classes: codeStyleProfile.naming.classes,
            testFiles: codeStyleProfile.naming.testFiles,
          },
          formatting: {
            indentation: codeStyleProfile.formatting.indentation,
            quotes: codeStyleProfile.formatting.quotes,
            semicolons: codeStyleProfile.formatting.semicolons,
          },
          imports: {
            moduleSystem: codeStyleProfile.imports.moduleSystem,
            pathStyle: codeStyleProfile.imports.pathStyle,
            nodeProtocol: codeStyleProfile.imports.nodeProtocol,
          },
          architecturePattern: codeStyleProfile.architecture.pattern,
          architectureLayers: codeStyleProfile.architecture.layers,
          entryPoints: analysis.entryPoints.slice(0, 5),
          topDirs,
          keyDeps: analysis.externalDeps.map((d) => `${d.name}${d.purpose ? ` (${d.purpose})` : ''}`),
          patterns: analysis.patterns,
          testDirs: analysis.testStructure.dirs.slice(0, 4),
          apiStyle: codeStyleProfile.api.style,
        };

        const artifactStore = new ArtifactStore(projectPath);
        const agentRegistry = new AgentRegistry(artifactStore);
        const bridge = new ClaudeCodeBridge(agentRegistry, artifactStore, { projectPath });

        bridge.writeAgentInstructionFiles(snapshot);
        const claudeMd = bridge.generateMainClaudeMd();
        fs.writeFileSync(path.join(projectPath, 'CLAUDE.md'), claudeMd, 'utf-8');

        setState((s) => ({ ...s, phase: 'rtk' }));
        ensureRtkInitialized();

        setState((s) => ({ ...s, phase: 'done' }));
      } catch (error) {
        setState({ phase: 'error', error: error instanceof Error ? error : new Error(String(error)) });
      }
    }

    runInit();
  }, [projectPath]);

  if (state.phase === 'error' && state.error) {
    return <ErrorDisplay error={state.error} suggestion="Check that the project path exists and is writable." />;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={colors.info}>🔧 Initializing Claude Dev Manager</Text>
      <Text> </Text>

      {state.project && (
        <Box marginLeft={2} flexDirection="column" marginBottom={1}>
          <Text>Project: <Text bold>{state.project.name}</Text></Text>
          <Text>Detected language: {state.project.language}</Text>
          <Text>Detected framework: {state.project.framework}</Text>
        </Box>
      )}

      <Box marginLeft={2} flexDirection="column">
        {state.phase === 'config' && <Spinner label="Creating cdm.config.yaml..." />}
        {['analyzing', 'profiling', 'agents', 'rtk', 'done'].includes(state.phase) && (
          <Text color={colors.success}>✅ Created cdm.config.yaml</Text>
        )}

        {state.phase === 'analyzing' && <Spinner label="Running project analysis..." />}
        {['profiling', 'agents', 'rtk', 'done'].includes(state.phase) && state.analysisStats && (
          <Text color={colors.success}>
            ✅ Generated .cdm/analysis/ ({state.analysisStats.files} files · {state.analysisStats.modules} modules · {state.analysisStats.lines.toLocaleString()} lines)
          </Text>
        )}

        {state.phase === 'profiling' && <Spinner label="Profiling code style..." />}
        {['agents', 'rtk', 'done'].includes(state.phase) && state.codeStylePattern && (
          <Text color={colors.success}>✅ Generated .cdm/analysis/codestyle.md ({state.codeStylePattern})</Text>
        )}

        {state.phase === 'agents' && <Spinner label="Generating agent instruction files..." />}
        {['rtk', 'done'].includes(state.phase) && (
          <>
            <Text color={colors.success}>✅ Generated agent instruction files in .cdm/agents/</Text>
            <Text color={colors.success}>✅ Generated CLAUDE.md (references .cdm/ structure)</Text>
          </>
        )}

        {state.phase === 'rtk' && <Spinner label="Setting up RTK..." />}
        {state.phase === 'done' && (
          <>
            {isRtkInstalled() ? (
              <Text color={colors.success}>✅ RTK hook active — agent CLI outputs will be compressed</Text>
            ) : (
              <Text color={colors.muted}>   Tip: Install rtk for 60-90% token savings: brew install rtk</Text>
            )}
          </>
        )}
      </Box>

      {state.phase === 'done' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={colors.success}>🎉 CDM initialized! Run `cdm start "your feature"` to begin.</Text>
          <Text color={colors.muted}>   All CDM data is in .cdm/ — CLAUDE.md is the entry point.</Text>
        </Box>
      )}
    </Box>
  );
}

export const description = 'Initialize CDM in the current project';
