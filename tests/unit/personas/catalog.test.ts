import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PersonaCatalog, getCatalogIndexPath } from '../../../src/personas/catalog';
import type { AgentPersona, PersonaCatalogData } from '../../../src/personas/types';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-catalog-test-'));
}

function createPersonaFile(dir: string, name: string, frontmatter: Record<string, string>, body: string): void {
  const yamlFrontmatter = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const content = `---\n${yamlFrontmatter}\n---\n${body}`;
  fs.writeFileSync(path.join(dir, name), content);
}

describe('PersonaCatalog', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('buildFromDirectory', () => {
    it('should build catalog from a directory structure', async () => {
      const engineeringDir = path.join(tempDir, 'engineering');
      fs.mkdirSync(engineeringDir);

      createPersonaFile(
        engineeringDir,
        'senior-developer.md',
        { name: 'Senior Developer', emoji: '👨‍💻', description: 'Experienced developer' },
        '# Senior Developer\n\nA skilled developer who writes clean code.',
      );

      const catalog = await PersonaCatalog.buildFromDirectory(tempDir, 'test/repo', 'abc123');

      expect(catalog.getCount()).toBe(1);
      expect(catalog.getDivisions()).toContain('engineering');
    });

    it('should handle multiple divisions', async () => {
      const engineeringDir = path.join(tempDir, 'engineering');
      const designDir = path.join(tempDir, 'design');
      fs.mkdirSync(engineeringDir);
      fs.mkdirSync(designDir);

      createPersonaFile(
        engineeringDir,
        'developer.md',
        { name: 'Developer', description: 'Writes code' },
        'Developer content',
      );

      createPersonaFile(
        designDir,
        'designer.md',
        { name: 'Designer', description: 'Creates designs' },
        'Designer content',
      );

      const catalog = await PersonaCatalog.buildFromDirectory(tempDir);

      expect(catalog.getCount()).toBe(2);
      expect(catalog.getDivisions().sort()).toEqual(['design', 'engineering']);
    });

    it('should generate unique IDs for personas', async () => {
      const engineeringDir = path.join(tempDir, 'engineering');
      fs.mkdirSync(engineeringDir);

      createPersonaFile(
        engineeringDir,
        'senior-developer.md',
        { name: 'Senior Developer', description: 'Test' },
        'Content',
      );

      const catalog = await PersonaCatalog.buildFromDirectory(tempDir);
      const persona = catalog.getById('engineering-senior-developer');

      expect(persona).toBeDefined();
      expect(persona?.frontmatter.name).toBe('Senior Developer');
    });

    it('should extract tags from content', async () => {
      const engineeringDir = path.join(tempDir, 'engineering');
      fs.mkdirSync(engineeringDir);

      createPersonaFile(
        engineeringDir,
        'react-developer.md',
        { name: 'React Developer', description: 'Builds React applications', vibe: 'component-based' },
        'Expert in React, TypeScript, and frontend development',
      );

      const catalog = await PersonaCatalog.buildFromDirectory(tempDir);
      const persona = catalog.getById('engineering-react-developer');

      expect(persona).toBeDefined();
      expect(persona!.tags).toContain('engineering');
      expect(persona!.tags).toContain('react');
    });

    it('should handle files without frontmatter', async () => {
      const engineeringDir = path.join(tempDir, 'engineering');
      fs.mkdirSync(engineeringDir);

      fs.writeFileSync(
        path.join(engineeringDir, 'simple.md'),
        '# Simple Developer Agent\n\nJust writes code.',
      );

      const catalog = await PersonaCatalog.buildFromDirectory(tempDir);

      expect(catalog.getCount()).toBe(1);
      const persona = catalog.getById('engineering-simple');
      expect(persona?.frontmatter.name).toBe('Simple Developer');
    });

    it('should skip hidden directories', async () => {
      const hiddenDir = path.join(tempDir, '.hidden');
      const engineeringDir = path.join(tempDir, 'engineering');
      fs.mkdirSync(hiddenDir);
      fs.mkdirSync(engineeringDir);

      createPersonaFile(hiddenDir, 'secret.md', { name: 'Secret' }, 'Secret content');
      createPersonaFile(engineeringDir, 'public.md', { name: 'Public' }, 'Public content');

      const catalog = await PersonaCatalog.buildFromDirectory(tempDir);

      expect(catalog.getCount()).toBe(1);
      expect(catalog.getById('hidden-secret')).toBeUndefined();
    });
  });

  describe('getById', () => {
    it('should return persona by ID', async () => {
      const engineeringDir = path.join(tempDir, 'engineering');
      fs.mkdirSync(engineeringDir);

      createPersonaFile(
        engineeringDir,
        'test.md',
        { name: 'Test Persona', description: 'For testing' },
        'Test content',
      );

      const catalog = await PersonaCatalog.buildFromDirectory(tempDir);
      const persona = catalog.getById('engineering-test');

      expect(persona).toBeDefined();
      expect(persona?.frontmatter.name).toBe('Test Persona');
    });

    it('should return undefined for non-existent ID', async () => {
      const catalog = await PersonaCatalog.buildFromDirectory(tempDir);
      expect(catalog.getById('non-existent')).toBeUndefined();
    });
  });

  describe('getByDivision', () => {
    it('should return all personas in a division', async () => {
      const engineeringDir = path.join(tempDir, 'engineering');
      fs.mkdirSync(engineeringDir);

      createPersonaFile(engineeringDir, 'one.md', { name: 'One' }, 'Content');
      createPersonaFile(engineeringDir, 'two.md', { name: 'Two' }, 'Content');

      const catalog = await PersonaCatalog.buildFromDirectory(tempDir);
      const personas = catalog.getByDivision('engineering');

      expect(personas.length).toBe(2);
    });

    it('should return empty array for non-existent division', async () => {
      const catalog = await PersonaCatalog.buildFromDirectory(tempDir);
      const personas = catalog.getByDivision('nonexistent');

      expect(personas).toEqual([]);
    });
  });

  describe('search', () => {
    it('should find personas matching tags', async () => {
      const engineeringDir = path.join(tempDir, 'engineering');
      fs.mkdirSync(engineeringDir);

      createPersonaFile(
        engineeringDir,
        'react-dev.md',
        { name: 'React Developer', description: 'Builds React apps' },
        'Expert in React and frontend',
      );

      createPersonaFile(
        engineeringDir,
        'backend-dev.md',
        { name: 'Backend Developer', description: 'Builds APIs' },
        'Expert in Node.js and databases',
      );

      const catalog = await PersonaCatalog.buildFromDirectory(tempDir);
      const results = catalog.search(['react', 'frontend']);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].frontmatter.name).toBe('React Developer');
    });

    it('should return results sorted by score', async () => {
      const engineeringDir = path.join(tempDir, 'engineering');
      fs.mkdirSync(engineeringDir);

      createPersonaFile(
        engineeringDir,
        'generic.md',
        { name: 'Generic Developer', description: 'Writes code' },
        'General development',
      );

      createPersonaFile(
        engineeringDir,
        'react-expert.md',
        { name: 'React Expert', description: 'Expert in React and TypeScript' },
        'React TypeScript frontend specialist',
      );

      const catalog = await PersonaCatalog.buildFromDirectory(tempDir);
      const results = catalog.search(['react', 'typescript']);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].frontmatter.name).toBe('React Expert');
    });

    it('should return empty array when no matches', async () => {
      const engineeringDir = path.join(tempDir, 'engineering');
      fs.mkdirSync(engineeringDir);

      createPersonaFile(
        engineeringDir,
        'python.md',
        { name: 'Python Developer', description: 'Python expert' },
        'Python Django Flask',
      );

      const catalog = await PersonaCatalog.buildFromDirectory(tempDir);
      const results = catalog.search(['rust', 'webassembly']);

      expect(results).toEqual([]);
    });
  });

  describe('persist and loadFromIndex', () => {
    it('should persist catalog to JSON and reload it', async () => {
      const engineeringDir = path.join(tempDir, 'engineering');
      fs.mkdirSync(engineeringDir);

      createPersonaFile(
        engineeringDir,
        'test.md',
        { name: 'Test Persona', emoji: '🧪', description: 'For testing' },
        'Test content',
      );

      const catalog = await PersonaCatalog.buildFromDirectory(tempDir, 'test/repo', 'commit123');
      const indexPath = path.join(tempDir, 'catalog-index.json');
      catalog.persist(indexPath);

      expect(fs.existsSync(indexPath)).toBe(true);

      const reloaded = PersonaCatalog.loadFromIndex(indexPath);

      expect(reloaded).not.toBeNull();
      expect(reloaded!.getCount()).toBe(1);
      expect(reloaded!.getById('engineering-test')?.frontmatter.name).toBe('Test Persona');

      const metadata = reloaded!.getMetadata();
      expect(metadata.sourceRepo).toBe('test/repo');
      expect(metadata.sourceCommit).toBe('commit123');
    });

    it('should return null when index file does not exist', () => {
      const result = PersonaCatalog.loadFromIndex('/nonexistent/path/index.json');
      expect(result).toBeNull();
    });
  });

  describe('getCatalogIndexPath', () => {
    it('should return correct path', () => {
      const result = getCatalogIndexPath('/project/root');
      expect(result).toBe('/project/root/.cdm/personas/catalog-index.json');
    });
  });

  describe('getAllPersonas', () => {
    it('should return all personas', async () => {
      const engineeringDir = path.join(tempDir, 'engineering');
      const designDir = path.join(tempDir, 'design');
      fs.mkdirSync(engineeringDir);
      fs.mkdirSync(designDir);

      createPersonaFile(engineeringDir, 'dev.md', { name: 'Dev' }, 'Content');
      createPersonaFile(designDir, 'designer.md', { name: 'Designer' }, 'Content');

      const catalog = await PersonaCatalog.buildFromDirectory(tempDir);
      const all = catalog.getAllPersonas();

      expect(all.length).toBe(2);
    });
  });
});
