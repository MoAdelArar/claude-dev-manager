import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { colors } from '../utils/colors.js';
import { Spinner } from '../components/Spinner.js';
import { ErrorDisplay } from '../components/ErrorDisplay.js';
import { ProjectAnalyzer } from '../../analyzer/project-analyzer.js';
import { CodeStyleProfiler } from '../../analyzer/codestyle-profiler.js';
import { EXIT_CODES } from '../types.js';

export const options = z.object({
  project: z.string().default(process.cwd()).describe('Project path to analyze'),
  output: z.string().optional().describe('Output directory for analysis files (default: .cdm/analysis/)'),
  json: z.boolean().default(false).describe('Also output raw JSON analysis'),
});

type Props = {
  options: z.infer<typeof options>;
};

type AnalyzePhase = 'starting' | 'analyzing' | 'profiling' | 'done' | 'error';

interface AnalyzeState {
  phase: AnalyzePhase;
  error?: Error;
  analysisStats?: {
    filesCount: number;
    modules: number;
    sourceFiles: number;
    testFiles: number;
    totalLines: number;
    internalDeps: number;
    externalDeps: number;
  };
  styleStats?: {
    pattern: string;
    indentation: string;
    quotes: string;
    semicolons: boolean;
    fileNaming: string;
    varNaming: string;
  };
  outputDir?: string;
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

export default function AnalyzeCommand({ options }: Props): React.ReactElement {
  const [state, setState] = useState<AnalyzeState>({ phase: 'starting' });
  const projectPath = path.resolve(options.project);
  const outputDir = options.output ?? path.join(projectPath, '.cdm', 'analysis');

  useEffect(() => {
    async function runAnalysis(): Promise<void> {
      try {
        guardSelfInit(projectPath);

        setState({ phase: 'analyzing', outputDir });
        const analyzer = new ProjectAnalyzer(projectPath);
        const analysis = await analyzer.analyze();
        const analysisFiles = analyzer.generateAnalysisFiles(analysis);
        analyzer.saveAnalysisFolder(outputDir, analysisFiles);

        if (options.json) {
          const jsonPath = path.join(outputDir, 'analysis.json');
          fs.writeFileSync(jsonPath, JSON.stringify(analysis, null, 2), 'utf-8');
        }

        setState((s) => ({
          ...s,
          analysisStats: {
            filesCount: analysisFiles.size,
            modules: analysis.modules.length,
            sourceFiles: analysis.overview.totalSourceFiles,
            testFiles: analysis.overview.totalTestFiles,
            totalLines: analysis.overview.totalLines,
            internalDeps: analysis.dependencyGraph.length,
            externalDeps: analysis.externalDeps.length,
          },
        }));

        setState((s) => ({ ...s, phase: 'profiling' }));
        const profiler = new CodeStyleProfiler(projectPath);
        const styleProfile = await profiler.profile();
        const profileMd = profiler.generateMarkdown(styleProfile);
        profiler.saveProfile(path.join(outputDir, 'codestyle.md'), profileMd);

        setState((s) => ({
          ...s,
          phase: 'done',
          styleStats: {
            pattern: styleProfile.architecture.pattern,
            indentation: styleProfile.formatting.indentation,
            quotes: styleProfile.formatting.quotes,
            semicolons: styleProfile.formatting.semicolons,
            fileNaming: styleProfile.naming.files,
            varNaming: styleProfile.naming.variables,
          },
        }));
      } catch (error) {
        setState({ phase: 'error', error: error instanceof Error ? error : new Error(String(error)) });
      }
    }

    runAnalysis();
  }, [projectPath, outputDir, options.json]);

  if (state.phase === 'error' && state.error) {
    return <ErrorDisplay error={state.error} suggestion="Check that the project path exists and contains source files." />;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={colors.info}>🔍 Analyzing Project</Text>
      <Text> </Text>

      <Box marginLeft={2} flexDirection="column">
        {state.phase === 'analyzing' && <Spinner label="Analyzing project..." />}
        {['profiling', 'done'].includes(state.phase) && state.analysisStats && (
          <>
            <Text color={colors.success}>✅ Analysis complete</Text>
            {options.json && <Text color={colors.success}>  JSON:     {outputDir}/analysis.json</Text>}
            <Text color={colors.success}>  Output:   {outputDir}/ ({state.analysisStats.filesCount} files)</Text>
            <Text>  Modules:  {state.analysisStats.modules}</Text>
            <Text>  Files:    {state.analysisStats.sourceFiles} source, {state.analysisStats.testFiles} test</Text>
            <Text>  Lines:    {state.analysisStats.totalLines.toLocaleString()}</Text>
            <Text>  Deps:     {state.analysisStats.internalDeps} internal edges, {state.analysisStats.externalDeps} external</Text>
          </>
        )}

        {state.phase === 'profiling' && <Spinner label="Profiling code style..." />}
        {state.phase === 'done' && state.styleStats && (
          <>
            <Text> </Text>
            <Text color={colors.success}>✅ Code style profile generated</Text>
            <Text color={colors.success}>  Codestyle: {outputDir}/codestyle.md</Text>
            <Text>  Arch:     {state.styleStats.pattern}</Text>
            <Text>  Style:    {state.styleStats.indentation}, {state.styleStats.quotes} quotes, {state.styleStats.semicolons ? 'semicolons' : 'no semicolons'}</Text>
            <Text>  Naming:   files={state.styleStats.fileNaming}, vars={state.styleStats.varNaming}</Text>
            <Text> </Text>
            <Text color={colors.muted}>  Agents will follow these conventions when modifying the codebase.</Text>
          </>
        )}
      </Box>
    </Box>
  );
}

export const description = 'Analyze the target project and generate structured analysis files for agents';
