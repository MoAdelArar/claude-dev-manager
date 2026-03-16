/**
 * PersonaResolver - Matches task descriptions to the best-fit personas.
 */

import { type PersonaCatalog } from './catalog.js';
import {
  type AgentPersona,
  type ResolvedPersonas,
  type PersonasConfig,
  type PersonaMatchScore,
  type SignalExtraction,
  DEFAULT_PERSONAS_CONFIG,
} from './types.js';
import { type ProjectConfig } from '../types.js';

export interface ResolverOptions {
  config: Partial<PersonasConfig>;
  forceReview?: boolean;
  forcePrimaryPersona?: string;
}

export class PersonaResolver {
  private config: PersonasConfig;

  constructor(config: Partial<PersonasConfig> = {}) {
    this.config = { ...DEFAULT_PERSONAS_CONFIG, ...config };
  }

  resolve(
    description: string,
    projectConfig: ProjectConfig,
    catalog: PersonaCatalog,
    options: ResolverOptions = { config: {} },
  ): ResolvedPersonas {
    const signals = this.extractSignals(description);

    if (options.forcePrimaryPersona) {
      const forced = catalog.getById(options.forcePrimaryPersona);
      if (forced) {
        const reviewPersonas = this.selectReviewPersonas(catalog, signals, forced);
        return {
          primary: forced,
          supporting: [],
          reviewLens: reviewPersonas,
          reason: `Forced primary persona: ${forced.frontmatter.name}`,
          needsReviewPass: options.forceReview || signals.risks.length > 0,
        };
      }
    }

    const overridePersona = this.checkOverrides(signals, catalog);
    if (overridePersona) {
      const reviewPersonas = this.selectReviewPersonas(catalog, signals, overridePersona);
      return {
        primary: overridePersona,
        supporting: [],
        reviewLens: reviewPersonas,
        reason: `Config override matched: ${overridePersona.frontmatter.name}`,
        needsReviewPass: options.forceReview || signals.risks.length > 0,
      };
    }

    const scores = this.scorePersonas(catalog, signals, projectConfig);

    if (scores.length === 0) {
      const fallback = this.getFallbackPersona(catalog);
      return {
        primary: fallback,
        supporting: [],
        reviewLens: [],
        reason: 'No matching personas found, using fallback',
        needsReviewPass: options.forceReview || false,
      };
    }

    const primary = scores[0].persona;
    const supporting = this.selectSupportingPersonas(scores, primary);
    const reviewPersonas = this.selectReviewPersonas(catalog, signals, primary);

    const needsReviewPass =
      options.forceReview ||
      this.config.overrides['reviewPass'] === 'always' ||
      signals.risks.length > 0;

    const reasons = scores[0].reasons.slice(0, 3).join(', ');

    return {
      primary,
      supporting,
      reviewLens: reviewPersonas,
      reason: `Best match: ${primary.frontmatter.name} (${reasons})`,
      needsReviewPass,
    };
  }

