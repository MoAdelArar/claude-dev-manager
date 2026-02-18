#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';

const server = new McpServer({
  name: 'claude-dev-manager',
  version: '1.0.0',
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJsonFiles(dirPath: string): any[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf-8')));
}

function readFileIfExists(filePath: string): string | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
}

function runCli(args: string, projectPath: string): string {
  const { execSync } = require('node:child_process');
  const cliPath = path.join(__dirname, 'cli.js');
  return execSync(`node "${cliPath}" ${args} --project "${projectPath}"`, {
    stdio: 'pipe',
    timeout: 300_000,
    cwd: projectPath,
    env: { ...process.env, FORCE_COLOR: '0', NODE_ENV: 'production' },
  }).toString();
}

type ToolResult = { content: { type: 'text'; text: string }[] };
function text(t: string): ToolResult {
  return { content: [{ type: 'text', text: t }] };
}

const tool = server.tool.bind(server) as (
  name: string,
  description: string,
  schema: Record<string, any>,
  handler: (params: any) => Promise<ToolResult>,
) => void;

// ═══════════════════════════════════════════════════════════════════════════
// MCP Tools — full parity with CDM CLI (17 tools)
// ═══════════════════════════════════════════════════════════════════════════

tool(
  'cdm_init',
  'Initialize Claude Dev Manager in a project. Creates config, agent instruction files, CLAUDE.md, project analysis, and code style profile.',
  { projectPath: z.string() },
  async ({ projectPath }) => text(runCli('init', projectPath)),
);

tool(
  'cdm_analyze',
  'Analyze the project codebase. Generates structural analysis (.cdm/project-analysis.md) and code style profile (.cdm/codestyle-profile.md).',
  {
    projectPath: z.string(),
    outputPath: z.string().optional(),
    json: z.boolean().optional(),
  },
  async ({ projectPath, outputPath, json }) => {
    let args = 'analyze';
    if (outputPath) args += ` -o "${outputPath}"`;
    if (json) args += ' --json';
    const output = runCli(args, projectPath);
    const analysis = readFileIfExists(path.join(projectPath, '.cdm', 'project-analysis.md'));
    return text(analysis ? `${output}\n---\n${analysis}` : output);
  },
);

tool(
  'cdm_start_pipeline',
  'Start the full development pipeline for a new feature. Runs 10 stages with 18 agents.',
  {
    projectPath: z.string(),
    featureDescription: z.string(),
    priority: z.string().optional(),
    skipStages: z.string().optional(),
    mode: z.string().optional(),
    model: z.string().optional(),
    maxRetries: z.number().optional(),
    dryRun: z.boolean().optional(),
  },
  async ({ projectPath, featureDescription, priority, skipStages, mode, model, maxRetries, dryRun }) => {
    let args = `start "${featureDescription}" --priority ${priority ?? 'medium'} --mode ${mode ?? 'claude-cli'} --no-interactive`;
    if (skipStages) args += ` --skip ${skipStages}`;
    if (model) args += ` --model ${model}`;
    if (maxRetries) args += ` --max-retries ${maxRetries}`;
    if (dryRun) args += ' --dry-run';
    return text(runCli(args, projectPath));
  },
);

tool(
  'cdm_resume_pipeline',
  'Resume a failed or paused pipeline from its last incomplete stage.',
  {
    projectPath: z.string(),
    featureId: z.string().optional(),
    mode: z.string().optional(),
    model: z.string().optional(),
    skipStages: z.string().optional(),
    maxRetries: z.number().optional(),
  },
  async ({ projectPath, featureId, mode, model, skipStages, maxRetries }) => {
    const id = featureId ? `${featureId} ` : '';
    let args = `resume ${id}--mode ${mode ?? 'claude-cli'}`;
    if (model) args += ` --model ${model}`;
    if (skipStages) args += ` --skip ${skipStages}`;
    if (maxRetries) args += ` --max-retries ${maxRetries}`;
    return text(runCli(args, projectPath));
  },
);

tool(
  'cdm_get_status',
  'Get the status of all features and their pipeline progress.',
  { projectPath: z.string() },
  async ({ projectPath }) => {
    const features = readJsonFiles(path.join(projectPath, '.cdm', 'features'));
    if (features.length === 0) return text('No features found. Run cdm_init and cdm_start_pipeline first.');

    const summary = features.map((f: any) => {
      const stages = f.stageResults ? Object.keys(f.stageResults) : [];
      return `## ${f.name}\n- **ID:** ${f.id}\n- **Status:** ${f.status}\n- **Stage:** ${f.currentStage}\n- **Priority:** ${f.priority}\n- **Artifacts:** ${f.artifacts?.length ?? 0}\n- **Issues:** ${f.issues?.length ?? 0}\n- **Stages completed:** ${stages.join(', ') || 'none'}`;
    }).join('\n\n');

    return text(`# Feature Status\n\n${summary}`);
  },
);

tool(
  'cdm_list_artifacts',
  'List all artifacts produced during development, optionally filtered by type.',
  { projectPath: z.string(), type: z.string().optional() },
  async ({ projectPath, type }) => {
    let artifacts = readJsonFiles(path.join(projectPath, '.cdm', 'artifacts'));
    if (artifacts.length === 0) return text('No artifacts found.');
    if (type) {
      artifacts = artifacts.filter((a: any) => a.type === type);
      if (artifacts.length === 0) return text(`No artifacts found with type "${type}".`);
    }
    const byType: Record<string, number> = {};
    for (const a of artifacts) byType[a.type] = (byType[a.type] ?? 0) + 1;
    const typeSummary = Object.entries(byType).map(([t, c]) => `  - ${t}: ${c}`).join('\n');
    const listing = artifacts.map((a: any) => `- **${a.name}** (${a.type}) [${a.status}]`).join('\n');
    return text(`# Artifacts (${artifacts.length})\n\n## By Type\n${typeSummary}\n\n## All\n${listing}`);
  },
);

tool(
  'cdm_show_artifact',
  'Show the full content of a specific artifact by ID or name.',
  { projectPath: z.string(), target: z.string() },
  async ({ projectPath, target }) => {
    const artifacts = readJsonFiles(path.join(projectPath, '.cdm', 'artifacts'));
    const lower = target.toLowerCase();
    const match = artifacts.find((a: any) => a.id === target || a.name?.toLowerCase().includes(lower));
    if (!match) return text(`No artifact found matching "${target}".`);
    return text(`# ${match.name}\n- **Type:** ${match.type}\n- **Status:** ${match.status}\n- **Created by:** ${match.createdBy}\n- **Version:** ${match.version}\n---\n\n${match.content}`);
  },
);

tool(
  'cdm_show_feature',
  'Show the full details of a specific feature by ID, including stage history, artifacts, and issues.',
  { projectPath: z.string(), featureId: z.string() },
  async ({ projectPath, featureId }) => {
    const features = readJsonFiles(path.join(projectPath, '.cdm', 'features'));
    const match = features.find((f: any) => f.id === featureId || f.name?.toLowerCase().includes(featureId.toLowerCase()));
    if (!match) return text(`No feature found matching "${featureId}".`);
    const lines = [`# Feature: ${match.name}`, `- **ID:** ${match.id}`, `- **Status:** ${match.status}`, `- **Stage:** ${match.currentStage}`, `- **Priority:** ${match.priority}`, `- **Created:** ${match.createdAt}`];
    if (match.artifacts?.length > 0) { lines.push('\n## Artifacts'); for (const a of match.artifacts) lines.push(`- ${a.name} (${a.type}) [${a.status}]`); }
    if (match.issues?.length > 0) { lines.push('\n## Issues'); for (const i of match.issues) lines.push(`- [${i.severity}] ${i.title}`); }
    if (match.stageResults) { lines.push('\n## Stage History'); for (const [stage, result] of Object.entries(match.stageResults as Record<string, any>)) lines.push(`- [${result.status === 'approved' ? 'OK' : result.status === 'failed' ? 'FAIL' : '~'}] ${stage} — ${result.status}`); }
    return text(lines.join('\n'));
  },
);

tool(
  'cdm_list_agents',
  'List all 18 CDM agents and their roles in the development pipeline.',
  {},
  async () => {
    const agents = [
      ['Product Manager', 'Requirements', 'Specs, user stories, acceptance criteria'],
      ['Business Analyst', 'Requirements (support)', 'ROI analysis, business cases, KPIs'],
      ['Engineering Manager', 'Task Breakdown', 'Task lists, sprint plans, estimation'],
      ['Solutions Architect', 'Architecture (support)', 'Technology decisions, integration, migration'],
      ['System Architect', 'Architecture', 'System architecture, APIs, data models'],
      ['UI/UX Designer', 'UI/UX Design', 'Interface specs, wireframes, components'],
      ['Senior Developer', 'Implementation', 'Core features, complex architecture'],
      ['Junior Developer', 'Implementation (support)', 'Utilities, simpler features, unit tests'],
      ['Database Engineer', 'Architecture + Implementation', 'Schema design, migrations, query optimization'],
      ['Code Reviewer', 'Code Review', 'Code quality, patterns, best practices'],
      ['QA Engineer', 'Testing', 'Test plans, unit/integration/e2e tests'],
      ['Performance Engineer', 'Testing (support)', 'Load testing, profiling, bottleneck analysis'],
      ['Security Engineer', 'Security Review', 'Security audit, vulnerability assessment'],
      ['Compliance Officer', 'Security (support)', 'GDPR, HIPAA, SOC2, PCI-DSS, privacy'],
      ['Accessibility Specialist', 'UI/UX + Testing', 'WCAG compliance, a11y testing'],
      ['SRE Engineer', 'Deployment (support)', 'Reliability, incident response, chaos eng'],
      ['DevOps Engineer', 'Deployment & NFR', 'CI/CD, infra, monitoring, scaling, DR'],
      ['Documentation Writer', 'Documentation', 'API docs, developer guides, changelogs'],
    ];
    const rows = agents.map(([r, s, d]) => `| ${r} | ${s} | ${d} |`).join('\n');
    return text(`# CDM Agents (18)\n\n| Agent | Stage | Responsibilities |\n|---|---|---|\n${rows}`);
  },
);

tool('cdm_get_config', 'Get the current CDM configuration for a project.',
  { projectPath: z.string() },
  async ({ projectPath }) => {
    for (const name of ['cdm.config.yaml', 'cdm.config.yml', 'cdm.config.json']) {
      const content = readFileIfExists(path.join(projectPath, name));
      if (content) return text(`# CDM Config (${name})\n\n\`\`\`yaml\n${content}\`\`\``);
    }
    return text('No CDM config found. Run cdm_init first.');
  },
);

tool('cdm_set_config', 'Update a CDM configuration value (e.g. pipeline.maxRetries=3).',
  { projectPath: z.string(), key: z.string(), value: z.string() },
  async ({ projectPath, key, value }) => text(runCli(`config --set ${key}=${value}`, projectPath)),
);

tool('cdm_reset_config', 'Reset CDM configuration to defaults.',
  { projectPath: z.string() },
  async ({ projectPath }) => text(runCli('config --reset', projectPath)),
);

tool('cdm_pipeline', 'Show the 10-stage pipeline configuration with agents.',
  {},
  async () => text(`# CDM Pipeline (10 stages, 18 agents)\n\n| # | Stage | Primary | Supporting | Skip |\n|---|---|---|---|---|\n| 1 | Requirements | Product Manager | Business Analyst | No |\n| 2 | Architecture | System Architect | Solutions Architect, DB Engineer, EM | No |\n| 3 | UI/UX Design | UI/UX Designer | Accessibility Specialist | Yes |\n| 4 | Task Breakdown | Engineering Manager | Senior Developer | No |\n| 5 | Implementation | Senior Developer | Junior Developer | No |\n| 6 | Code Review | Code Reviewer | *(reviewed by Sr Dev)* | No |\n| 7 | Testing | QA Engineer | Jr Dev, Perf Engineer, A11y | No |\n| 8 | Security | Security Engineer | Compliance Officer | Yes |\n| 9 | Documentation | Doc Writer | *(reviewed by PM)* | Yes |\n| 10 | Deployment | DevOps Engineer | SRE Engineer | Yes |`),
);

tool('cdm_get_history', 'Get the development history timeline.',
  { projectPath: z.string(), featureId: z.string().optional(), last: z.number().optional() },
  async ({ projectPath, featureId, last }) => {
    const historyMd = readFileIfExists(path.join(projectPath, '.cdm', 'history', 'development-history.md'));
    const eventsRaw = readFileIfExists(path.join(projectPath, '.cdm', 'history', 'events.json'));
    if (!eventsRaw && !historyMd) return text('No history found. Run cdm_start_pipeline first.');
    if (historyMd && !featureId && !last) return text(historyMd);
    let events: any[] = [];
    try { events = eventsRaw ? JSON.parse(eventsRaw) : []; } catch { return text('Failed to parse history.'); }
    if (featureId) events = events.filter((e: any) => e.featureId === featureId);
    if (last) events = events.slice(-last);
    if (events.length === 0) return text('No matching events found.');
    const timeline = events.map((e: any) => `- \`${new Date(e.timestamp).toLocaleTimeString()}\` **${e.type}**: ${e.message}${e.tokensUsed ? ` (${e.tokensUsed} tok)` : ''}${e.durationMs ? ` [${(e.durationMs / 1000).toFixed(1)}s]` : ''}`).join('\n');
    return text(`# History (${events.length} events)\n\n${timeline}`);
  },
);

tool('cdm_export_history', 'Export history to .cdm/history/ as markdown and JSON.',
  { projectPath: z.string() },
  async ({ projectPath }) => text(runCli('history --export', projectPath)),
);

tool('cdm_get_analysis', 'Get the project analysis — file map, exports, dependency graph, patterns.',
  { projectPath: z.string() },
  async ({ projectPath }) => text(readFileIfExists(path.join(projectPath, '.cdm', 'project-analysis.md')) ?? 'No analysis found. Run cdm_analyze first.'),
);

tool('cdm_get_codestyle', 'Get the code style profile — naming, architecture, formatting, testing conventions.',
  { projectPath: z.string() },
  async ({ projectPath }) => text(readFileIfExists(path.join(projectPath, '.cdm', 'codestyle-profile.md')) ?? 'No profile found. Run cdm_analyze first.'),
);

// ═══════════════════════════════════════════════════════════════════════════

server.resource('cdm-pipeline-stages', 'cdm://pipeline/stages', async (uri) => ({
  contents: [{ uri: uri.href, mimeType: 'text/markdown', text: '# CDM Pipeline\n\n1. Requirements → PM + BA\n2. Architecture → SA + SolArch + DBE\n3. UI/UX → Designer + A11y\n4. Tasks → EM + Sr Dev\n5. Implementation → Sr Dev + Jr Dev\n6. Code Review → Reviewer\n7. Testing → QA + Perf + A11y\n8. Security → SecEng + Compliance\n9. Docs → DocWriter\n10. Deployment → DevOps + SRE' }],
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('CDM MCP Server failed to start:', error);
  process.exit(1);
});
