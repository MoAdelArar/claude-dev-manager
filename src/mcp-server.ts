#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const server = new McpServer({
  name: 'claude-dev-manager',
  version: '3.0.0',
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
// MCP Tools — Dynamic Persona System
// ═══════════════════════════════════════════════════════════════════════════

tool(
  'cdm_init',
  'Initialize Claude Dev Manager in a project. Creates config, fetches personas, generates CLAUDE.md and project analysis.',
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
  'cdm_start',
  'Start development for a new feature. Dynamically selects personas based on task description and project context.',
  {
    projectPath: z.string(),
    featureDescription: z.string(),
    priority: z.string().optional().describe('Priority: low, medium, high, critical'),
    persona: z.string().optional().describe('Force a specific primary persona ID'),
    review: z.boolean().optional().describe('Force a review pass'),
    mode: z.string().optional().describe('Execution mode: claude-cli or simulation'),
    model: z.string().optional(),
    dryRun: z.boolean().optional().describe('Show persona selection without executing'),
  },
  async ({ projectPath, featureDescription, priority, persona, review, mode, model, dryRun }) => {
    let args = `start "${featureDescription}" --priority ${priority ?? 'medium'} --mode ${mode ?? 'claude-cli'} --no-interactive`;
    if (persona) args += ` --persona ${persona}`;
    if (review) args += ' --review';
    if (model) args += ` --model ${model}`;
    if (dryRun) args += ' --dry-run';
    return text(runCli(args, projectPath));
  },
);

tool(
  'cdm_resume',
  'Resume a failed or incomplete feature by re-running it.',
  {
    projectPath: z.string(),
    featureId: z.string().optional(),
    review: z.boolean().optional().describe('Force a review pass'),
    mode: z.string().optional(),
    model: z.string().optional(),
  },
  async ({ projectPath, featureId, review, mode, model }) => {
    const id = featureId ? `${featureId} ` : '';
    let args = `resume ${id}--mode ${mode ?? 'claude-cli'}`;
    if (review) args += ' --review';
    if (model) args += ` --model ${model}`;
    return text(runCli(args, projectPath));
  },
);

tool(
  'cdm_list_personas',
  'List all available personas from the catalog, optionally filtered by division.',
  { 
    projectPath: z.string(),
    division: z.string().optional().describe('Filter by division: engineering, design, testing, etc.'),
  },
  async ({ projectPath, division }) => {
    const catalogPath = path.join(projectPath, '.cdm', 'personas', 'catalog-index.json');
    const catalog = readFileIfExists(catalogPath);
    if (!catalog) return text('No persona catalog found. Run cdm_init first.');

    let data;
    try { data = JSON.parse(catalog); } catch { return text('Failed to parse catalog.'); }

    let personas = data.personas || [];
    if (division) {
      personas = personas.filter((p: any) => p.division === division);
    }

    if (personas.length === 0) {
      return text(division ? `No personas found in division "${division}".` : 'No personas found.');
    }

    const grouped: Record<string, any[]> = {};
    for (const p of personas) {
      if (!grouped[p.division]) grouped[p.division] = [];
      grouped[p.division].push(p);
    }

    let output = `# Personas (${personas.length})\n\n`;
    for (const [div, list] of Object.entries(grouped)) {
      output += `## ${div} (${list.length})\n`;
      for (const p of list.slice(0, 15)) {
        output += `- ${p.frontmatter?.emoji || '🤖'} **${p.frontmatter?.name || p.id}** (${p.id})\n`;
      }
      if (list.length > 15) output += `  ... and ${list.length - 15} more\n`;
      output += '\n';
    }

    return text(output);
  },
);

tool(
  'cdm_resolve_personas',
  'Preview which personas would be selected for a given task description (dry-run resolver).',
  {
    projectPath: z.string(),
    description: z.string().describe('The task description to resolve personas for'),
  },
  async ({ projectPath, description }) => {
    const output = runCli(`personas resolve "${description}"`, projectPath);
    return text(output);
  },
);

tool(
  'cdm_update_personas',
  'Update the persona catalog by re-fetching from the agency-agents GitHub repository.',
  { projectPath: z.string() },
  async ({ projectPath }) => {
    const output = runCli('personas update', projectPath);
    return text(output);
  },
);

tool(
  'cdm_persona_info',
  'Get full details about a specific persona by ID.',
  {
    projectPath: z.string(),
    personaId: z.string().describe('The persona ID (e.g. engineering-frontend-developer)'),
  },
  async ({ projectPath, personaId }) => {
    const output = runCli(`personas info ${personaId}`, projectPath);
    return text(output);
  },
);