  extractSignals(description: string): SignalExtraction {
    const text = description.toLowerCase();

    const frameworks = this.matchPatterns(text, [
      ['react', 'react'],
      ['vue', 'vue'],
      ['angular', 'angular'],
      ['svelte', 'svelte'],
      ['next\\.?js', 'nextjs'],
      ['nuxt', 'nuxt'],
      ['express', 'express'],
      ['fastapi', 'fastapi'],
      ['django', 'django'],
      ['flask', 'flask'],
      ['rails', 'rails'],
      ['spring', 'spring'],
      ['laravel', 'laravel'],
      ['flutter', 'flutter'],
      ['react native', 'reactnative'],
      ['swift\\b', 'swift'],
      ['kotlin', 'kotlin'],
    ]);

    const domains = this.matchPatterns(text, [
      ['\\bapi\\b', 'api'],
      ['rest\\b', 'api'],
      ['graphql', 'api'],
      ['database', 'database'],
      ['\\bdb\\b', 'database'],
      ['postgres', 'database'],
      ['mysql', 'database'],
      ['mongodb', 'database'],
      ['\\bui\\b', 'ui'],
      ['user interface', 'ui'],
      ['frontend', 'frontend'],
      ['front-end', 'frontend'],
      ['backend', 'backend'],
      ['back-end', 'backend'],
      ['\\bauth\\b', 'auth'],
      ['authentication', 'auth'],
      ['login', 'auth'],
      ['deploy', 'deploy'],
      ['ci/?cd', 'cicd'],
      ['pipeline', 'cicd'],
      ['infrastructure', 'infra'],
      ['\\baws\\b', 'cloud'],
      ['\\bgcp\\b', 'cloud'],
      ['azure', 'cloud'],
      ['kubernetes', 'infra'],
      ['docker', 'infra'],
      ['mobile', 'mobile'],
      ['\\bios\\b', 'mobile'],
      ['android', 'mobile'],
      ['test', 'testing'],
      ['\\bqa\\b', 'testing'],
      ['security', 'security'],
      ['performance', 'performance'],
      ['accessibility', 'accessibility'],
      ['\\ba11y\\b', 'accessibility'],
    ]);

    const actions = this.matchPatterns(text, [
      ['\\bfix\\b', 'fix'],
      ['\\bbug\\b', 'fix'],
      ['\\berror\\b', 'fix'],
      ['\\bbroken\\b', 'fix'],
      ['\\bbuild\\b', 'build'],
      ['\\bcreate\\b', 'build'],
      ['\\badd\\b', 'build'],
      ['\\bimplement\\b', 'build'],
      ['\\bdevelop\\b', 'build'],
      ['\\breview\\b', 'review'],
      ['\\baudit\\b', 'review'],
      ['\\banalyze\\b', 'review'],
      ['\\bdesign\\b', 'design'],
      ['\\barchitect\\b', 'design'],
      ['\\btest\\b', 'test'],
      ['\\bdeploy\\b', 'deploy'],
      ['\\brelease\\b', 'deploy'],
      ['\\bship\\b', 'deploy'],
      ['\\brefactor\\b', 'refactor'],
      ['\\bclean\\b', 'refactor'],
      ['\\breorganize\\b', 'refactor'],
    ]);

    const risks = this.matchPatterns(text, [
      ['\\bauth\\b', 'auth'],
      ['authentication', 'auth'],
      ['password', 'auth'],
      ['\\blogin\\b', 'auth'],
      ['payment', 'payment'],
      ['billing', 'payment'],
      ['credit card', 'payment'],
      ['stripe', 'payment'],
      ['encrypt', 'encryption'],
      ['\\bpii\\b', 'pii'],
      ['personal data', 'pii'],
      ['\\bgdpr\\b', 'compliance'],
      ['\\bhipaa\\b', 'compliance'],
      ['compliance', 'compliance'],
      ['sensitive', 'sensitive'],
      ['\\bsecret\\b', 'sensitive'],
      ['\\btoken\\b', 'sensitive'],
    ]);

    const keywords = this.extractKeywords(text);

    return { frameworks, domains, actions, risks, keywords };
  }

  private matchPatterns(text: string, patterns: [string, string][]): string[] {
    const matches = new Set<string>();

    for (const [pattern, label] of patterns) {
      if (new RegExp(pattern, 'i').test(text)) {
        matches.add(label);
      }
    }

    return Array.from(matches);
  }

