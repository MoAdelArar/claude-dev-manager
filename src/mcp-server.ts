#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const server = new McpServer({
  name: 'claude-dev-manager',
  version: '2.2.0',
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
// MCP Tools — full parity with CDM CLI
// ═══════════════════════════════════════════════════════════════════════════

tool(
  'cdm_init',
  'Initialize Claude Dev Manager in a project. Creates config, agent instruction files, CLAUDE.md, project analysis, and code style profile.',
  { projectPath: z.string() },
  async ({ projectPath }) => text(runCli('init', projectPath)),
);

tool(
  'cdm_analyze',
  'Analyze the project codebase. Generates structural analysis (.cdm/analysis/) and code style profile.',
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
    const analysis = readFileIfExists(path.join(projectPath, '.cdm', 'analysis', 'overview.md'));
    return text(analysis ? `${output}\n---\n${analysis}` : output);
  },
);

tool(
  'cdm_start_pipeline',
  'Start the development pipeline for a new feature. Uses 5 agents with composable skills and adaptive templates.',
  {
    projectPath: z.string(),
    featureDescription: z.string(),
    template: z.string().optional().describe('Pipeline template: quick-fix, feature, full-feature, review-only, design-only, deploy'),
    priority: z.string().optional(),
    skipSteps: z.string().optional().describe('Comma-separated step indices to skip'),
    mode: z.string().optional(),
    model: z.string().optional(),
    maxRetries: z.number().optional(),
    dryRun: z.boolean().optional(),
  },
  async ({ projectPath, featureDescription, template, priority, skipSteps, mode, model, maxRetries, dryRun }) => {
    let args = `start "${featureDescription}" --priority ${priority ?? 'medium'} --mode ${mode ?? 'claude-cli'} --no-interactive`;
    if (template) args += ` --template ${template}`;
    if (skipSteps) args += ` --skip-steps ${skipSteps}`;
    if (model) args += ` --model ${model}`;
    if (maxRetries) args += ` --max-retries ${maxRetries}`;
    if (dryRun) args += ' --dry-run';
    return text(runCli(args, projectPath));
  },
);

