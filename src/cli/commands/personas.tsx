import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import * as path from 'node:path';
import { colors } from '../utils/colors.js';
import { Spinner } from '../components/Spinner.js';
import { ErrorDisplay } from '../components/ErrorDisplay.js';
import { ProjectContext } from '../../orchestrator/context.js';
import { PersonaFetcher, PersonaCatalog, PersonaResolver, getCatalogIndexPath } from '../../personas/index.js';
import { loadConfig } from '../../utils/config.js';
import { getDivisionIcon, truncate } from '../utils/format.js';
import { EXIT_CODES } from '../types.js';

export const args = z.tuple([
  z.string().optional().describe('Subcommand: list, update, resolve, info'),
  z.string().optional().describe('Argument: persona ID for info, or description for resolve'),
]);

export const options = z.object({
  project: z.string().default(process.cwd()).describe('Project path'),
  division: z.string().optional().describe('Filter by division'),
  json: z.boolean().default(false).describe('Output as JSON'),
});

type Props = {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
};

type Phase = 'loading' | 'done' | 'error';

interface PersonaListItem {
  id: string;
  name: string;
  emoji: string;
  division: string;
  description: string;
}

interface PersonasState {
  phase: Phase;
  subcommand: string;
  personas?: PersonaListItem[];
  divisions?: string[];
  selectedPersona?: {
    id: string;
    name: string;
    emoji: string;
    division: string;
    description: string;
    vibe: string;
    tags: string[];
    content: string;
  };
  resolveResult?: {
    primary: string;
    supporting: string[];
    reviewLens: string[];
    reason: string;
  };
  updateResult?: { count: number; divisions: number };
  error?: Error;
}