  private extractKeywords(text: string): string[] {
    return text
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 20);
  }

  private scorePersonas(
    catalog: PersonaCatalog,
    signals: SignalExtraction,
    projectConfig: ProjectConfig,
  ): PersonaMatchScore[] {
    const scores: PersonaMatchScore[] = [];
    const allPersonas = catalog.getAllPersonas();

    for (const persona of allPersonas) {
      const { score, reasons } = this.scorePersona(persona, signals, projectConfig);

      if (score > 0) {
        scores.push({ persona, score, reasons });
      }
    }

    return scores.sort((a, b) => b.score - a.score);
  }

  private scorePersona(
    persona: AgentPersona,
    signals: SignalExtraction,
    projectConfig: ProjectConfig,
  ): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];
    const tags = new Set(persona.tags);

    for (const framework of signals.frameworks) {
      if (tags.has(framework) || this.tagContains(tags, framework)) {
        score += 10;
        reasons.push(`framework: ${framework}`);
      }
    }

    for (const domain of signals.domains) {
      if (tags.has(domain) || this.tagContains(tags, domain)) {
        score += 5;
        reasons.push(`domain: ${domain}`);
      }
    }

    const divisionMatch = this.matchActionToDivision(signals.actions, persona.division);
    if (divisionMatch) {
      score += 3;
      reasons.push(`action-division: ${persona.division}`);
    }

    const projectLang = projectConfig.language.toLowerCase();
    if (projectLang && (tags.has(projectLang) || this.tagContains(tags, projectLang))) {
      score += 2;
      reasons.push(`project-lang: ${projectLang}`);
    }

    const projectFramework = projectConfig.framework.toLowerCase();
    if (projectFramework && projectFramework !== 'none') {
      if (tags.has(projectFramework) || this.tagContains(tags, projectFramework)) {
        score += 2;
        reasons.push(`project-framework: ${projectFramework}`);
      }
    }

    for (const keyword of signals.keywords) {
      if (tags.has(keyword) || this.tagContains(tags, keyword)) {
        score += 1;
      }
    }

    return { score, reasons };
  }

  private tagContains(tags: Set<string>, query: string): boolean {
    for (const tag of tags) {
      if (tag.includes(query) || query.includes(tag)) {
        return true;
      }
    }
    return false;
  }

  private matchActionToDivision(actions: string[], division: string): boolean {
    const actionDivisionMap: Record<string, string[]> = {
      engineering: ['build', 'fix', 'refactor', 'deploy'],
      design: ['design'],
      testing: ['test', 'review'],
      product: ['design', 'build'],
      support: ['fix'],
      specialized: ['review', 'build'],
    };

    const matchingActions = actionDivisionMap[division] || [];
    return actions.some((a) => matchingActions.includes(a));
  }

  private selectSupportingPersonas(
    scores: PersonaMatchScore[],
    primary: AgentPersona,
  ): AgentPersona[] {
    const supporting: AgentPersona[] = [];
    const usedDivisions = new Set([primary.division]);

    const minScore = Math.max(scores[0].score * 0.5, 3);

    for (const scored of scores.slice(1)) {
      if (scored.score < minScore) break;
      if (usedDivisions.has(scored.persona.division)) continue;

      supporting.push(scored.persona);
      usedDivisions.add(scored.persona.division);

      if (supporting.length >= 2) break;
    }

    return supporting;
  }

  private selectReviewPersonas(
    catalog: PersonaCatalog,
    signals: SignalExtraction,
    _primary: AgentPersona,
  ): AgentPersona[] {
    if (signals.risks.length === 0) {
      return [];
    }

    const reviewPersonas: AgentPersona[] = [];

    if (signals.risks.includes('auth') || signals.risks.includes('payment') ||
        signals.risks.includes('encryption') || signals.risks.includes('sensitive')) {
      const security = catalog.getById('engineering-security-engineer');
      if (security) reviewPersonas.push(security);
    }

    if (signals.domains.includes('accessibility')) {
      const a11y = catalog.getById('testing-accessibility-auditor');
      if (a11y) reviewPersonas.push(a11y);
    }

    if (reviewPersonas.length === 0) {
      const codeReviewer = catalog.getById('engineering-code-reviewer');
      if (codeReviewer) reviewPersonas.push(codeReviewer);
    }

    return reviewPersonas.slice(0, 2);
  }

  private checkOverrides(
    signals: SignalExtraction,
    catalog: PersonaCatalog,
  ): AgentPersona | null {
    for (const domain of signals.domains) {
      const overrideId = this.config.overrides[domain];
      if (overrideId) {
        const persona = catalog.getById(overrideId);
        if (persona) return persona;
      }
    }

    for (const framework of signals.frameworks) {
      const overrideId = this.config.overrides[framework];
      if (overrideId) {
        const persona = catalog.getById(overrideId);
        if (persona) return persona;
      }
    }

    return null;
  }

  private getFallbackPersona(catalog: PersonaCatalog): AgentPersona {
    const fallbackIds = [
      'engineering-senior-developer',
      'engineering-frontend-developer',
      'engineering-backend-architect',
    ];

    for (const id of fallbackIds) {
      const persona = catalog.getById(id);
      if (persona) return persona;
    }

    const all = catalog.getAllPersonas();
    if (all.length > 0) {
      return all[0];
    }

    return {
      id: 'fallback-developer',
      division: 'engineering',
      frontmatter: {
        name: 'Developer',
        description: 'General-purpose developer',
        color: 'blue',
        emoji: '💻',
        vibe: 'Gets things done.',
      },
      fullContent: 'You are a skilled software developer. Follow best practices and write clean, maintainable code.',
      tags: ['developer', 'engineering', 'code'],
      filePath: '',
    };
  }

  needsReviewPass(signals: SignalExtraction, forceReview: boolean = false): boolean {
    if (forceReview) return true;
    return signals.risks.length > 0;
  }
}

export function createPersonaResolver(config?: Partial<PersonasConfig>): PersonaResolver {
  return new PersonaResolver(config);
}
