import { type Artifact, type AgentRole, type PipelineStage, AgentRole as Roles } from '../types';

/**
 * Context optimizer — reduces token usage by 60-80% per agent prompt.
 *
 * Three strategies:
 *   1. Artifact summarization: Extract key decisions instead of dumping full content
 *   2. Role-aware filtering: Only inject analysis/profile sections relevant to each agent
 *   3. Token budgeting: Track and report estimated token usage
 */

// ─── Role → relevant context mapping ────────────────────────────────────────

interface ContextSlice {
  analysisSection: string[];
  profileSections: string[];
  needsFullArtifacts: boolean;
}

// Section names must match headings in .cdm/analysis/overview.md:
//   ## Entry Points | ## Dependencies | ## Patterns | ## Testing | ## Module Dependencies
// Section names must match headings in .cdm/analysis/codestyle.md (partial match, case-insensitive):
//   ## Naming Conventions | ## Formatting | ## Import Style | ## TypeScript Usage |
//   ## Error Handling | ## Architecture | ## Testing Conventions | ## API Conventions | ## Code Samples

const ROLE_CONTEXT: Record<string, ContextSlice> = {
  [Roles.PRODUCT_MANAGER]:        { analysisSection: ['Entry Points'],                                                     profileSections: ['Architecture'],                                                              needsFullArtifacts: false },
  [Roles.BUSINESS_ANALYST]:       { analysisSection: ['Dependencies'],                                                     profileSections: ['Architecture'],                                                              needsFullArtifacts: false },
  [Roles.ENGINEERING_MANAGER]:    { analysisSection: ['Testing'],                                                          profileSections: ['Architecture', 'Testing Conventions'],                                       needsFullArtifacts: false },
  [Roles.SOLUTIONS_ARCHITECT]:    { analysisSection: ['Dependencies', 'Entry Points'],                                     profileSections: ['Architecture', 'API Conventions'],                                           needsFullArtifacts: false },
  [Roles.SYSTEM_ARCHITECT]:       { analysisSection: ['Dependencies', 'Entry Points', 'Patterns', 'Module Dependencies'],  profileSections: ['Architecture', 'Import Style', 'TypeScript Usage', 'API Conventions'],       needsFullArtifacts: false },
  [Roles.UI_DESIGNER]:            { analysisSection: [],                                                                   profileSections: ['Naming Conventions'],                                                        needsFullArtifacts: false },
  [Roles.SENIOR_DEVELOPER]:       { analysisSection: ['Patterns', 'Module Dependencies'],                                  profileSections: ['Naming Conventions', 'Import Style', 'Formatting', 'TypeScript Usage', 'Error Handling', 'Code Samples'], needsFullArtifacts: true },
  [Roles.JUNIOR_DEVELOPER]:       { analysisSection: ['Patterns'],                                                         profileSections: ['Naming Conventions', 'Import Style', 'Formatting', 'TypeScript Usage', 'Error Handling', 'Code Samples'], needsFullArtifacts: true },
  [Roles.DATABASE_ENGINEER]:      { analysisSection: ['Dependencies'],                                                     profileSections: ['Naming Conventions', 'TypeScript Usage'],                                    needsFullArtifacts: true },
  [Roles.CODE_REVIEWER]:          { analysisSection: ['Patterns'],                                                         profileSections: ['Naming Conventions', 'Import Style', 'Formatting', 'TypeScript Usage', 'Error Handling', 'Code Samples'], needsFullArtifacts: true },
  [Roles.QA_ENGINEER]:            { analysisSection: ['Testing'],                                                          profileSections: ['Testing Conventions', 'Naming Conventions'],                                 needsFullArtifacts: false },
  [Roles.PERFORMANCE_ENGINEER]:   { analysisSection: ['Dependencies', 'Entry Points'],                                     profileSections: ['Architecture', 'API Conventions'],                                           needsFullArtifacts: false },
  [Roles.SECURITY_ENGINEER]:      { analysisSection: ['Dependencies', 'Entry Points'],                                     profileSections: ['API Conventions', 'Import Style'],                                           needsFullArtifacts: false },
  [Roles.COMPLIANCE_OFFICER]:     { analysisSection: ['Dependencies'],                                                     profileSections: ['API Conventions'],                                                           needsFullArtifacts: false },
  [Roles.ACCESSIBILITY_SPECIALIST]:{ analysisSection: [],                                                                  profileSections: ['Naming Conventions'],                                                        needsFullArtifacts: false },
  [Roles.SRE_ENGINEER]:           { analysisSection: ['Dependencies', 'Entry Points'],                                     profileSections: ['Architecture'],                                                              needsFullArtifacts: false },
  [Roles.DEVOPS_ENGINEER]:        { analysisSection: ['Dependencies', 'Entry Points'],                                     profileSections: ['Architecture'],                                                              needsFullArtifacts: false },
  [Roles.DOCUMENTATION_WRITER]:   { analysisSection: ['Entry Points', 'Dependencies', 'Patterns'],                        profileSections: ['Naming Conventions', 'Architecture', 'API Conventions'],                      needsFullArtifacts: false },
};

