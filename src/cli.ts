#!/usr/bin/env node

import * as path from 'node:path';
import * as fs from 'node:fs';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { prompt } from 'enquirer';
import {
  PipelineStage,
  FeaturePriority,
  FeatureStatus,
  AgentRole,
} from './types';
import { loadConfig, saveConfig, getDefaultConfig, CDMConfig } from './utils/config';
import logger, { addFileTransport, pipelineLog } from './utils/logger';
import { ArtifactStore } from './workspace/artifact-store';
import { ProjectContext } from './orchestrator/context';
import { PipelineOrchestrator, type PipelineOptions, type PipelineResult } from './orchestrator/pipeline';
import { ClaudeCodeBridge, type ExecutionMode, type ProjectSnapshot } from './orchestrator/claude-code-bridge';
import { ProjectAnalyzer } from './analyzer/project-analyzer';
import { CodeStyleProfiler } from './analyzer/codestyle-profiler';
import { DevelopmentTracker } from './tracker/development-tracker';

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
  .option('--skip <stages>', 'Comma-separated stages to skip', '')
  .option('--max-retries <n>', 'Maximum retries per stage', '2')
  .option('--dry-run', 'Show what would happen without executing', false)
  .option('--no-interactive', 'Run without interactive prompts')
  .option('--project <path>', 'Project path', process.cwd())
  .option('--mode <mode>', 'Execution mode: claude-cli or simulation', 'claude-cli')
  .option('--model <model>', 'Claude model to use (e.g. claude-sonnet-4-20250514)')
  .option('-v, --verbose', 'Verbose output', false)
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
    console.log(chalk.white(`Feature: ${chalk.bold(description)}\n`));

    const priority = mapPriority(opts.priority);
    const feature = context.createFeature(description, description, priority);

    const skipStages = opts.skip
      ? opts.skip.split(',').map((s: string) => s.trim() as PipelineStage)
      : [];

    const pipelineOptions: PipelineOptions = {
      skipStages,
      maxRetries: parseInt(opts.maxRetries, 10),
      dryRun: opts.dryRun,
      interactive: opts.interactive !== false,
      onStageStart: (stage) => {
        const icon = getStageIcon(stage);
        spinner.start(chalk.cyan(`${icon} ${formatStageName(stage)}...`));
      },
      onStageComplete: (stage, result) => {
        const icon = getStageIcon(stage);
        if (result.status === 'approved') {
          spinner.succeed(chalk.green(`${icon} ${formatStageName(stage)} — ${result.artifacts.length} artifacts, ${result.issues.length} issues`));
        } else if (result.status === 'skipped') {
          spinner.info(chalk.yellow(`${icon} ${formatStageName(stage)} — Skipped`));
        } else {
          spinner.fail(chalk.red(`${icon} ${formatStageName(stage)} — ${result.status}`));
        }
      },
      onAgentWork: (role, task) => {
        spinner.text = chalk.cyan(`  ${getAgentIcon(role)} ${formatAgentName(role)}: ${task.title}`);
      },
      onError: (stage, error) => {
        spinner.fail(chalk.red(`Error in ${stage}: ${error.message}`));
      },
    };

    if (opts.dryRun) {
      console.log(chalk.yellow('\n📋 DRY RUN — Pipeline stages that would execute:\n'));
      printPipelinePlan(skipStages);
      return;
    }

    const analysisPath = path.join(projectPath, '.cdm', 'project-analysis.md');
    if (!fs.existsSync(analysisPath)) {
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
      printPipelineResult(result);
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
      console.log(`  Stage: ${feature.currentStage}`);
      console.log(`  Created: ${feature.createdAt.toLocaleDateString()}`);
      console.log(`  Artifacts: ${feature.artifacts.length}`);
      console.log(`  Issues: ${feature.issues.length}`);
      console.log();
    }
  });

// ─── cdm agents ──────────────────────────────────────────────────────────────