tool(
  'cdm_get_status',
  'Get the status of all features.',
  { projectPath: z.string() },
  async ({ projectPath }) => {
    const features = readJsonFiles(path.join(projectPath, '.cdm', 'features'));
    if (features.length === 0) return text('No features found. Run cdm_init and cdm_start first.');

    const summary = features.map((f: any) => {
      const personas = f.personas 
        ? `Primary: ${f.personas.primary}${f.personas.supporting?.length ? `, Supporting: ${f.personas.supporting.join(', ')}` : ''}`
        : 'N/A';
      return `## ${f.name}\n- **ID:** ${f.id}\n- **Status:** ${f.status}\n- **Personas:** ${personas}\n- **Priority:** ${f.priority}\n- **Artifacts:** ${f.artifacts?.length ?? 0}\n- **Issues:** ${f.issues?.length ?? 0}`;
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
    const listing = artifacts.map((a: any) => `- **${a.name}** (${a.type}) [${a.status}] by ${a.createdBy}`).join('\n');
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
  'Show the full details of a specific feature by ID.',
  { projectPath: z.string(), featureId: z.string() },
  async ({ projectPath, featureId }) => {
    const features = readJsonFiles(path.join(projectPath, '.cdm', 'features'));
    const match = features.find((f: any) => f.id === featureId || f.name?.toLowerCase().includes(featureId.toLowerCase()));
    if (!match) return text(`No feature found matching "${featureId}".`);
    
    const lines = [
      `# Feature: ${match.name}`,
      `- **ID:** ${match.id}`,
      `- **Status:** ${match.status}`,
      `- **Priority:** ${match.priority}`,
      `- **Created:** ${match.createdAt}`,
    ];
    
    if (match.personas) {
      lines.push('\n## Personas');
      lines.push(`- **Primary:** ${match.personas.primary}`);
      if (match.personas.supporting?.length > 0) {
        lines.push(`- **Supporting:** ${match.personas.supporting.join(', ')}`);
      }
      if (match.personas.reviewLens?.length > 0) {
        lines.push(`- **Review:** ${match.personas.reviewLens.join(', ')}`);
      }
    }
    
    if (match.artifacts?.length > 0) {
      lines.push('\n## Artifacts');
      for (const a of match.artifacts) lines.push(`- ${a.name} (${a.type}) [${a.status}]`);
    }
    
    if (match.issues?.length > 0) {
      lines.push('\n## Issues');
      for (const i of match.issues) lines.push(`- [${i.severity}] ${i.title}`);
    }
    
    return text(lines.join('\n'));
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

tool('cdm_set_config', 'Update a CDM configuration value.',
  { projectPath: z.string(), key: z.string(), value: z.string() },
  async ({ projectPath, key, value }) => text(runCli(`config --set ${key}=${value}`, projectPath)),
);

tool('cdm_reset_config', 'Reset CDM configuration to defaults.',
  { projectPath: z.string() },
  async ({ projectPath }) => text(runCli('config --reset', projectPath)),
);

tool('cdm_get_history', 'Get the development history timeline.',
  { projectPath: z.string(), featureId: z.string().optional(), last: z.number().optional() },
  async ({ projectPath, featureId, last }) => {
    const historyMd = readFileIfExists(path.join(projectPath, '.cdm', 'history', 'development-history.md'));
    const eventsRaw = readFileIfExists(path.join(projectPath, '.cdm', 'history', 'events.json'));
    if (!eventsRaw && !historyMd) return text('No history found. Run cdm_start first.');
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

server.resource('cdm-personas-overview', 'cdm://personas/overview', async (uri) => ({
  contents: [{ uri: uri.href, mimeType: 'text/markdown', text: `# CDM Dynamic Persona System

CDM dynamically selects specialized AI personas from the agency-agents catalog based on:
- Task description and detected signals (frameworks, domains, actions, risks)
- Project context (language, framework, conventions)
- Configured overrides

## How It Works
1. **cdm_start** - Automatically resolves personas for your task
2. **cdm_resolve_personas** - Preview which personas would be selected
3. **cdm_list_personas** - Browse all available personas
4. **cdm_persona_info** - Get details about a specific persona

## Divisions
- **engineering** - Frontend, backend, fullstack developers
- **design** - UI/UX, product designers
- **testing** - QA, security, accessibility auditors
- **product** - Product managers, analysts
- **specialized** - Domain experts

## Example
\`\`\`
cdm_start({
  projectPath: "/path/to/project",
  featureDescription: "Build a React dashboard with authentication"
})
\`\`\`

This would automatically select:
- Primary: Engineering Frontend Developer
- Supporting: Security Engineer (due to auth)
- Review: Code Reviewer` }],
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('CDM MCP Server failed to start:', error);
  process.exit(1);
});
