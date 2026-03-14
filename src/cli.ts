#!/usr/bin/env node

import * as path from 'node:path';
import * as fs from 'node:fs';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { prompt } from 'enquirer';
import {
  FeaturePriority,
  FeatureStatus,
  AgentRole,
  StepStatus,
  type PipelineResult,
  type Feature,
} from './types';
import { loadConfig, saveConfig, getDefaultConfig, CDMConfig } from './utils/config';
import logger, { addFileTransport, pipelineLog } from './utils/logger';
import { ArtifactStore } from './workspace/artifact-store';
import { ProjectContext } from './orchestrator/context';
import { PipelineOrchestrator, type PipelineOptions } from './orchestrator/pipeline';
import { ClaudeCodeBridge, type ExecutionMode, type ProjectSnapshot } from './orchestrator/claude-code-bridge';
import { ProjectAnalyzer } from './analyzer/project-analyzer';
import { CodeStyleProfiler } from './analyzer/codestyle-profiler';
import { DevelopmentTracker } from './tracker/development-tracker';
import { ensureRtkInitialized, isRtkInstalled, getRtkGain } from './utils/rtk';

// Read version from package.json at build time (resolved relative to dist/)
 
const { version: VERSION } = require(path.join(__dirname, '..', 'package.json'));

// ─── Global error handlers ───────────────────────────────────────────────────

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`);
  if (error.stack) logger.error(error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logger.error(`Unhandled rejection: ${message}`);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\nInterrupted. Exiting gracefully...'));
  process.exit(130);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM. Shutting down...');
  process.exit(0);
});

// ─── CLI Setup ───────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('cdm')
  .description('Claude Dev Manager — Multi-agent development management system powered by Claude Code')
  .version(VERSION);

function guardSelfInit(projectPath: string): void {
  const selfPkg = path.join(path.resolve(projectPath), 'package.json');
  if (fs.existsSync(selfPkg)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(selfPkg, 'utf-8'));
      if (pkg.name === 'claude-dev-manager') {
        console.log(chalk.red('\nError: Cannot run CDM on its own source/install directory.'));
        console.log(chalk.gray('Use --project <path> to point to your target project.\n'));
        console.log(chalk.gray('Example: cdm init --project ~/my-app\n'));
        process.exit(1);
      }
    } catch { /* not parseable, fine to proceed */ }
  }
}

// ─── cdm start ───────────────────────────────────────────────────────────────

program
  .command('start')
  .description('Start the development pipeline for a new feature')
  .argument('<description>', 'Feature description')
  .option('-p, --priority <priority>', 'Feature priority (low|medium|high|critical)', 'medium')
  .option('-t, --template <name>', 'Pipeline template (quick-fix|feature|full-feature|review-only|design-only|deploy)')
  .option('--skip-steps <steps>', 'Comma-separated step indices to skip', '')
  .option('--max-retries <n>', 'Maximum retries per step', '2')
  .option('--dry-run', 'Show what would happen without executing', false)
  .option('--no-interactive', 'Run without interactive prompts')
  .option('--project <path>', 'Project path', process.cwd())
  .option('--mode <mode>', 'Execution mode: claude-cli or simulation', 'claude-cli')
  .option('--model <model>', 'Claude model to use (e.g. claude-sonnet-4-20250514)')
  .option('-v, --verbose', 'Verbose output', false)
  .option('--json', 'Output result as JSON', false)
  .action(async (description: string, opts: any) => {
    const projectPath = opts.project;
    guardSelfInit(projectPath);
    const config = loadConfig(projectPath);

    if (opts.verbose) {
      process.env.CDM_LOG_LEVEL = 'debug';
    }
    addFileTransport(projectPath);

    const spinner = ora();

    console.log(chalk.bold.cyan('\n🚀 Claude Dev Manager v' + VERSION));
    console.log(chalk.gray('Multi-Agent Development Pipeline powered by Claude Code\n'));

    const artifactStore = new ArtifactStore(projectPath);
    const context = new ProjectContext(projectPath);
    const project = context.getProject();

    console.log(chalk.white(`Project: ${chalk.bold(project.name)}`));
    console.log(chalk.white(`Language: ${project.config.language} | Framework: ${project.config.framework}`));
    console.log(chalk.white(`Feature: ${chalk.bold(description)}`));
    if (opts.template) {
      console.log(chalk.white(`Template: ${chalk.bold(opts.template)}`));
    }
    console.log();

    if (!isRtkInstalled()) {
      console.error(chalk.gray('Tip: Install rtk to reduce agent token usage by 60-90%: brew install rtk'));
    }

    const priority = mapPriority(opts.priority);
    const feature = context.createFeature(description, description, priority);

    const skipSteps = opts.skipSteps
      ? opts.skipSteps.split(',').map((s: string) => s.trim())
      : [];

    const pipelineOptions: PipelineOptions = {
      skipSteps,
      template: opts.template,
      maxRetries: parseInt(opts.maxRetries, 10),
      dryRun: opts.dryRun,
      interactive: opts.interactive !== false,
      onStepStart: (step) => {
        spinner.start(chalk.cyan(`Step ${step.index}: ${step.description}...`));
      },
      onStepComplete: (step) => {
        spinner.succeed(chalk.green(`Step ${step.index}: ${step.description}`));
      },
      onAgentWork: (role, task) => {
        spinner.text = chalk.cyan(`  ${getAgentIcon(role)} ${formatAgentName(role)}: ${(task as any).title}`);
      },
      onError: (stepIndex, error) => {
        spinner.fail(chalk.red(`Error at step ${stepIndex}: ${error.message}`));
      },
    };

    if (opts.dryRun) {
      console.log(chalk.yellow('\n📋 DRY RUN — Pipeline will analyze task and show plan:\n'));
    }

    const analysisDir = path.join(projectPath, '.cdm', 'analysis');
    if (!fs.existsSync(analysisDir)) {
      console.log(chalk.yellow('Tip: Run `cdm analyze` first to generate a project analysis for smarter agent context.\n'));
    }

    const bridgeOptions = {
      executionMode: opts.mode as ExecutionMode,
      model: opts.model,
    };
    const orchestrator = new PipelineOrchestrator(context, artifactStore, config, bridgeOptions);

    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.bold('\n📋 Pipeline Execution\n'));

    try {
      const result = await orchestrator.runFeaturePipeline(feature, pipelineOptions);
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printPipelineResult(result);
      }
    } catch (error) {
      spinner.fail(chalk.red('Pipeline failed'));
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

// ─── cdm status ──────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show the status of the current feature pipeline')
  .option('--project <path>', 'Project path', process.cwd())
  .action((opts: any) => {
    const context = new ProjectContext(opts.project);
    const features = context.getAllFeatures();

    if (features.length === 0) {
      console.log(chalk.yellow('No features found. Run `cdm start` to begin.'));
      return;
    }

    console.log(chalk.bold.cyan('\n📊 Feature Status\n'));

    for (const feature of features) {
      const statusColor = feature.status === 'completed' ? chalk.green :
        feature.status === 'in_progress' ? chalk.cyan :
        feature.status === 'on_hold' ? chalk.yellow : chalk.gray;

      console.log(`${statusColor('●')} ${chalk.bold(feature.name)}`);
      console.log(`  ID: ${chalk.gray(feature.id)}`);
      console.log(`  Status: ${statusColor(feature.status)}`);
      console.log(`  Step: ${feature.currentStep}`);
      console.log(`  Created: ${feature.createdAt.toLocaleDateString()}`);
      console.log(`  Artifacts: ${feature.artifacts.length}`);
      console.log(`  Issues: ${feature.issues.length}`);
      console.log();
    }
  });

// ─── cdm agents ──────────────────────────────────────────────────────────────

program
  .command('agents')
  .description('List all available agents and their skills')
  .option('--json', 'Output as JSON', false)
  .action((opts: any) => {
    const agents = [
      {
        role: AgentRole.PLANNER,
        icon: '📋',
        title: 'Planner',
        desc: 'Analyzes tasks, creates execution plans, classifies work type',
        skills: ['requirements-analysis', 'task-decomposition'],
      },
      {
        role: AgentRole.ARCHITECT,
        icon: '🏗️',
        title: 'Architect',
        desc: 'Designs systems, APIs, data models, and UI specifications',
        skills: ['system-design', 'api-design', 'data-modeling', 'ui-design'],
      },
      {
        role: AgentRole.DEVELOPER,
        icon: '💻',
        title: 'Developer',
        desc: 'Writes production code, tests, and documentation',
        skills: ['code-implementation', 'test-writing', 'documentation'],
      },
      {
        role: AgentRole.REVIEWER,
        icon: '🔍',
        title: 'Reviewer',
        desc: 'Reviews code quality, security, performance, and accessibility',
        skills: ['code-review', 'security-audit', 'performance-analysis', 'accessibility-audit', 'test-validation'],
      },
      {
        role: AgentRole.OPERATOR,
        icon: '🚀',
        title: 'Operator',
        desc: 'Handles CI/CD, deployment, and monitoring configuration',
        skills: ['ci-cd', 'deployment', 'monitoring'],
      },
    ];

    if (opts.json) {
      console.log(JSON.stringify(agents, null, 2));
      return;
    }

    console.log(chalk.bold.cyan('\n👥 Agent Team (5 Agents + 17 Skills)\n'));

    for (const agent of agents) {
      console.log(`  ${agent.icon} ${chalk.bold(agent.title)}`);
      console.log(`     ${chalk.gray(agent.desc)}`);
      console.log(`     Skills: ${chalk.cyan(agent.skills.join(', '))}`);
      console.log();
    }

    console.log(chalk.gray('  Run `cdm skills` to see all available skills.\n'));
  });

// ─── cdm skills ─────────────────────────────────────────────────────────────

program
  .command('skills')
  .description('List all available skills')
  .option('--category <cat>', 'Filter by category (planning|design|build|review|operations)')
  .option('--json', 'Output as JSON', false)
  .action((opts: any) => {
    const skills = [
      { id: 'requirements-analysis', name: 'Requirements Analysis', category: 'planning', agents: ['planner'] },
      { id: 'task-decomposition', name: 'Task Decomposition', category: 'planning', agents: ['planner'] },
      { id: 'system-design', name: 'System Design', category: 'design', agents: ['architect'] },
      { id: 'api-design', name: 'API Design', category: 'design', agents: ['architect'] },
      { id: 'data-modeling', name: 'Data Modeling', category: 'design', agents: ['architect'] },
      { id: 'ui-design', name: 'UI Design', category: 'design', agents: ['architect'] },
      { id: 'code-implementation', name: 'Code Implementation', category: 'build', agents: ['developer'] },
      { id: 'test-writing', name: 'Test Writing', category: 'build', agents: ['developer'] },
      { id: 'documentation', name: 'Documentation', category: 'build', agents: ['developer'] },
      { id: 'code-review', name: 'Code Review', category: 'review', agents: ['reviewer'] },
      { id: 'security-audit', name: 'Security Audit', category: 'review', agents: ['reviewer'] },
      { id: 'performance-analysis', name: 'Performance Analysis', category: 'review', agents: ['reviewer'] },
      { id: 'accessibility-audit', name: 'Accessibility Audit', category: 'review', agents: ['reviewer'] },
      { id: 'test-validation', name: 'Test Validation', category: 'review', agents: ['reviewer'] },
      { id: 'ci-cd', name: 'CI/CD Pipeline', category: 'operations', agents: ['operator'] },
      { id: 'deployment', name: 'Deployment', category: 'operations', agents: ['operator'] },
      { id: 'monitoring', name: 'Monitoring', category: 'operations', agents: ['operator'] },
    ];

    let filtered = skills;
    if (opts.category) {
      filtered = skills.filter(s => s.category === opts.category);
    }

    if (opts.json) {
      console.log(JSON.stringify(filtered, null, 2));
      return;
    }

    console.log(chalk.bold.cyan('\n🧩 Available Skills\n'));

    const categories = ['planning', 'design', 'build', 'review', 'operations'];
    const categoryIcons: Record<string, string> = {
      planning: '📋',
      design: '🏗️',
      build: '💻',
      review: '🔍',
      operations: '🚀',
    };

    for (const cat of categories) {
      if (opts.category && opts.category !== cat) continue;
      
      const catSkills = filtered.filter(s => s.category === cat);
      if (catSkills.length === 0) continue;

      console.log(chalk.bold(`  ${categoryIcons[cat]} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`));
      for (const skill of catSkills) {
        console.log(`     ${chalk.cyan(skill.id)} — ${skill.name}`);
      }
      console.log();
    }

    console.log(chalk.gray(`  Total: ${filtered.length} skills\n`));
  });

// ─── cdm init ────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize CDM in the current project')
  .option('--project <path>', 'Project path', process.cwd())
  .action(async (opts: any) => {
    const projectPath = path.resolve(opts.project);
    guardSelfInit(projectPath);

    console.log(chalk.bold.cyan('\n🔧 Initializing Claude Dev Manager\n'));

    const config = getDefaultConfig();
    const context = new ProjectContext(projectPath);
    const project = context.getProject();

    console.log(chalk.white(`Project: ${chalk.bold(project.name)}`));
    console.log(chalk.white(`Detected language: ${project.config.language}`));
    console.log(chalk.white(`Detected framework: ${project.config.framework}\n`));

    saveConfig(projectPath, config);
    console.log(chalk.green('✅ Created cdm.config.yaml'));

    // ── Analyze the project BEFORE writing CDM files to .cdm/ ─────────────────
    // This ensures the analysis only inspects the user's own code, not CDM-generated content.
    console.log(chalk.gray('\n  Running project analysis...'));
    const analyzer = new ProjectAnalyzer(projectPath);
    const analysis = await analyzer.analyze();
    const analysisDir = path.join(projectPath, '.cdm', 'analysis');
    const analysisFiles = analyzer.generateAnalysisFiles(analysis);
    analyzer.saveAnalysisFolder(analysisDir, analysisFiles);
    console.log(chalk.green(`✅ Generated .cdm/analysis/ (${analysisFiles.size} files · ${analysis.modules.length} modules · ${analysis.overview.totalLines.toLocaleString()} lines)`));

    console.log(chalk.gray('  Profiling code style...'));
    const profiler = new CodeStyleProfiler(projectPath);
    const codeStyleProfile = await profiler.profile();
    const profileMd = profiler.generateMarkdown(codeStyleProfile);
    profiler.saveProfile(path.join(analysisDir, 'codestyle.md'), profileMd);
    console.log(chalk.green(`✅ Generated .cdm/analysis/codestyle.md (${codeStyleProfile.architecture.pattern})`));

    // ── Build snapshot from analysis + profile + project config ──────────────
    const topDirs = [...new Set(
      analysis.modules.map(m => m.filePath.split('/')[0]).filter(Boolean),
    )].filter(d => d !== '.' && !d.startsWith('.')) as string[];

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
      keyDeps: analysis.externalDeps.map(d => `${d.name}${d.purpose ? ` (${d.purpose})` : ''}`),
      patterns: analysis.patterns,
      testDirs: analysis.testStructure.dirs.slice(0, 4),
      apiStyle: codeStyleProfile.api.style,
    };

    // ── Now write CDM agent files and CLAUDE.md ───────────────────────────────
    const artifactStore = new ArtifactStore(projectPath);
    const agentRegistry = new (require('./agents/index').AgentRegistry)(artifactStore);
    const bridge = new ClaudeCodeBridge(agentRegistry, artifactStore, { projectPath });

    bridge.writeAgentInstructionFiles(snapshot);
    console.log(chalk.green('✅ Generated agent instruction files in .cdm/agents/'));

    const claudeMd = bridge.generateMainClaudeMd();
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, claudeMd, 'utf-8');
    console.log(chalk.green('✅ Generated CLAUDE.md (references .cdm/ structure)'));

    // ── RTK setup (token optimizer) ────────────────────────────────────────────
    const rtkResult = ensureRtkInitialized();
    if (rtkResult.installed && rtkResult.hookActive) {
      console.log(chalk.green('✅ RTK hook active — agent CLI outputs will be compressed'));
    } else if (rtkResult.installed && !rtkResult.hookActive) {
      console.log(chalk.yellow('⚠️  RTK found but hook setup failed. Run: rtk init --global'));
    } else {
      console.log(chalk.gray('   Tip: Install rtk for 60-90% token savings: brew install rtk'));
    }

    console.log(chalk.bold.green('\n🎉 CDM initialized! Run `cdm start "your feature"` to begin.'));
    console.log(chalk.gray('   All CDM data is in .cdm/ — CLAUDE.md is the entry point.\n'));
  });

// ─── cdm artifacts ───────────────────────────────────────────────────────────

program
  .command('artifacts')
  .description('List all artifacts produced during development')
  .option('--project <path>', 'Project path', process.cwd())
  .option('--type <type>', 'Filter by artifact type')
  .action((opts: any) => {
    const artifactStore = new ArtifactStore(opts.project);
    const summary = artifactStore.getSummary();

    console.log(chalk.bold.cyan('\n📦 Artifacts\n'));
    console.log(chalk.white(`Total: ${summary.total}\n`));

    if (summary.total === 0) {
      console.log(chalk.yellow('No artifacts yet. Run `cdm start` to produce artifacts.'));
      return;
    }

    console.log(chalk.bold('By Type:'));
    for (const [type, count] of Object.entries(summary.byType)) {
      console.log(`  ${type}: ${count}`);
    }

    console.log(chalk.bold('\nBy Status:'));
    for (const [status, count] of Object.entries(summary.byStatus)) {
      console.log(`  ${status}: ${count}`);
    }
  });

// ─── cdm resume ─────────────────────────────────────────────────────────────

program
  .command('resume')
  .description('Resume a failed or paused feature pipeline from its last incomplete step')
  .argument('[feature-id]', 'Feature ID to resume (uses most recent if omitted)')
  .option('--skip-steps <steps>', 'Comma-separated step indices to skip', '')
  .option('--max-retries <n>', 'Maximum retries per step', '2')
  .option('--project <path>', 'Project path', process.cwd())
  .option('--mode <mode>', 'Execution mode: claude-cli or simulation', 'claude-cli')
  .option('--model <model>', 'Claude model to use')
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (featureId: string | undefined, opts: any) => {
    const projectPath = opts.project;
    const config = loadConfig(projectPath);

    if (opts.verbose) {
      process.env.CDM_LOG_LEVEL = 'debug';
    }
    addFileTransport(projectPath);

    const spinner = ora();
    const context = new ProjectContext(projectPath);
    const artifactStore = new ArtifactStore(projectPath);

    let feature;
    if (featureId) {
      feature = context.getFeature(featureId);
    } else {
      const allFeatures = context.getAllFeatures();
      feature = allFeatures.find(f =>
        f.status === FeatureStatus.ON_HOLD || f.status === FeatureStatus.IN_PROGRESS,
      ) ?? allFeatures[allFeatures.length - 1];
    }

    if (!feature) {
      console.log(chalk.red('\nNo feature found to resume. Run `cdm start` first.'));
      process.exit(1);
    }

    console.log(chalk.bold.cyan('\n🔄 Resuming Pipeline'));
    console.log(chalk.white(`Feature: ${chalk.bold(feature.name)}`));
    console.log(chalk.white(`Status:  ${feature.status}`));
    console.log(chalk.white(`Step:    ${feature.currentStep}\n`));

    if (!isRtkInstalled()) {
      console.error(chalk.gray('Tip: Install rtk to reduce agent token usage by 60-90%: brew install rtk'));
    }

    const nextStep = findResumeStep(feature);
    if (nextStep === null) {
      console.log(chalk.yellow('This feature has already completed all steps.'));
      return;
    }

    console.log(chalk.white(`Resuming from: ${chalk.bold(`Step ${nextStep}`)}\n`));

    const skipSteps = opts.skipSteps
      ? opts.skipSteps.split(',').map((s: string) => s.trim())
      : [];

    const pipelineOptions: PipelineOptions = {
      skipSteps,
      maxRetries: parseInt(opts.maxRetries, 10),
      dryRun: false,
      interactive: true,
      startFromStep: nextStep,
      onStepStart: (step) => {
        spinner.start(chalk.cyan(`Step ${step.index}: ${step.description}...`));
      },
      onStepComplete: (step) => {
        spinner.succeed(chalk.green(`Step ${step.index}: ${step.description}`));
      },
      onAgentWork: (role, task) => {
        spinner.text = chalk.cyan(`  ${getAgentIcon(role)} ${formatAgentName(role)}: ${(task as any).title}`);
      },
      onError: (stepIndex, error) => {
        spinner.fail(chalk.red(`Error at step ${stepIndex}: ${error.message}`));
      },
    };

    const bridgeOptions = {
      executionMode: opts.mode as ExecutionMode,
      model: opts.model,
    };
    const orchestrator = new PipelineOrchestrator(context, artifactStore, config, bridgeOptions);

    try {
      const result = await orchestrator.runFeaturePipeline(feature, pipelineOptions);
      printPipelineResult(result);
    } catch (error) {
      spinner.fail(chalk.red('Pipeline failed'));
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

// ─── cdm show ───────────────────────────────────────────────────────────────

program
  .command('show')
  .description('Show details of a specific artifact or feature')
  .argument('<target>', 'Artifact ID, artifact name, or feature ID to display')
  .option('--project <path>', 'Project path', process.cwd())
  .action((target: string, opts: any) => {
    const artifactStore = new ArtifactStore(opts.project);
    const context = new ProjectContext(opts.project);

    const artifact = artifactStore.getById(target) ?? artifactStore.getByName(target);
    if (artifact) {
      console.log(chalk.bold.cyan(`\n📄 Artifact: ${artifact.name}\n`));
      console.log(chalk.white(`  ID:          ${chalk.gray(artifact.id)}`));
      console.log(chalk.white(`  Type:        ${artifact.type}`));
      console.log(chalk.white(`  Status:      ${artifact.status}`));
      console.log(chalk.white(`  Review:      ${artifact.reviewStatus}`));
      console.log(chalk.white(`  Created by:  ${artifact.createdBy}`));
      console.log(chalk.white(`  Version:     ${artifact.version}`));
      console.log(chalk.white(`  Path:        ${artifact.filePath}`));
      console.log(chalk.white(`  Created:     ${artifact.createdAt}`));
      console.log(chalk.gray('\n' + '─'.repeat(60)));
      console.log(chalk.white('\n' + artifact.content));
      console.log();
      return;
    }

    const feature = context.getFeature(target);
    if (feature) {
      console.log(chalk.bold.cyan(`\n📋 Feature: ${feature.name}\n`));
      console.log(chalk.white(`  ID:       ${chalk.gray(feature.id)}`));
      console.log(chalk.white(`  Status:   ${feature.status}`));
      console.log(chalk.white(`  Step:     ${feature.currentStep}`));
      console.log(chalk.white(`  Priority: ${feature.priority}`));
      console.log(chalk.white(`  Created:  ${feature.createdAt}`));

      if (feature.artifacts.length > 0) {
        console.log(chalk.bold('\n  Artifacts:'));
        for (const a of feature.artifacts) {
          console.log(`    - ${a.name} (${a.type}) [${a.status}]`);
        }
      }

      if (feature.issues.length > 0) {
        console.log(chalk.bold('\n  Issues:'));
        for (const i of feature.issues) {
          const sevColor = i.severity === 'critical' ? chalk.red :
            i.severity === 'high' ? chalk.yellow : chalk.gray;
          console.log(`    - ${sevColor(`[${i.severity}]`)} ${i.title}`);
        }
      }

      const stepResults = Array.from(feature.stepResults.entries());
      if (stepResults.length > 0) {
        console.log(chalk.bold('\n  Step History:'));
        for (const [stepIndex, result] of stepResults) {
          const statusIcon = result.status === 'completed' ? chalk.green('✓') :
            result.status === 'failed' ? chalk.red('✗') : chalk.yellow('~');
          console.log(`    ${statusIcon} Step ${stepIndex}: ${result.skills.join(', ')} — ${result.status} (${result.artifacts.length} artifacts, ${result.issues.length} issues)`);
        }
      }

      console.log();
      return;
    }

    console.log(chalk.yellow(`\nNo artifact or feature found matching "${target}".`));
    console.log(chalk.gray('Use `cdm artifacts` to list artifacts or `cdm status` to list features.'));
  });

// ─── cdm config ─────────────────────────────────────────────────────────────

program
  .command('config')
  .description('View or update CDM configuration')
  .option('--project <path>', 'Project path', process.cwd())
  .option('--set <key=value>', 'Set a configuration value (e.g. pipeline.maxRetries=3)')
  .option('--reset', 'Reset configuration to defaults')
  .action((opts: any) => {
    const projectPath = opts.project;

    if (opts.reset) {
      const config = getDefaultConfig();
      saveConfig(projectPath, config);
      console.log(chalk.green('\n✅ Configuration reset to defaults.\n'));
      return;
    }

    if (opts.set) {
      const config = loadConfig(projectPath);
      const [keyPath, value] = opts.set.split('=');
      if (!keyPath || value === undefined) {
        console.log(chalk.red('Invalid format. Use --set key.path=value'));
        process.exit(1);
      }
      setNestedValue(config, keyPath, parseConfigValue(value));
      saveConfig(projectPath, config);
      console.log(chalk.green(`\n✅ Set ${keyPath} = ${value}\n`));
      return;
    }

    const config = loadConfig(projectPath);
    console.log(chalk.bold.cyan('\n⚙️  CDM Configuration\n'));

    console.log(chalk.bold('Project:'));
    console.log(`  Language:       ${config.project.language}`);
    console.log(`  Framework:      ${config.project.framework}`);
    console.log(`  Test framework: ${config.project.testFramework}`);
    console.log(`  Build tool:     ${config.project.buildTool}`);
    console.log(`  CI provider:    ${config.project.ciProvider}`);
    console.log(`  Deploy target:  ${config.project.deployTarget}`);

    console.log(chalk.bold('\nPipeline:'));
    console.log(`  Max retries:    ${config.pipeline.maxRetries}`);
    console.log(`  Timeout (min):  ${config.pipeline.timeoutMinutes}`);
    console.log(`  Approvals:      ${config.pipeline.requireApprovals}`);
    console.log(`  Skip steps:     ${config.pipeline.skipSteps.join(', ') || 'none'}`);

    console.log(chalk.bold('\nAgents:'));
    for (const [role, override] of Object.entries(config.agents)) {
      const status = override.enabled ? chalk.green('enabled') : chalk.red('disabled');
      const extra = override.maxTokenBudget ? ` (budget: ${override.maxTokenBudget})` : '';
      console.log(`  ${formatAgentName(role as AgentRole)}: ${status}${extra}`);
    }

    console.log(chalk.gray('\nUse --set to modify values (e.g. cdm config --set pipeline.maxRetries=3)\n'));
  });

// ─── cdm analyze ────────────────────────────────────────────────────────────

program
  .command('analyze')
  .description('Analyze the target project and generate structured analysis files for agents')
  .option('--project <path>', 'Project path to analyze', process.cwd())
  .option('-o, --output <dir>', 'Output directory for analysis files (default: .cdm/analysis/)')
  .option('--json', 'Also output raw JSON analysis', false)
  .action(async (opts: any) => {
    const projectPath = opts.project;
    guardSelfInit(projectPath);
    const outputDir = opts.output ?? path.join(projectPath, '.cdm', 'analysis');

    const spinner = ora();
    spinner.start(chalk.cyan('Analyzing project...'));

    try {
      const analyzer = new ProjectAnalyzer(projectPath);
      const analysis = await analyzer.analyze();
      const analysisFiles = analyzer.generateAnalysisFiles(analysis);

      analyzer.saveAnalysisFolder(outputDir, analysisFiles);
      spinner.succeed(chalk.green('Analysis complete'));

      if (opts.json) {
        const jsonPath = path.join(outputDir, 'analysis.json');
        fs.writeFileSync(jsonPath, JSON.stringify(analysis, null, 2), 'utf-8');
        console.log(chalk.green(`  JSON:     ${jsonPath}`));
      }

      console.log(chalk.green(`  Output:   ${outputDir}/ (${analysisFiles.size} files)`));
      console.log(chalk.white(`  Modules:  ${analysis.modules.length}`));
      console.log(chalk.white(`  Files:    ${analysis.overview.totalSourceFiles} source, ${analysis.overview.totalTestFiles} test`));
      console.log(chalk.white(`  Lines:    ${analysis.overview.totalLines.toLocaleString()}`));
      console.log(chalk.white(`  Deps:     ${analysis.dependencyGraph.length} internal edges, ${analysis.externalDeps.length} external`));

      spinner.start(chalk.cyan('Profiling code style...'));
      const profiler = new CodeStyleProfiler(projectPath);
      const styleProfile = await profiler.profile();
      const profileMd = profiler.generateMarkdown(styleProfile);
      profiler.saveProfile(path.join(outputDir, 'codestyle.md'), profileMd);
      spinner.succeed(chalk.green('Code style profile generated'));

      console.log(chalk.green(`  Codestyle: ${outputDir}/codestyle.md`));
      console.log(chalk.white(`  Arch:     ${styleProfile.architecture.pattern}`));
      console.log(chalk.white(`  Style:    ${styleProfile.formatting.indentation}, ${styleProfile.formatting.quotes} quotes, ${styleProfile.formatting.semicolons ? 'semicolons' : 'no semicolons'}`));
      console.log(chalk.white(`  Naming:   files=${styleProfile.naming.files}, vars=${styleProfile.naming.variables}`));
      console.log(chalk.gray(`\n  Agents will follow these conventions when modifying the codebase.\n`));
    } catch (error) {
      spinner.fail(chalk.red('Analysis failed'));
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

// ─── cdm history ────────────────────────────────────────────────────────────

program
  .command('history')
  .description('Show the development history timeline and metrics')
  .option('--project <path>', 'Project path', process.cwd())
  .option('--feature <id>', 'Filter by feature ID')
  .option('-n, --last <count>', 'Show only the last N events')
  .option('--export', 'Export history to .cdm/history/ as markdown and JSON', false)
  .action((opts: any) => {
    const projectPath = opts.project;
    const context = new ProjectContext(projectPath);
    const project = context.getProject();
    const tracker = new DevelopmentTracker(projectPath, project.id, project.name);

    const events = opts.feature
      ? tracker.getEventsForFeature(opts.feature)
      : tracker.getEvents();

    if (events.length === 0) {
      console.log(chalk.yellow('\nNo development history found. Run `cdm start` to generate events.\n'));
      return;
    }

    if (opts.export) {
      const { markdownPath, jsonPath } = tracker.saveHistory();
      console.log(chalk.green(`\n✅ History exported:`));
      console.log(chalk.white(`  Markdown: ${markdownPath}`));
      console.log(chalk.white(`  JSON:     ${jsonPath}`));
      console.log(chalk.white(`  Events:   ${events.length}\n`));
      return;
    }

    const summary = tracker.buildSummary();

    console.log(chalk.bold.cyan(`\n📜 Development History: ${project.name}\n`));

    console.log(chalk.bold('Summary:'));
    console.log(`  Features:     ${summary.totalFeatures} (${chalk.green(String(summary.completedFeatures))} completed, ${chalk.red(String(summary.failedFeatures))} failed)`);
    console.log(`  Steps run:    ${summary.totalStepsExecuted}`);
    console.log(`  Artifacts:    ${summary.totalArtifactsProduced}`);
    console.log(`  Issues:       ${summary.totalIssuesFound} found, ${summary.totalIssuesResolved} resolved`);
    console.log(`  Tokens:       ${summary.totalTokensUsed.toLocaleString()}`);
    console.log(`  Duration:     ${(summary.totalDurationMs / 1000).toFixed(1)}s`);

    if (Object.keys(summary.agentActivity).length > 0) {
      console.log(chalk.bold('\nAgent Activity:'));
      for (const [role, data] of Object.entries(summary.agentActivity)) {
        const name = formatAgentName(role as AgentRole);
        console.log(`  ${name}: ${data.tasks} tasks, ${data.tokensUsed.toLocaleString()} tokens, ${(data.durationMs / 1000).toFixed(1)}s`);
      }
    }

    const displayEvents = opts.last
      ? events.slice(-parseInt(opts.last, 10))
      : events.slice(-30);

    console.log(chalk.bold(`\nTimeline (last ${displayEvents.length} events):\n`));
    for (const event of displayEvents) {
      const time = new Date(event.timestamp).toLocaleTimeString();
      const tokenStr = event.tokensUsed ? chalk.gray(` (${event.tokensUsed.toLocaleString()} tok)`) : '';
      const durStr = event.durationMs ? chalk.gray(` [${(event.durationMs / 1000).toFixed(1)}s]`) : '';
      const typeColor = event.type.includes('failed') ? chalk.red :
        event.type.includes('completed') ? chalk.green :
        event.type.includes('skipped') ? chalk.yellow : chalk.white;
      console.log(`  ${chalk.gray(time)} ${typeColor(event.message)}${tokenStr}${durStr}`);
    }

    if (events.length > displayEvents.length) {
      console.log(chalk.gray(`\n  ... ${events.length - displayEvents.length} earlier events (use --last <n> to see more)`));
    }

    console.log(chalk.gray(`\n  Use --export to save full history as markdown and JSON.\n`));
  });

// ─── cdm pipeline ────────────────────────────────────────────────────────────

program
  .command('pipeline')
  .description('Show available pipeline templates')
  .option('--template <name>', 'Show details for a specific template')
  .option('--json', 'Output as JSON', false)
  .action((opts: any) => {
    const templates = [
      {
        id: 'quick-fix',
        name: 'Quick Fix',
        desc: 'For bugs, typos, and small tweaks',
        steps: ['Developer[code-implementation]', 'Reviewer[code-review]'],
      },
      {
        id: 'feature',
        name: 'Feature',
        desc: 'Standard feature development',
        steps: ['Planner[requirements-analysis]', 'Architect[system-design, api-design]', 'Developer[code-implementation, test-writing]', 'Reviewer[code-review]'],
      },
      {
        id: 'full-feature',
        name: 'Full Feature',
        desc: 'Feature with security and deployment',
        steps: ['Planner[requirements-analysis]', 'Architect[system-design, api-design, data-modeling]', 'Developer[code-implementation, test-writing, documentation]', 'Reviewer[code-review]', 'Reviewer[security-audit]', 'Operator[deployment, monitoring]'],
      },
      {
        id: 'review-only',
        name: 'Review Only',
        desc: 'For audits and assessments',
        steps: ['Reviewer[code-review, security-audit, performance-analysis]'],
      },
      {
        id: 'design-only',
        name: 'Design Only',
        desc: 'Architecture spike or RFC',
        steps: ['Planner[requirements-analysis]', 'Architect[system-design, data-modeling]'],
      },
      {
        id: 'deploy',
        name: 'Deploy',
        desc: 'Deploy existing code',
        steps: ['Operator[ci-cd, deployment, monitoring]'],
      },
    ];

    if (opts.json) {
      console.log(JSON.stringify(templates, null, 2));
      return;
    }

    console.log(chalk.bold.cyan('\n🔄 Pipeline Templates\n'));

    if (opts.template) {
      const t = templates.find(t => t.id === opts.template);
      if (!t) {
        console.log(chalk.red(`Template "${opts.template}" not found.`));
        console.log(chalk.gray(`Available: ${templates.map(t => t.id).join(', ')}`));
        process.exit(1);
      }

      console.log(chalk.bold(`  ${t.name} (${t.id})`));
      console.log(chalk.gray(`  ${t.desc}\n`));
      console.log(chalk.bold('  Steps:'));
      t.steps.forEach((step, i) => {
        console.log(`    ${i}. ${step}`);
      });
      console.log();
      return;
    }

    for (const t of templates) {
      console.log(`  ${chalk.bold(t.id.padEnd(15))} ${t.name}`);
      console.log(`  ${' '.repeat(15)} ${chalk.gray(t.desc)}`);
      console.log(`  ${' '.repeat(15)} ${chalk.cyan(t.steps.length + ' steps')}`);
      console.log();
    }

    console.log(chalk.gray('  Use --template <name> to see template details.'));
    console.log(chalk.gray('  Use `cdm start "task" --template <name>` to use a specific template.\n'));
  });

// ─── Helper Functions ────────────────────────────────────────────────────────

function mapPriority(p: string): FeaturePriority {
  const map: Record<string, FeaturePriority> = {
    low: FeaturePriority.LOW,
    medium: FeaturePriority.MEDIUM,
    high: FeaturePriority.HIGH,
    critical: FeaturePriority.CRITICAL,
  };
  return map[p.toLowerCase()] ?? FeaturePriority.MEDIUM;
}

function getStepIcon(stepIndex: number): string {
  return `${stepIndex + 1}️⃣`;
}

function getAgentIcon(role: AgentRole): string {
  const icons: Record<string, string> = {
    [AgentRole.PLANNER]: '📋',
    [AgentRole.ARCHITECT]: '🏗️',
    [AgentRole.DEVELOPER]: '💻',
    [AgentRole.REVIEWER]: '🔍',
    [AgentRole.OPERATOR]: '🚀',
  };
  return icons[role] ?? '🤖';
}

function formatStepName(stepId: string): string {
  return stepId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAgentName(role: AgentRole): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function printPipelinePlan(skipSteps: string[]): void {
  console.log(chalk.bold('  Available Templates:\n'));
  
  const templates = [
    { id: 'quick-fix', steps: 2, desc: 'Developer → Reviewer' },
    { id: 'feature', steps: 4, desc: 'Planner → Architect → Developer → Reviewer' },
    { id: 'full-feature', steps: 6, desc: 'feature + Security + Operator' },
    { id: 'review-only', steps: 1, desc: 'Reviewer (multi-skill)' },
    { id: 'design-only', steps: 2, desc: 'Planner → Architect' },
    { id: 'deploy', steps: 1, desc: 'Operator' },
  ];

  for (const t of templates) {
    console.log(`  ${chalk.cyan(t.id.padEnd(15))} ${t.desc} ${chalk.gray(`(${t.steps} steps)`)}`);
  }

  console.log();
  console.log(chalk.gray('  Use `cdm start "task" --template <name>` to select a template.'));
  console.log(chalk.gray('  Without --template, the Planner agent auto-selects based on task.\n'));
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

function setNestedValue(obj: any, keyPath: string, value: any): void {
  const keys = keyPath.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

function parseConfigValue(value: string): any {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') return num;
  return value;
}

function printPipelineResult(result: PipelineResult): void {
  console.log(chalk.gray('\n' + '─'.repeat(60)));

  if (result.success) {
    console.log(chalk.bold.green('\n✅ Pipeline Completed Successfully!\n'));
  } else {
    console.log(chalk.bold.red('\n❌ Pipeline Failed\n'));
    if (result.stepsFailed && result.stepsFailed.length > 0) {
      console.log(chalk.gray(`  Tip: Run \`cdm resume\` to retry from the failed step.\n`));
    }
  }

  console.log(chalk.bold('Summary:'));
  console.log(`  Execution mode:   ${chalk.cyan(result.executionMode)}`);
  console.log(`  Template used:    ${chalk.cyan(result.templateUsed || 'auto-selected')}`);
  console.log(`  Steps completed:  ${chalk.green(String(result.stepsCompleted?.length ?? 0))}`);
  console.log(`  Steps failed:     ${chalk.red(String(result.stepsFailed?.length ?? 0))}`);
  console.log(`  Steps skipped:    ${chalk.yellow(String(result.stepsSkipped?.length ?? 0))}`);
  console.log(`  Artifacts:        ${chalk.cyan(String(result.artifacts.length))}`);
  console.log(`  Issues:           ${chalk.yellow(String(result.issues.length))}`);
  console.log(`  Tokens used:      ${result.totalTokensUsed.toLocaleString()}`);
  console.log(`  Duration:         ${(result.totalDurationMs / 1000).toFixed(1)}s`);

  const rtkStats = getRtkGain();
  if (rtkStats && rtkStats.totalCommands > 0) {
    console.log(`  RTK savings:      ${rtkStats.tokensSaved.toLocaleString()} tokens (${rtkStats.savingsPercent}%) across ${rtkStats.totalCommands} commands`);
  }

  if (result.issues.length > 0) {
    console.log(chalk.bold('\nIssues:'));
    const bySeverity = result.issues.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] ?? 0) + 1;
      return acc;
    }, {});

    for (const [sev, count] of Object.entries(bySeverity)) {
      const color = sev === 'critical' ? chalk.red : sev === 'high' ? chalk.yellow : chalk.gray;
      console.log(`  ${color(`${sev}: ${count}`)}`);
    }
  }

  if (result.stepsFailed && result.stepsFailed.length > 0) {
    console.log(chalk.bold.red('\nFailed Steps:'));
    for (const step of result.stepsFailed) {
      console.log(`  ${chalk.red('✗')} Step ${step}`);
    }
  }

  if (result.artifacts.length > 0) {
    console.log(chalk.bold('\nArtifacts Produced:'));
    for (const artifact of result.artifacts.slice(0, 10)) {
      console.log(`  ${chalk.cyan('•')} ${artifact.name} ${chalk.gray(`(${artifact.type})`)}`);
    }
    if (result.artifacts.length > 10) {
      console.log(chalk.gray(`  ... and ${result.artifacts.length - 10} more`));
    }
  }

  console.log();
}

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
