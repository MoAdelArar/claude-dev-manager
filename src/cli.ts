#!/usr/bin/env node

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
import { addFileTransport, pipelineLog } from './utils/logger';
import { ArtifactStore } from './workspace/artifact-store';
import { ProjectContext } from './orchestrator/context';
import { PipelineOrchestrator, PipelineOptions, PipelineResult } from './orchestrator/pipeline';
import { ClaudeCodeBridge, ExecutionMode } from './orchestrator/claude-code-bridge';
import { ProjectAnalyzer } from './analyzer/project-analyzer';

const VERSION = '1.0.0';

const program = new Command();

program
  .name('cdm')
  .description('Claude Dev Manager — Multi-agent development management system powered by Claude Code')
  .version(VERSION);

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

    const analysisPath = require('path').join(projectPath, '.cdm', 'project-analysis.md');
    if (!require('fs').existsSync(analysisPath)) {
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
      { role: AgentRole.ENGINEERING_MANAGER, icon: '👔', title: 'Engineering Manager', desc: 'Task breakdown, sprint planning, coordination' },
      { role: AgentRole.SYSTEM_ARCHITECT, icon: '🏗️', title: 'System Architect', desc: 'Architecture, API design, data modeling' },
      { role: AgentRole.UI_DESIGNER, icon: '🎨', title: 'UI/UX Designer', desc: 'Interface design, wireframes, components' },
      { role: AgentRole.SENIOR_DEVELOPER, icon: '💻', title: 'Senior Developer', desc: 'Complex features, core code, architecture implementation' },
      { role: AgentRole.JUNIOR_DEVELOPER, icon: '🔧', title: 'Junior Developer', desc: 'Simpler features, utilities, unit tests' },
      { role: AgentRole.CODE_REVIEWER, icon: '🔍', title: 'Code Reviewer', desc: 'Code quality, best practices, standards' },
      { role: AgentRole.QA_ENGINEER, icon: '🧪', title: 'QA Engineer', desc: 'Test plans, all test levels, quality assurance' },
      { role: AgentRole.SECURITY_ENGINEER, icon: '🔒', title: 'Security Engineer', desc: 'Security audit, vulnerability assessment' },
      { role: AgentRole.DEVOPS_ENGINEER, icon: '🚀', title: 'DevOps Engineer', desc: 'CI/CD, deployment, infrastructure' },
      { role: AgentRole.DOCUMENTATION_WRITER, icon: '📚', title: 'Documentation Writer', desc: 'API docs, guides, changelogs' },
    ];

    for (const agent of agents) {
      console.log(`  ${agent.icon} ${chalk.bold(agent.title)}`);
      console.log(`     ${chalk.gray(agent.desc)}`);
    }

    console.log(chalk.gray('\n  Team hierarchy:'));
    console.log(chalk.gray('  Product Manager → Engineering Manager → Developers'));
    console.log(chalk.gray('  Product Manager → UI/UX Designer'));
    console.log(chalk.gray('  Engineering Manager → Code Reviewer, QA, Security, DevOps, Docs\n'));
  });

// ─── cdm init ────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize CDM in the current project')
  .option('--project <path>', 'Project path', process.cwd())
  .action(async (opts: any) => {
    const projectPath = opts.project;
    console.log(chalk.bold.cyan('\n🔧 Initializing Claude Dev Manager\n'));

    const config = getDefaultConfig();
    const context = new ProjectContext(projectPath);
    const project = context.getProject();

    console.log(chalk.white(`Project: ${chalk.bold(project.name)}`));
    console.log(chalk.white(`Detected language: ${project.config.language}`));
    console.log(chalk.white(`Detected framework: ${project.config.framework}\n`));

    saveConfig(projectPath, config);
    console.log(chalk.green('✅ Created cdm.config.yaml'));

    const artifactStore = new ArtifactStore(projectPath);
    const agentRegistry = new (require('./agents/index').AgentRegistry)(artifactStore);
    const bridge = new ClaudeCodeBridge(agentRegistry, artifactStore, { projectPath });

    bridge.writeAgentInstructionFiles();
    console.log(chalk.green('✅ Generated agent instruction files in agents/'));

    const claudeMd = bridge.generateMainClaudeMd();
    const claudeMdPath = require('path').join(projectPath, 'CLAUDE.md');
    require('fs').writeFileSync(claudeMdPath, claudeMd, 'utf-8');
    console.log(chalk.green('✅ Generated CLAUDE.md'));

    console.log(chalk.gray('\n  Running project analysis...'));
    const analyzer = new ProjectAnalyzer(projectPath);
    const analysis = await analyzer.analyze();
    const markdown = analyzer.generateMarkdown(analysis);
    const analysisPath = require('path').join(projectPath, '.cdm', 'project-analysis.md');
    analyzer.saveAnalysis(analysisPath, markdown);
    console.log(chalk.green(`✅ Generated project analysis (${analysis.modules.length} modules, ${analysis.overview.totalLines.toLocaleString()} lines)`));

    console.log(chalk.bold.green('\n🎉 CDM initialized! Run `cdm start "your feature"` to begin.\n'));
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
    const outputPath = opts.output ?? require('path').join(projectPath, '.cdm', 'project-analysis.md');

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
        require('fs').writeFileSync(jsonPath, JSON.stringify(analysis, null, 2), 'utf-8');
        console.log(chalk.green(`  JSON:     ${jsonPath}`));
      }

      console.log(chalk.green(`  Output:   ${outputPath}`));
      console.log(chalk.white(`  Modules:  ${analysis.modules.length}`));
      console.log(chalk.white(`  Files:    ${analysis.overview.totalSourceFiles} source, ${analysis.overview.totalTestFiles} test`));
      console.log(chalk.white(`  Lines:    ${analysis.overview.totalLines.toLocaleString()}`));
      console.log(chalk.white(`  Deps:     ${analysis.dependencyGraph.length} internal edges, ${analysis.externalDeps.length} external`));
      console.log(chalk.gray(`\n  Agents will use this file as context instead of scanning the full codebase.\n`));
    } catch (error) {
      spinner.fail(chalk.red('Analysis failed'));
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
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