export default function PersonasCommand({ args, options }: Props): React.ReactElement {
  const [subcommand = 'list', arg] = args;
  const [state, setState] = useState<PersonasState>({ phase: 'loading', subcommand });

  useEffect(() => {
    async function run(): Promise<void> {
      try {
        const projectPath = options.project;
        const config = loadConfig(projectPath);
        const catalogPath = getCatalogIndexPath(projectPath);

        if (subcommand === 'update') {
          const fetcher = new PersonaFetcher(config.personas);
          const result = await fetcher.fetchPersonas(projectPath);

          if (result.success && result.personaCount > 0) {
            const sourceDir = fetcher.getSourceDir(projectPath);
            const catalog = await PersonaCatalog.buildFromDirectory(
              sourceDir,
              config.personas.repo,
              result.commit,
            );
            catalog.persist(catalogPath);

            setState({
              phase: 'done',
              subcommand,
              updateResult: {
                count: catalog.getCount(),
                divisions: catalog.getDivisions().length,
              },
            });
          } else {
            throw new Error(result.error || 'Failed to fetch personas');
          }
          return;
        }

        const catalog = PersonaCatalog.loadFromIndex(catalogPath);

        if (!catalog || catalog.getCount() === 0) {
          throw new Error('Persona catalog is empty. Run `cdm init` or `cdm personas update` first.');
        }

        if (subcommand === 'list') {
          let personas = catalog.getAllPersonas();

          if (options.division) {
            personas = personas.filter((p) => p.division === options.division);
          }

          const items: PersonaListItem[] = personas.map((p) => ({
            id: p.id,
            name: p.frontmatter.name,
            emoji: p.frontmatter.emoji || '🤖',
            division: p.division,
            description: p.frontmatter.description,
          }));

          setState({
            phase: 'done',
            subcommand,
            personas: items,
            divisions: catalog.getDivisions(),
          });
          return;
        }

        if (subcommand === 'info') {
          if (!arg) {
            throw new Error('Please provide a persona ID: cdm personas info <persona-id>');
          }

          const persona = catalog.getById(arg);
          if (!persona) {
            throw new Error(`Persona not found: ${arg}`);
          }

          setState({
            phase: 'done',
            subcommand,
            selectedPersona: {
              id: persona.id,
              name: persona.frontmatter.name,
              emoji: persona.frontmatter.emoji || '🤖',
              division: persona.division,
              description: persona.frontmatter.description,
              vibe: persona.frontmatter.vibe,
              tags: persona.tags,
              content: persona.fullContent,
            },
          });
          return;
        }

        if (subcommand === 'resolve') {
          if (!arg) {
            throw new Error('Please provide a description: cdm personas resolve "your task description"');
          }

          const context = new ProjectContext(projectPath);
          const project = context.getProject();
          const resolver = new PersonaResolver(config.personas);
          const resolved = resolver.resolve(arg, project.config, catalog, { config: config.personas });

          setState({
            phase: 'done',
            subcommand,
            resolveResult: {
              primary: `${resolved.primary.frontmatter.emoji || '🤖'} ${resolved.primary.frontmatter.name} (${resolved.primary.id})`,
              supporting: resolved.supporting.map((p) => `${p.frontmatter.emoji || '🤖'} ${p.frontmatter.name}`),
              reviewLens: resolved.reviewLens.map((p) => `${p.frontmatter.emoji || '🔍'} ${p.frontmatter.name}`),
              reason: resolved.reason,
            },
          });
          return;
        }

        throw new Error(`Unknown subcommand: ${subcommand}. Use: list, update, resolve, info`);
      } catch (error) {
        setState({
          phase: 'error',
          subcommand,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    run();
  }, [subcommand, arg, options]);

  if (state.phase === 'error' && state.error) {
    return <ErrorDisplay error={state.error} />;
  }

  if (state.phase === 'loading') {
    const label = subcommand === 'update' ? 'Fetching personas from GitHub...' : 'Loading persona catalog...';
    return (
      <Box padding={1}>
        <Spinner label={label} />
      </Box>
    );
  }

  if (options.json) {
    const output = state.personas || state.selectedPersona || state.resolveResult || state.updateResult;
    console.log(JSON.stringify(output, null, 2));
    return <></>;
  }

  if (subcommand === 'update' && state.updateResult) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={colors.success}>✅ Personas Updated</Text>
        <Text> </Text>
        <Text>Indexed <Text bold>{state.updateResult.count}</Text> personas from <Text bold>{state.updateResult.divisions}</Text> divisions</Text>
      </Box>
    );
  }

  if (subcommand === 'info' && state.selectedPersona) {
    const p = state.selectedPersona;
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>{p.emoji} {p.name}</Text>
        <Text color={colors.muted}>ID: {p.id} | Division: {p.division}</Text>
        <Text> </Text>
        <Text>{p.description}</Text>
        {p.vibe && <Text color={colors.muted}>"{p.vibe}"</Text>}
        <Text> </Text>
        <Text bold>Tags:</Text>
        <Text>{p.tags.slice(0, 20).join(', ')}</Text>
        <Text> </Text>
        <Text bold>Full Content Preview:</Text>
        <Text color={colors.muted}>{truncate(p.content, 500)}</Text>
      </Box>
    );
  }

  if (subcommand === 'resolve' && state.resolveResult) {
    const r = state.resolveResult;
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={colors.info}>🎭 Persona Resolution</Text>
        <Text> </Text>
        <Text>Primary: <Text bold>{r.primary}</Text></Text>
        {r.supporting.length > 0 && (
          <Text>Supporting: <Text color={colors.info}>{r.supporting.join(', ')}</Text></Text>
        )}
        {r.reviewLens.length > 0 && (
          <Text>Review: <Text color={colors.warning}>{r.reviewLens.join(', ')}</Text></Text>
        )}
        <Text> </Text>
        <Text color={colors.muted}>Reason: {r.reason}</Text>
      </Box>
    );
  }

  if (subcommand === 'list' && state.personas) {
    const grouped = new Map<string, PersonaListItem[]>();

    for (const p of state.personas) {
      const list = grouped.get(p.division) || [];
      list.push(p);
      grouped.set(p.division, list);
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={colors.info}>🎭 Available Personas ({state.personas.length})</Text>
        <Text> </Text>

        {Array.from(grouped.entries()).map(([division, personas]) => (
          <Box key={division} flexDirection="column" marginBottom={1}>
            <Text bold>{getDivisionIcon(division)} {division.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} ({personas.length})</Text>
            {personas.slice(0, 10).map((p) => (
              <Text key={p.id}>
                {'  '}{p.emoji} {p.name} <Text color={colors.muted}>({p.id})</Text>
              </Text>
            ))}
            {personas.length > 10 && (
              <Text color={colors.muted}>  ... and {personas.length - 10} more</Text>
            )}
          </Box>
        ))}

        <Text> </Text>
        <Text color={colors.muted}>Use `cdm personas info {'<id>'}` for details</Text>
        <Text color={colors.muted}>Use `cdm personas resolve "description"` to preview selection</Text>
      </Box>
    );
  }

  return <></>;
}

export const description = 'Manage personas: list, update, resolve, info';
