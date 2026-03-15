/**
 * PersonaCatalog - Parses and indexes persona files from the agency-agents repo.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import {
  type AgentPersona,
  type PersonaCatalogData,
  type PersonaFrontmatter,
} from './types';
import logger from '../utils/logger';

export class PersonaCatalog {
  private personas: Map<string, AgentPersona> = new Map();
  private divisions: Set<string> = new Set();
  private sourceRepo: string = '';
  private sourceCommit: string = '';
  private lastUpdated: string = '';

  static async buildFromDirectory(
    sourceDir: string,
    repo: string = 'msitarzewski/agency-agents',
    commit: string = 'unknown',
  ): Promise<PersonaCatalog> {
    const catalog = new PersonaCatalog();
    catalog.sourceRepo = repo;
    catalog.sourceCommit = commit;
    catalog.lastUpdated = new Date().toISOString();

    await catalog.loadFromDirectory(sourceDir);

    return catalog;
  }

  static loadFromIndex(indexPath: string): PersonaCatalog | null {
    try {
      if (!fs.existsSync(indexPath)) {
        return null;
      }

      const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as PersonaCatalogData;
      const catalog = new PersonaCatalog();

      catalog.sourceRepo = data.sourceRepo;
      catalog.sourceCommit = data.sourceCommit;
      catalog.lastUpdated = data.lastUpdated;

      for (const persona of data.personas) {
        catalog.personas.set(persona.id, persona);
        catalog.divisions.add(persona.division);
      }

      return catalog;
    } catch (error) {
      logger.warn(`Failed to load catalog index: ${error}`);
      return null;
    }
  }

  private async loadFromDirectory(sourceDir: string): Promise<void> {
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Source directory does not exist: ${sourceDir}`);
    }

    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const divisionDir = path.join(sourceDir, entry.name);
        await this.loadDivision(entry.name, divisionDir);
      }
    }

    logger.info(`Loaded ${this.personas.size} personas from ${this.divisions.size} divisions`);
  }

  private async loadDivision(division: string, divisionDir: string): Promise<void> {
    this.divisions.add(division);
    await this.loadPersonasRecursive(division, divisionDir, divisionDir);
  }

  private async loadPersonasRecursive(
    division: string,
    baseDir: string,
    currentDir: string,
  ): Promise<void> {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await this.loadPersonasRecursive(division, baseDir, fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const persona = this.parsePersonaFile(division, baseDir, fullPath);
        if (persona) {
          this.personas.set(persona.id, persona);
        }
      }
    }
  }

  private parsePersonaFile(
    division: string,
    baseDir: string,
    filePath: string,
  ): AgentPersona | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = this.parseFrontmatter(content);

      if (!frontmatter.name) {
        return null;
      }

      const relativePath = path.relative(baseDir, filePath);
      const id = this.generateId(division, relativePath);
      const tags = this.extractTags(frontmatter, body, division, relativePath);

      return {
        id,
        division,
        frontmatter,
        fullContent: body,
        tags,
        filePath: relativePath,
      };
    } catch (error) {
      logger.warn(`Failed to parse persona file ${filePath}: ${error}`);
      return null;
    }
  }

  private parseFrontmatter(content: string): { frontmatter: PersonaFrontmatter; body: string } {
    const defaultFrontmatter: PersonaFrontmatter = {
      name: '',
      description: '',
      color: 'gray',
      emoji: '🤖',
      vibe: '',
    };

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      const nameMatch = content.match(/^#\s+(.+?)(?:\s+Agent)?(?:\s+Personality)?\s*$/m);
      return {
        frontmatter: {
          ...defaultFrontmatter,
          name: nameMatch ? nameMatch[1].trim() : '',
        },
        body: content,
      };
    }

    try {
      const parsed = yaml.parse(frontmatterMatch[1]);
      return {
        frontmatter: {
          name: parsed.name || '',
          description: parsed.description || '',
          color: parsed.color || 'gray',
          emoji: parsed.emoji || '🤖',
          vibe: parsed.vibe || '',
        },
        body: frontmatterMatch[2].trim(),
      };
    } catch {
      return { frontmatter: defaultFrontmatter, body: content };
    }
  }

  private generateId(division: string, relativePath: string): string {
    const baseName = path.basename(relativePath, '.md');
    const dirPart = path.dirname(relativePath);

    if (dirPart && dirPart !== '.') {
      return `${division}-${dirPart.replace(/\//g, '-')}-${baseName}`.toLowerCase();
    }

    return `${division}-${baseName}`.toLowerCase();
  }

  private extractTags(
    frontmatter: PersonaFrontmatter,
    body: string,
    division: string,
    relativePath: string,
  ): string[] {
    const tags = new Set<string>();

    tags.add(division.toLowerCase());

    const filenameParts = path.basename(relativePath, '.md').split('-');
    for (const part of filenameParts) {
      if (part.length > 2) {
        tags.add(part.toLowerCase());
      }
    }

    const descTokens = this.tokenize(frontmatter.description);
    for (const token of descTokens) {
      tags.add(token);
    }

    const vibeTokens = this.tokenize(frontmatter.vibe);
    for (const token of vibeTokens) {
      tags.add(token);
    }

    const bodyPreview = body.slice(0, 1000);
    const bodyTokens = this.tokenize(bodyPreview);
    for (const token of bodyTokens.slice(0, 30)) {
      tags.add(token);
    }

    const techKeywords = this.extractTechKeywords(frontmatter.description + ' ' + body);
    for (const kw of techKeywords) {
      tags.add(kw);
    }

    return Array.from(tags).filter((t) => t.length > 2);
  }

  private tokenize(text: string): string[] {
    if (!text) return [];

    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !this.isStopWord(t));
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
      'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'were', 'will',
      'with', 'that', 'this', 'from', 'they', 'your', 'what', 'about', 'which',
      'when', 'make', 'like', 'time', 'just', 'know', 'take', 'people', 'into',
      'year', 'good', 'some', 'them', 'than', 'then', 'look', 'only', 'come',
      'its', 'over', 'such', 'after', 'most', 'also', 'made', 'any', 'being',
    ]);
    return stopWords.has(word);
  }

  private extractTechKeywords(text: string): string[] {
    const keywords: string[] = [];
    const lowerText = text.toLowerCase();

    const techTerms = [
      'react', 'vue', 'angular', 'svelte', 'nextjs', 'next.js', 'nuxt',
      'typescript', 'javascript', 'python', 'go', 'rust', 'java', 'kotlin',
      'swift', 'flutter', 'react native', 'ios', 'android', 'mobile',
      'node', 'nodejs', 'express', 'fastapi', 'django', 'flask', 'rails',
      'graphql', 'rest', 'api', 'grpc', 'websocket',
      'postgres', 'postgresql', 'mysql', 'mongodb', 'redis', 'database', 'sql',
      'aws', 'gcp', 'azure', 'cloud', 'kubernetes', 'docker', 'terraform',
      'ci/cd', 'cicd', 'devops', 'sre', 'infrastructure',
      'security', 'authentication', 'auth', 'oauth', 'jwt',
      'testing', 'unit test', 'e2e', 'integration', 'qa', 'quality',
      'frontend', 'backend', 'fullstack', 'full-stack',
      'performance', 'optimization', 'scalability',
      'accessibility', 'a11y', 'wcag',
      'ui', 'ux', 'design', 'css', 'tailwind', 'styled-components',
      'git', 'version control', 'code review',
    ];

    for (const term of techTerms) {
      if (lowerText.includes(term)) {
        keywords.push(term.replace(/[^a-z0-9]/g, ''));
      }
    }

    return keywords;
  }

  getById(id: string): AgentPersona | undefined {
    return this.personas.get(id);
  }

  getByDivision(division: string): AgentPersona[] {
    return Array.from(this.personas.values()).filter(
      (p) => p.division === division,
    );
  }

  search(queryTags: string[]): AgentPersona[] {
    const normalizedQuery = queryTags.map((t) => t.toLowerCase());
    const scored: Array<{ persona: AgentPersona; score: number }> = [];

    for (const persona of this.personas.values()) {
      let score = 0;

      for (const queryTag of normalizedQuery) {
        for (const personaTag of persona.tags) {
          if (personaTag === queryTag) {
            score += 3;
          } else if (personaTag.includes(queryTag) || queryTag.includes(personaTag)) {
            score += 1;
          }
        }
      }

      if (score > 0) {
        scored.push({ persona, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .map((s) => s.persona);
  }

  getAllPersonas(): AgentPersona[] {
    return Array.from(this.personas.values());
  }

  getDivisions(): string[] {
    return Array.from(this.divisions);
  }

  getCount(): number {
    return this.personas.size;
  }

  persist(indexPath: string): void {
    const data: PersonaCatalogData = {
      personas: Array.from(this.personas.values()),
      divisions: Array.from(this.divisions),
      lastUpdated: this.lastUpdated,
      sourceRepo: this.sourceRepo,
      sourceCommit: this.sourceCommit,
    };

    const dir = path.dirname(indexPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(indexPath, JSON.stringify(data, null, 2));
    logger.info(`Saved catalog index to ${indexPath}`);
  }

  getMetadata(): { sourceRepo: string; sourceCommit: string; lastUpdated: string } {
    return {
      sourceRepo: this.sourceRepo,
      sourceCommit: this.sourceCommit,
      lastUpdated: this.lastUpdated,
    };
  }
}

export function getCatalogIndexPath(projectPath: string): string {
  return path.join(projectPath, '.cdm', 'personas', 'catalog-index.json');
}

export async function loadOrBuildCatalog(
  projectPath: string,
  sourceDir: string,
  repo: string,
  commit: string,
): Promise<PersonaCatalog> {
  const indexPath = getCatalogIndexPath(projectPath);
  const cached = PersonaCatalog.loadFromIndex(indexPath);

  if (cached && cached.getCount() > 0) {
    const metadata = cached.getMetadata();
    if (metadata.sourceCommit === commit) {
      logger.info(`Using cached catalog (${cached.getCount()} personas)`);
      return cached;
    }
  }

  const catalog = await PersonaCatalog.buildFromDirectory(sourceDir, repo, commit);
  catalog.persist(indexPath);

  return catalog;
}
