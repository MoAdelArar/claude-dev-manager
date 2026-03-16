import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { $ } from 'bun';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CLI_SOURCE = path.join(PROJECT_ROOT, 'src', 'cli', 'index.tsx');

let testProjectDir: string | null = null;

const MOCK_PERSONA_CATALOG = {
  version: '1.0.0',
  sourceRepo: 'test/mock-personas',
  sourceCommit: 'abc123',
  generatedAt: new Date().toISOString(),
  divisions: ['engineering', 'testing'],
  personas: [
    {
      id: 'engineering-backend-developer',
      division: 'engineering',
      filePath: 'engineering/backend-developer.md',
      frontmatter: {
        name: 'Backend Developer',
        emoji: '⚙️',
        description: 'A test backend developer persona',
        tagline: 'Builds APIs and services',
      },
      tags: ['backend', 'api', 'nodejs', 'typescript', 'express', 'engineering'],
      contentPreview: 'You are Backend Developer, a skilled backend engineer...',
      fullContent: '# Backend Developer\n\nYou are Backend Developer, a skilled backend engineer who builds robust APIs and services.',
    },
    {
      id: 'testing-qa-engineer',
      division: 'testing',
      filePath: 'testing/qa-engineer.md',
      frontmatter: {
        name: 'QA Engineer',
        emoji: '🧪',
        description: 'A test QA engineer persona',
        tagline: 'Ensures quality',
      },
      tags: ['testing', 'qa', 'quality', 'test'],
      contentPreview: 'You are QA Engineer, a meticulous quality assurance specialist...',
      fullContent: '# QA Engineer\n\nYou are QA Engineer, a meticulous quality assurance specialist.',
    },
  ],
};

function createTestProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-ux-'));
  
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'test-ux', version: '1.0.0' }),
    'utf-8',
  );
  
  const cdmDir = path.join(dir, '.cdm');
  const personasDir = path.join(cdmDir, 'personas');
  const analysisDir = path.join(cdmDir, 'analysis');
  
  fs.mkdirSync(personasDir, { recursive: true });
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.mkdirSync(path.join(cdmDir, 'features'), { recursive: true });
  fs.mkdirSync(path.join(cdmDir, 'artifacts'), { recursive: true });
  
  fs.writeFileSync(
    path.join(personasDir, 'catalog-index.json'),
    JSON.stringify(MOCK_PERSONA_CATALOG, null, 2),
    'utf-8',
  );
  
  fs.writeFileSync(
    path.join(cdmDir, 'project.json'),
    JSON.stringify({
      name: 'test-ux',
      config: { language: 'typescript', framework: 'express' },
    }),
    'utf-8',
  );
  
  fs.writeFileSync(
    path.join(analysisDir, 'overview.md'),
    '# Project Overview\nTest project',
    'utf-8',
  );
  
  fs.writeFileSync(
    path.join(analysisDir, 'codestyle.md'),
    '# Code Style\nStandard style',
    'utf-8',
  );
  
  fs.writeFileSync(
    path.join(dir, 'cdm.config.yaml'),
    `project:
  language: typescript
  framework: express
execution:
  mode: dynamic
  reviewPass: auto
  maxRetries: 2
  timeoutMinutes: 120
  defaultMode: claude-cli
personas:
  source: github
  repo: test/mock-personas
  autoResolve: true
`,
    'utf-8',
  );
  
  fs.writeFileSync(
    path.join(dir, 'CLAUDE.md'),
    '# Claude Dev Manager\nTest project instructions',
    'utf-8',
  );
  
  return dir;
}

function cleanTestProject(): void {
  if (testProjectDir) {
    fs.rmSync(testProjectDir, { recursive: true, force: true });
    testProjectDir = null;
  }
}

describe('CLI UX Commands', () => {
  describe('cdm completion', () => {
    it('shows help when no shell specified', async () => {
      const result = await $`bunx tsx src/cli/index.tsx completion`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('Shell Completion');
      expect(output).toContain('bash');
      expect(output).toContain('zsh');
      expect(output).toContain('fish');
    });

    it('generates bash completion script', async () => {
      const result = await $`bunx tsx src/cli/index.tsx completion bash`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('_cdm_completions');
      expect(output).toContain('complete -F');
    });

    it('generates zsh completion script', async () => {
      const result = await $`bunx tsx src/cli/index.tsx completion zsh`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('#compdef cdm');
      expect(output).toContain('_cdm');
    });

    it('generates fish completion script', async () => {
      const result = await $`bunx tsx src/cli/index.tsx completion fish`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('complete -c cdm');
    });
  });

  describe('cdm start --estimate', () => {
    beforeEach(() => {
      testProjectDir = createTestProject();
    });

    afterEach(() => {
      cleanTestProject();
    });

    it('shows cost estimate for task', async () => {
      const result = await $`bunx tsx ${CLI_SOURCE} start "Test feature" --estimate --project ${testProjectDir}`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('ESTIMATE');
      expect(output).toContain('Persona');
    });

    it('shows persona information in estimate', async () => {
      const result = await $`bunx tsx ${CLI_SOURCE} start "Build React component" --estimate --project ${testProjectDir}`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('Persona');
    });
  });

  describe('cdm --help', () => {
    it('shows completion command in help', async () => {
      const result = await $`bunx tsx src/cli/index.tsx --help`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('completion');
    });

    it('shows dashboard command in help', async () => {
      const result = await $`bunx tsx src/cli/index.tsx --help`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('dashboard');
    });

    it('shows personas command in help', async () => {
      const result = await $`bunx tsx src/cli/index.tsx --help`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('personas');
    });

    it('shows estimate flag in start help', async () => {
      const result = await $`bunx tsx src/cli/index.tsx start --help`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('--estimate');
    });

    it('shows persona flag in start help', async () => {
      const result = await $`bunx tsx src/cli/index.tsx start --help`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('--persona');
    });

    it('shows review flag in start help', async () => {
      const result = await $`bunx tsx src/cli/index.tsx start --help`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('--review');
    });
  });

  describe('cdm personas', () => {
    it('shows personas list subcommand help', async () => {
      const result = await $`bunx tsx src/cli/index.tsx personas list --help`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('--division');
    });

    it('shows personas resolve subcommand help', async () => {
      const result = await $`bunx tsx src/cli/index.tsx personas resolve --help`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('description');
    });
  });
});