program
  .command('agents')
  .description('List all available agents and their roles')
  .action(() => {
    console.log(chalk.bold.cyan('\n👥 Agent Team\n'));

    const agents = [
      { role: AgentRole.PRODUCT_MANAGER, icon: '📋', title: 'Product Manager', desc: 'Requirements, user stories, acceptance criteria' },
      { role: AgentRole.BUSINESS_ANALYST, icon: '📊', title: 'Business Analyst', desc: 'ROI analysis, business cases, KPIs, market research' },
      { role: AgentRole.ENGINEERING_MANAGER, icon: '👔', title: 'Engineering Manager', desc: 'Task breakdown, sprint planning, coordination' },
      { role: AgentRole.SOLUTIONS_ARCHITECT, icon: '🔧', title: 'Solutions Architect', desc: 'Technology decisions, integration design, migration planning' },
      { role: AgentRole.SYSTEM_ARCHITECT, icon: '🏗️', title: 'System Architect', desc: 'Architecture, API design, data modeling' },
      { role: AgentRole.UI_DESIGNER, icon: '🎨', title: 'UI/UX Designer', desc: 'Interface design, wireframes, components' },
      { role: AgentRole.SENIOR_DEVELOPER, icon: '💻', title: 'Senior Developer', desc: 'Complex features, core code, architecture implementation' },
      { role: AgentRole.JUNIOR_DEVELOPER, icon: '🔧', title: 'Junior Developer', desc: 'Simpler features, utilities, unit tests' },
      { role: AgentRole.DATABASE_ENGINEER, icon: '🗄️', title: 'Database Engineer', desc: 'Schema design, migrations, query optimization' },
      { role: AgentRole.CODE_REVIEWER, icon: '🔍', title: 'Code Reviewer', desc: 'Code quality, best practices, standards' },
      { role: AgentRole.QA_ENGINEER, icon: '🧪', title: 'QA Engineer', desc: 'Test plans, all test levels, quality assurance' },
      { role: AgentRole.PERFORMANCE_ENGINEER, icon: '⚡', title: 'Performance Engineer', desc: 'Load testing, profiling, bottleneck analysis' },
      { role: AgentRole.SECURITY_ENGINEER, icon: '🔒', title: 'Security Engineer', desc: 'Security audit, vulnerability assessment' },
      { role: AgentRole.COMPLIANCE_OFFICER, icon: '📜', title: 'Compliance Officer', desc: 'GDPR, HIPAA, SOC2, PCI-DSS, privacy assessments' },
      { role: AgentRole.ACCESSIBILITY_SPECIALIST, icon: '♿', title: 'Accessibility Specialist', desc: 'WCAG compliance, screen reader support, a11y testing' },
      { role: AgentRole.SRE_ENGINEER, icon: '🔥', title: 'SRE Engineer', desc: 'Reliability, incident response, chaos engineering, capacity planning' },
      { role: AgentRole.DEVOPS_ENGINEER, icon: '🚀', title: 'DevOps Engineer', desc: 'CI/CD, deployment, infrastructure' },
      { role: AgentRole.DOCUMENTATION_WRITER, icon: '📚', title: 'Documentation Writer', desc: 'API docs, guides, changelogs' },
    ];

    for (const agent of agents) {
      console.log(`  ${agent.icon} ${chalk.bold(agent.title)}`);
      console.log(`     ${chalk.gray(agent.desc)}`);
    }

    console.log(chalk.gray('\n  Team hierarchy:'));
    console.log(chalk.gray('  Product Manager → Business Analyst'));
    console.log(chalk.gray('  Product Manager → Engineering Manager → Developers'));
    console.log(chalk.gray('  Product Manager → UI/UX Designer'));
    console.log(chalk.gray('  Engineering Manager → Solutions Architect, System Architect'));
    console.log(chalk.gray('  Engineering Manager → Database Engineer'));
    console.log(chalk.gray('  Engineering Manager → Code Reviewer, QA, Performance Engineer'));
    console.log(chalk.gray('  Engineering Manager → Security Engineer, Compliance Officer, Accessibility Specialist'));
    console.log(chalk.gray('  Engineering Manager → SRE Engineer, DevOps Engineer, Docs\n'));
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
    const markdown = analyzer.generateMarkdown(analysis);
    const analysisPath = path.join(projectPath, '.cdm', 'project-analysis.md');
    analyzer.saveAnalysis(analysisPath, markdown);
    console.log(chalk.green(`✅ Generated .cdm/project-analysis.md (${analysis.modules.length} modules, ${analysis.overview.totalLines.toLocaleString()} lines)`));

    console.log(chalk.gray('  Profiling code style...'));
    const profiler = new CodeStyleProfiler(projectPath);
    const codeStyleProfile = await profiler.profile();
    const profileMd = profiler.generateMarkdown(codeStyleProfile);
    const profilePath = path.join(projectPath, '.cdm', 'codestyle-profile.md');
    profiler.saveProfile(profilePath, profileMd);
    console.log(chalk.green(`✅ Generated .cdm/codestyle-profile.md (${codeStyleProfile.architecture.pattern})`));

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
  .description('Resume a failed or paused feature pipeline from its last stage')
  .argument('[feature-id]', 'Feature ID to resume (uses most recent if omitted)')
  .option('--skip <stages>', 'Comma-separated stages to skip', '')
  .option('--max-retries <n>', 'Maximum retries per stage', '2')
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
    console.log(chalk.white(`Stage:   ${feature.currentStage}\n`));

    const nextStage = findResumeStage(feature.currentStage, feature);
    if (!nextStage) {
      console.log(chalk.yellow('This feature has already completed all stages.'));
      return;
    }

    console.log(chalk.white(`Resuming from: ${chalk.bold(formatStageName(nextStage))}\n`));

    const skipStages = opts.skip
      ? opts.skip.split(',').map((s: string) => s.trim() as PipelineStage)
      : [];

    const pipelineOptions: PipelineOptions = {
      skipStages,
      maxRetries: parseInt(opts.maxRetries, 10),
      dryRun: false,
      interactive: true,
      startFromStage: nextStage,
      onStageStart: (stage) => {
        const icon = getStageIcon(stage);
        spinner.start(chalk.cyan(`${icon} ${formatStageName(stage)}...`));
      },
      onStageComplete: (stage, result) => {
        const icon = getStageIcon(stage);
        if (result.status === 'approved') {
          spinner.succeed(chalk.green(`${icon} ${formatStageName(stage)} — ${result.artifacts.length} artifacts, ${result.issues.length} issues`));
        } else if (result.status === 'skipped') {
          spinner.info(chalk.yellow(`${icon} ${formatStageName(stage)} — Skipped`));
        } else {
          spinner.fail(chalk.red(`${icon} ${formatStageName(stage)} — ${result.status}`));
        }
      },
      onAgentWork: (role, task) => {
        spinner.text = chalk.cyan(`  ${getAgentIcon(role)} ${formatAgentName(role)}: ${task.title}`);
      },
      onError: (stage, error) => {
        spinner.fail(chalk.red(`Error in ${stage}: ${error.message}`));
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
      console.log(chalk.white(`  Stage:    ${feature.currentStage}`));
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

      const stageResults = Array.from(feature.stageResults.entries());
      if (stageResults.length > 0) {
        console.log(chalk.bold('\n  Stage History:'));
        for (const [stage, result] of stageResults) {
          const statusIcon = result.status === 'approved' ? chalk.green('✓') :
            result.status === 'failed' ? chalk.red('✗') : chalk.yellow('~');
          console.log(`    ${statusIcon} ${formatStageName(stage)} — ${result.status} (${result.artifacts.length} artifacts, ${result.issues.length} issues)`);
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
    console.log(`  Skip stages:    ${config.pipeline.skipStages.join(', ') || 'none'}`);

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
  .description('Analyze the target project and generate a structured analysis file for agents')
  .option('--project <path>', 'Project path to analyze', process.cwd())
  .option('-o, --output <path>', 'Output path for analysis file (default: .cdm/project-analysis.md)')
  .option('--json', 'Also output raw JSON analysis', false)
  .action(async (opts: any) => {
    const projectPath = opts.project;
    guardSelfInit(projectPath);
    const outputPath = opts.output ?? path.join(projectPath, '.cdm', 'project-analysis.md');

    const spinner = ora();
    spinner.start(chalk.cyan('Analyzing project...'));

    try {
      const analyzer = new ProjectAnalyzer(projectPath);
      const analysis = await analyzer.analyze();
      const markdown = analyzer.generateMarkdown(analysis);

      analyzer.saveAnalysis(outputPath, markdown);
      spinner.succeed(chalk.green(`Analysis complete`));

      if (opts.json) {
        const jsonPath = outputPath.replace(/\.md$/, '.json');
        fs.writeFileSync(jsonPath, JSON.stringify(analysis, null, 2), 'utf-8');
        console.log(chalk.green(`  JSON:     ${jsonPath}`));
      }

      console.log(chalk.green(`  Output:   ${outputPath}`));
      console.log(chalk.white(`  Modules:  ${analysis.modules.length}`));
      console.log(chalk.white(`  Files:    ${analysis.overview.totalSourceFiles} source, ${analysis.overview.totalTestFiles} test`));
      console.log(chalk.white(`  Lines:    ${analysis.overview.totalLines.toLocaleString()}`));
      console.log(chalk.white(`  Deps:     ${analysis.dependencyGraph.length} internal edges, ${analysis.externalDeps.length} external`));

      spinner.start(chalk.cyan('Profiling code style...'));
      const profiler = new CodeStyleProfiler(projectPath);
      const styleProfile = await profiler.profile();
      const profileMd = profiler.generateMarkdown(styleProfile);
      const profilePath = path.join(projectPath, '.cdm', 'codestyle-profile.md');
      profiler.saveProfile(profilePath, profileMd);
      spinner.succeed(chalk.green(`Code style profile generated`));

      console.log(chalk.green(`  Profile:  ${profilePath}`));
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
    console.log(`  Stages run:   ${summary.totalStagesExecuted}`);
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
  .description('Show the pipeline configuration')
  .action(() => {
    console.log(chalk.bold.cyan('\n🔄 Development Pipeline\n'));
    printPipelinePlan([]);
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

function getStageIcon(stage: PipelineStage): string {
  const icons: Record<string, string> = {
    [PipelineStage.REQUIREMENTS_GATHERING]: '📋',
    [PipelineStage.ARCHITECTURE_DESIGN]: '🏗️',
    [PipelineStage.UI_UX_DESIGN]: '🎨',
    [PipelineStage.TASK_BREAKDOWN]: '📝',
    [PipelineStage.IMPLEMENTATION]: '💻',
    [PipelineStage.CODE_REVIEW]: '🔍',
    [PipelineStage.TESTING]: '🧪',
    [PipelineStage.SECURITY_REVIEW]: '🔒',
    [PipelineStage.DOCUMENTATION]: '📚',
    [PipelineStage.DEPLOYMENT]: '🚀',
    [PipelineStage.COMPLETED]: '✅',
  };
  return icons[stage] ?? '▶️';
}

function getAgentIcon(role: AgentRole): string {
  const icons: Record<string, string> = {
    [AgentRole.PRODUCT_MANAGER]: '📋',
    [AgentRole.ENGINEERING_MANAGER]: '👔',
    [AgentRole.SYSTEM_ARCHITECT]: '🏗️',
    [AgentRole.UI_DESIGNER]: '🎨',
    [AgentRole.SENIOR_DEVELOPER]: '💻',
    [AgentRole.JUNIOR_DEVELOPER]: '🔧',
    [AgentRole.CODE_REVIEWER]: '🔍',
    [AgentRole.QA_ENGINEER]: '🧪',
    [AgentRole.SECURITY_ENGINEER]: '🔒',
    [AgentRole.DEVOPS_ENGINEER]: '🚀',
    [AgentRole.DOCUMENTATION_WRITER]: '📚',
  };
  return icons[role] ?? '🤖';
}

function formatStageName(stage: PipelineStage): string {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAgentName(role: AgentRole): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function printPipelinePlan(skipStages: PipelineStage[]): void {
  const stages = [
    { stage: PipelineStage.REQUIREMENTS_GATHERING, icon: '📋', agent: 'Product Manager' },
    { stage: PipelineStage.ARCHITECTURE_DESIGN, icon: '🏗️', agent: 'System Architect' },
    { stage: PipelineStage.UI_UX_DESIGN, icon: '🎨', agent: 'UI/UX Designer' },
    { stage: PipelineStage.TASK_BREAKDOWN, icon: '📝', agent: 'Engineering Manager' },
    { stage: PipelineStage.IMPLEMENTATION, icon: '💻', agent: 'Senior + Junior Developer' },
    { stage: PipelineStage.CODE_REVIEW, icon: '🔍', agent: 'Code Reviewer' },
    { stage: PipelineStage.TESTING, icon: '🧪', agent: 'QA Engineer' },
    { stage: PipelineStage.SECURITY_REVIEW, icon: '🔒', agent: 'Security Engineer' },
    { stage: PipelineStage.DOCUMENTATION, icon: '📚', agent: 'Documentation Writer' },
    { stage: PipelineStage.DEPLOYMENT, icon: '🚀', agent: 'DevOps Engineer' },
  ];

  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const skipped = skipStages.includes(s.stage);
    const num = `${i + 1}.`.padEnd(4);
    const name = formatStageName(s.stage);

    if (skipped) {
      console.log(chalk.gray(`  ${num}${s.icon} ${name} — ${s.agent} [SKIP]`));
    } else {
      console.log(chalk.white(`  ${num}${s.icon} ${name} — ${chalk.bold(s.agent)}`));
    }

    if (i < stages.length - 1) {
      console.log(chalk.gray('      │'));
    }
  }
  console.log();
}

function findResumeStage(
  currentStage: PipelineStage,
  feature: { stageResults: Map<PipelineStage, any> },
): PipelineStage | null {
  const stages = [
    PipelineStage.REQUIREMENTS_GATHERING,
    PipelineStage.ARCHITECTURE_DESIGN,
    PipelineStage.UI_UX_DESIGN,
    PipelineStage.TASK_BREAKDOWN,
    PipelineStage.IMPLEMENTATION,
    PipelineStage.CODE_REVIEW,
    PipelineStage.TESTING,
    PipelineStage.SECURITY_REVIEW,
    PipelineStage.DOCUMENTATION,
    PipelineStage.DEPLOYMENT,
  ];

  const lastResult = feature.stageResults.get(currentStage);
  if (lastResult && (lastResult.status === 'failed' || lastResult.status === 'revision_needed')) {
    return currentStage;
  }

  const idx = stages.indexOf(currentStage);
  if (idx >= 0 && idx < stages.length - 1) {
    return stages[idx + 1];
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
    if (result.stagesFailed.length > 0) {
      console.log(chalk.gray(`  Tip: Run \`cdm resume\` to retry from the failed stage.\n`));
    }
  }

  console.log(chalk.bold('Summary:'));
  console.log(`  Execution mode:   ${chalk.cyan(result.executionMode)}`);
  console.log(`  Context optimized: ${result.contextOptimized ? chalk.green('yes (role-aware filtering)') : chalk.gray('no (run cdm analyze first)')}`);
  console.log(`  Stages completed: ${chalk.green(String(result.stagesCompleted.length))}`);
  console.log(`  Stages failed:    ${chalk.red(String(result.stagesFailed.length))}`);
  console.log(`  Stages skipped:   ${chalk.yellow(String(result.stagesSkipped.length))}`);
  console.log(`  Artifacts:        ${chalk.cyan(String(result.artifacts.length))}`);
  console.log(`  Issues:           ${chalk.yellow(String(result.issues.length))}`);
  console.log(`  Tokens used:      ${result.totalTokensUsed.toLocaleString()}`);
  console.log(`  Duration:         ${(result.totalDurationMs / 1000).toFixed(1)}s`);

  if (result.issues.length > 0) {
    console.log(chalk.bold('\nIssues:'));
    const bySeverity = result.issues.reduce((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    for (const [sev, count] of Object.entries(bySeverity)) {
      const color = sev === 'critical' ? chalk.red : sev === 'high' ? chalk.yellow : chalk.gray;
      console.log(`  ${color(`${sev}: ${count}`)}`);
    }
  }

  if (result.stagesFailed.length > 0) {
    console.log(chalk.bold.red('\nFailed Stages:'));
    for (const stage of result.stagesFailed) {
      console.log(`  ${chalk.red('✗')} ${formatStageName(stage)}`);
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
