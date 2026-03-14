import { AgentRole } from '../../types.js';

export function formatAgentName(role: AgentRole | string): string {
  return String(role).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getAgentIcon(role: AgentRole | string): string {
  const icons: Record<string, string> = {
    [AgentRole.PLANNER]: '📋',
    [AgentRole.ARCHITECT]: '🏗️',
    [AgentRole.DEVELOPER]: '💻',
    [AgentRole.REVIEWER]: '🔍',
    [AgentRole.OPERATOR]: '🚀',
  };
  return icons[role] ?? '🤖';
}

export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    planning: '📋',
    design: '🏗️',
    build: '💻',
    review: '🔍',
    operations: '🚀',
  };
  return icons[category] ?? '📦';
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
