/**
 * Context optimizer — utilities for summarizing artifacts and extracting sections.
 * Simplified for dynamic persona system.
 */

import { type Artifact } from '../types';

export function summarizeArtifact(artifact: Artifact, maxLines: number = 15): string {
  const content = artifact.content ?? '';
  const lines = content.split('\n').filter(l => l.trim().length > 0);

  if (lines.length <= maxLines) {
    return content;
  }

  const summary: string[] = [];
  summary.push(`**${artifact.name}** (${artifact.type}, v${artifact.version})`);

  const headings = lines.filter(l => l.startsWith('#'));
  if (headings.length > 0) {
    summary.push(`Sections: ${headings.map(h => h.replace(/^#+\s*/, '')).join(', ')}`);
  }

  const keyDecisions = lines.filter(l =>
    /^[-*]\s/.test(l) ||
    /^FR-|^NFR-|^US-|^AC-/.test(l) ||
    /\*\*/.test(l),
  ).slice(0, 8);

  if (keyDecisions.length > 0) {
    summary.push('Key points:');
    for (const d of keyDecisions) {
      summary.push(d.length > 120 ? d.substring(0, 117) + '...' : d);
    }
  }

  const metrics = lines.filter(l =>
    /\d+\s*(ms|rps|%|MB|GB|vCPU|DTU|seconds|minutes)/.test(l),
  ).slice(0, 4);
  if (metrics.length > 0) {
    summary.push('Metrics: ' + metrics.map(m => m.trim()).join('; '));
  }

  summary.push(`[${lines.length} lines total — use cdm show "${artifact.name}" for full content]`);

  return summary.join('\n');
}

export function summarizeArtifacts(artifacts: Artifact[]): string {
  if (artifacts.length === 0) return 'No input artifacts.';

  return artifacts.map(a => summarizeArtifact(a)).join('\n\n');
}

export function extractSections(markdown: string, sectionNames: string[]): string {
  if (!markdown || sectionNames.length === 0) return '';

  const lines = markdown.split('\n');
  const result: string[] = [];
  let capturing = false;
  let currentLevel = 0;

  const titleLine = lines.find(l => l.startsWith('# '));
  if (titleLine) result.push(titleLine, '');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const headingMatch = line.match(/^(#{2,3})\s+(.+)/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const name = headingMatch[2].trim();

      const matches = sectionNames.some(s => {
        const n = name.toLowerCase();
        const t = s.toLowerCase();
        return n === t || n.startsWith(t + ' ') || n.includes(t);
      });

      if (matches) {
        capturing = true;
        currentLevel = level;
        result.push(line);
        continue;
      }

      if (capturing && level <= currentLevel) {
        capturing = false;
      }
    }

    if (capturing) {
      result.push(line);
    }
  }

  return result.join('\n');
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }

  const truncated = content.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');

  if (lastNewline > maxChars * 0.8) {
    return truncated.slice(0, lastNewline) + '\n\n... (truncated)';
  }

  return truncated + '\n\n... (truncated)';
}

export function formatArtifactContext(artifacts: Artifact[], maxTotalChars: number = 8000): string {
  if (artifacts.length === 0) return '';

  const totalChars = artifacts.reduce((sum, a) => sum + (a.content?.length ?? 0), 0);

  if (totalChars < maxTotalChars) {
    return artifacts.map(a => `### ${a.name}\n\`\`\`\n${a.content}\n\`\`\``).join('\n\n');
  }

  return summarizeArtifacts(artifacts);
}
