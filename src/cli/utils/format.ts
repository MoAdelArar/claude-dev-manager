/**
 * Formatting utilities for CLI output.
 * Refactored for dynamic persona system.
 */

import type { AgentPersona } from '../../personas/types.js';

export function formatPersonaName(id: string, name?: string): string {
  if (name) {
    return name;
  }
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getPersonaIcon(persona: AgentPersona | { emoji?: string; frontmatter?: { emoji?: string } }): string {
  if ('frontmatter' in persona && persona.frontmatter?.emoji) {
    return persona.frontmatter.emoji;
  }
  if ('emoji' in persona && persona.emoji) {
    return persona.emoji;
  }
  return '🤖';
}

export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    engineering: '💻',
    design: '🎨',
    testing: '🧪',
    product: '📋',
    'project-management': '📊',
    support: '🛟',
    specialized: '⚡',
    planning: '📋',
    build: '🏗️',
    review: '🔍',
    operations: '🚀',
  };
  return icons[category] ?? '📦';
}

export function getDivisionIcon(division: string): string {
  return getCategoryIcon(division);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return String(tokens);
  }
  if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return `${(tokens / 1000000).toFixed(2)}M`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString();
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString();
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}

export function padEnd(str: string, length: number): string {
  if (str.length >= length) {
    return str;
  }
  return str + ' '.repeat(length - str.length);
}

export function formatPersonaList(
  personas: Array<{ id: string; name: string; emoji?: string; division: string }>,
): string {
  const grouped = new Map<string, typeof personas>();

  for (const persona of personas) {
    const list = grouped.get(persona.division) || [];
    list.push(persona);
    grouped.set(persona.division, list);
  }

  const lines: string[] = [];

  for (const [division, list] of grouped) {
    lines.push(`\n${getDivisionIcon(division)} ${formatPersonaName(division)}`);
    for (const p of list) {
      lines.push(`  ${p.emoji || '🤖'} ${p.name} (${p.id})`);
    }
  }

  return lines.join('\n');
}