tool(
  'cdm_resume_pipeline',
  'Resume a failed or paused pipeline from its last incomplete step.',
  {
    projectPath: z.string(),
    featureId: z.string().optional(),
    mode: z.string().optional(),
    model: z.string().optional(),
    skipSteps: z.string().optional(),
    maxRetries: z.number().optional(),
  },
  async ({ projectPath, featureId, mode, model, skipSteps, maxRetries }) => {
    const id = featureId ? `${featureId} ` : '';
    let args = `resume ${id}--mode ${mode ?? 'claude-cli'}`;
    if (model) args += ` --model ${model}`;
    if (skipSteps) args += ` --skip-steps ${skipSteps}`;
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
      const steps = f.stepResults ? Object.keys(f.stepResults) : [];
      return `## ${f.name}\n- **ID:** ${f.id}\n- **Status:** ${f.status}\n- **Template:** ${f.executionPlan?.templateId ?? 'N/A'}\n- **Priority:** ${f.priority}\n- **Artifacts:** ${f.artifacts?.length ?? 0}\n- **Issues:** ${f.issues?.length ?? 0}\n- **Steps completed:** ${steps.join(', ') || 'none'}`;
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
  'Show the full details of a specific feature by ID, including step history, artifacts, and issues.',
  { projectPath: z.string(), featureId: z.string() },
  async ({ projectPath, featureId }) => {
    const features = readJsonFiles(path.join(projectPath, '.cdm', 'features'));
    const match = features.find((f: any) => f.id === featureId || f.name?.toLowerCase().includes(featureId.toLowerCase()));
    if (!match) return text(`No feature found matching "${featureId}".`);
    const lines = [`# Feature: ${match.name}`, `- **ID:** ${match.id}`, `- **Status:** ${match.status}`, `- **Template:** ${match.executionPlan?.templateId ?? 'N/A'}`, `- **Priority:** ${match.priority}`, `- **Created:** ${match.createdAt}`];
    if (match.artifacts?.length > 0) { lines.push('\n## Artifacts'); for (const a of match.artifacts) lines.push(`- ${a.name} (${a.type}) [${a.status}]`); }
    if (match.issues?.length > 0) { lines.push('\n## Issues'); for (const i of match.issues) lines.push(`- [${i.severity}] ${i.title}`); }
    if (match.stepResults) { lines.push('\n## Step History'); for (const [step, result] of Object.entries(match.stepResults as Record<string, any>)) lines.push(`- [${result.status === 'completed' ? 'OK' : result.status === 'failed' ? 'FAIL' : '~'}] Step ${step} — ${result.status}`); }
    return text(lines.join('\n'));
  },
);

tool(
  'cdm_list_agents',
  'List all 5 CDM agents and their compatible skills.',
  {},
  async () => {
    const agents = [
      ['Planner', 'requirements-analysis, task-decomposition', 'Analyzes tasks, creates execution plans'],
      ['Architect', 'system-design, api-design, data-modeling, ui-design', 'Designs systems, APIs, data models'],
      ['Developer', 'code-implementation, test-writing, documentation', 'Writes code, tests, and docs'],
      ['Reviewer', 'code-review, security-audit, performance-analysis, accessibility-audit, test-validation', 'Reviews quality, security, perf'],
      ['Operator', 'ci-cd, deployment, monitoring', 'Handles CI/CD and deployment'],
    ];
    const rows = agents.map(([r, s, d]) => `| ${r} | ${s} | ${d} |`).join('\n');
    return text(`# CDM Agents (5)\n\n| Agent | Skills | Description |\n|---|---|---|\n${rows}`);
  },
);

tool(
  'cdm_list_skills',
  'List all 16 available skills, optionally filtered by category.',
  { category: z.string().optional().describe('Filter: planning, design, build, review, operations') },
  async ({ category }) => {
    const skills = [
      { id: 'requirements-analysis', name: 'Requirements Analysis', category: 'planning' },
      { id: 'task-decomposition', name: 'Task Decomposition', category: 'planning' },
      { id: 'system-design', name: 'System Design', category: 'design' },
      { id: 'api-design', name: 'API Design', category: 'design' },
      { id: 'data-modeling', name: 'Data Modeling', category: 'design' },
      { id: 'ui-design', name: 'UI Design', category: 'design' },
      { id: 'code-implementation', name: 'Code Implementation', category: 'build' },
      { id: 'test-writing', name: 'Test Writing', category: 'build' },
      { id: 'documentation', name: 'Documentation', category: 'build' },
      { id: 'code-review', name: 'Code Review', category: 'review' },
      { id: 'security-audit', name: 'Security Audit', category: 'review' },
      { id: 'performance-analysis', name: 'Performance Analysis', category: 'review' },
      { id: 'accessibility-audit', name: 'Accessibility Audit', category: 'review' },
      { id: 'test-validation', name: 'Test Validation', category: 'review' },
      { id: 'ci-cd', name: 'CI/CD Pipeline', category: 'operations' },
      { id: 'deployment', name: 'Deployment', category: 'operations' },
      { id: 'monitoring', name: 'Monitoring', category: 'operations' },
    ];
    let filtered = skills;
    if (category) {
      filtered = skills.filter(s => s.category === category);
    }
    const rows = filtered.map(s => `| ${s.id} | ${s.name} | ${s.category} |`).join('\n');
    return text(`# Skills (${filtered.length})\n\n| ID | Name | Category |\n|---|---|---|\n${rows}`);
  },
);

tool(
  'cdm_get_skill',
  'Get details for a specific skill by ID.',
  { skillId: z.string() },
  async ({ skillId }) => {
    const skills: Record<string, { name: string; category: string; agents: string; desc: string }> = {
      'requirements-analysis': { name: 'Requirements Analysis', category: 'planning', agents: 'Planner', desc: 'Extract requirements, user stories, acceptance criteria' },
      'task-decomposition': { name: 'Task Decomposition', category: 'planning', agents: 'Planner', desc: 'Break work into ordered steps with dependencies' },
      'system-design': { name: 'System Design', category: 'design', agents: 'Architect', desc: 'Architecture, components, data flows' },
      'api-design': { name: 'API Design', category: 'design', agents: 'Architect', desc: 'REST/GraphQL/gRPC contracts' },
      'data-modeling': { name: 'Data Modeling', category: 'design', agents: 'Architect', desc: 'Schema design, migrations, indexing' },
      'ui-design': { name: 'UI Design', category: 'design', agents: 'Architect', desc: 'Interface specs, wireframes, WCAG compliance' },
      'code-implementation': { name: 'Code Implementation', category: 'build', agents: 'Developer', desc: 'Production code following conventions' },
      'test-writing': { name: 'Test Writing', category: 'build', agents: 'Developer', desc: 'Unit, integration, e2e tests' },
      'documentation': { name: 'Documentation', category: 'build', agents: 'Developer', desc: 'API docs, developer guides' },
      'code-review': { name: 'Code Review', category: 'review', agents: 'Reviewer', desc: 'Quality, patterns, best practices' },
      'security-audit': { name: 'Security Audit', category: 'review', agents: 'Reviewer', desc: 'OWASP, vulnerabilities, compliance' },
      'performance-analysis': { name: 'Performance Analysis', category: 'review', agents: 'Reviewer', desc: 'Bottlenecks, optimization' },
      'accessibility-audit': { name: 'Accessibility Audit', category: 'review', agents: 'Reviewer', desc: 'WCAG 2.1 AA compliance' },
      'test-validation': { name: 'Test Validation', category: 'review', agents: 'Reviewer', desc: 'Coverage, test quality' },
      'ci-cd': { name: 'CI/CD Pipeline', category: 'operations', agents: 'Operator', desc: 'Build automation, artifact publishing' },
      'deployment': { name: 'Deployment', category: 'operations', agents: 'Operator', desc: 'Infra config, release strategy' },
      'monitoring': { name: 'Monitoring', category: 'operations', agents: 'Operator', desc: 'Observability, alerting, runbooks' },
    };
    const skill = skills[skillId];
    if (!skill) return text(`Skill "${skillId}" not found. Run cdm_list_skills for available skills.`);
    return text(`# ${skill.name}\n\n- **ID:** ${skillId}\n- **Category:** ${skill.category}\n- **Compatible Agents:** ${skill.agents}\n- **Description:** ${skill.desc}`);
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

tool('cdm_pipeline', 'Show the 6 available pipeline templates.',
  { template: z.string().optional().describe('Show details for a specific template') },
  async ({ template }) => {
    const templates = [
      { id: 'quick-fix', steps: 2, desc: 'Developer → Reviewer. For bugs and small fixes.' },
      { id: 'feature', steps: 4, desc: 'Planner → Architect → Developer → Reviewer. Standard features.' },
      { id: 'full-feature', steps: 6, desc: 'Feature + Security + Operator. For auth, payments.' },
      { id: 'review-only', steps: 1, desc: 'Reviewer (multi-skill). For audits.' },
      { id: 'design-only', steps: 2, desc: 'Planner → Architect. Architecture spikes.' },
      { id: 'deploy', steps: 1, desc: 'Operator. Deploy existing code.' },
    ];
    if (template) {
      const t = templates.find(t => t.id === template);
      if (!t) return text(`Template "${template}" not found.`);
      return text(`# ${t.id}\n\n- **Steps:** ${t.steps}\n- **Description:** ${t.desc}`);
    }
    const rows = templates.map(t => `| ${t.id} | ${t.steps} | ${t.desc} |`).join('\n');
    return text(`# Pipeline Templates (6)\n\n| Template | Steps | Description |\n|---|---|---|\n${rows}`);
  },
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
  async ({ projectPath }) => text(readFileIfExists(path.join(projectPath, '.cdm', 'analysis', 'overview.md')) ?? 'No analysis found. Run cdm_analyze first.'),
);

tool('cdm_get_codestyle', 'Get the code style profile — naming, architecture, formatting, testing conventions.',
  { projectPath: z.string() },
  async ({ projectPath }) => text(readFileIfExists(path.join(projectPath, '.cdm', 'analysis', 'codestyle.md')) ?? 'No profile found. Run cdm_analyze first.'),
);

// ═══════════════════════════════════════════════════════════════════════════

server.resource('cdm-pipeline-templates', 'cdm://pipeline/templates', async (uri) => ({
  contents: [{ uri: uri.href, mimeType: 'text/markdown', text: '# CDM Pipeline Templates\n\n- **quick-fix**: Developer[code-implementation] → Reviewer[code-review]\n- **feature**: Planner → Architect → Developer → Reviewer\n- **full-feature**: feature + Security + Operator\n- **review-only**: Reviewer (multi-skill)\n- **design-only**: Planner → Architect\n- **deploy**: Operator' }],
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('CDM MCP Server failed to start:', error);
  process.exit(1);
});