// ─── Artifact summarizer ────────────────────────────────────────────────────

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

// ─── Section extractor ──────────────────────────────────────────────────────

function extractSections(markdown: string, sectionNames: string[]): string {
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
        // Exact match OR heading starts with the term followed by a space
        // (e.g. 'Testing' matches 'Testing Conventions' but NOT 'Module Dependencies')
        return n === t || n.startsWith(t + ' ');
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

// ─── Public API ─────────────────────────────────────────────────────────────

export function optimizeAnalysisForRole(
  fullAnalysis: string | null,
  role: AgentRole,
): string | null {
  if (!fullAnalysis) return null;

  const ctx = ROLE_CONTEXT[role];
  if (!ctx) return fullAnalysis;

  const filtered = extractSections(fullAnalysis, ctx.analysisSection);
  return filtered.trim() || null;
}

export function optimizeProfileForRole(
  fullProfile: string | null,
  role: AgentRole,
): string | null {
  if (!fullProfile) return null;

  const ctx = ROLE_CONTEXT[role];
  if (!ctx) return fullProfile;

  const filtered = extractSections(fullProfile, ctx.profileSections);
  return filtered.trim() || null;
}

export function shouldPassFullArtifacts(role: AgentRole): boolean {
  return ROLE_CONTEXT[role]?.needsFullArtifacts ?? false;
}

export function optimizeInputArtifacts(
  artifacts: Artifact[],
  role: AgentRole,
): string {
  if (artifacts.length === 0) return '';

  if (shouldPassFullArtifacts(role)) {
    const totalChars = artifacts.reduce((sum, a) => sum + (a.content?.length ?? 0), 0);
    if (totalChars < 8000) {
      return artifacts.map(a => `### ${a.name}\n\`\`\`\n${a.content}\n\`\`\``).join('\n\n');
    }
  }

  return summarizeArtifacts(artifacts);
}

// ─── Token estimation ───────────────────────────────────────────────────────

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface TokenReport {
  systemPrompt: number;
  taskInstructions: number;
  analysis: number;
  profile: number;
  artifacts: number;
  outputFormat: number;
  total: number;
  savedVsFull: number;
  savingsPercent: number;
}

export function buildTokenReport(
  systemPrompt: string,
  taskInstructions: string,
  analysis: string | null,
  profile: string | null,
  artifactContext: string,
  outputFormat: string,
  fullAnalysis: string | null,
  fullProfile: string | null,
  fullArtifactContent: string,
): TokenReport {
  const sp = estimateTokens(systemPrompt);
  const ti = estimateTokens(taskInstructions);
  const an = estimateTokens(analysis ?? '');
  const pr = estimateTokens(profile ?? '');
  const ar = estimateTokens(artifactContext);
  const of = estimateTokens(outputFormat);
  const total = sp + ti + an + pr + ar + of;

  const fullTotal = sp + ti
    + estimateTokens(fullAnalysis ?? '')
    + estimateTokens(fullProfile ?? '')
    + estimateTokens(fullArtifactContent)
    + of;

  const saved = fullTotal - total;
  const pct = fullTotal > 0 ? Math.round((saved / fullTotal) * 100) : 0;

  return { systemPrompt: sp, taskInstructions: ti, analysis: an, profile: pr, artifacts: ar, outputFormat: of, total, savedVsFull: saved, savingsPercent: pct };
}
