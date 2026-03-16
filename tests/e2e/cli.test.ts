import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { execSync, type ExecSyncOptions } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CLI_SOURCE = path.join(PROJECT_ROOT, 'src', 'cli', 'index.tsx');

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

function createTempProject(name = 'test-project'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-e2e-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      dependencies: { express: '^4.18.0' },
      devDependencies: { jest: '^29.0.0' },
    }),
    'utf-8',
  );
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}', 'utf-8');
  return dir;
}

function setupMockCdmProject(projectDir: string): void {
  const cdmDir = path.join(projectDir, '.cdm');
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
      name: path.basename(projectDir),
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
    path.join(projectDir, 'cdm.config.yaml'),
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
    path.join(projectDir, 'CLAUDE.md'),
    '# Claude Dev Manager\nTest project instructions',
    'utf-8',
  );
}

function cdm(args: string, projectDir: string): string {
  const opts: ExecSyncOptions = {
    cwd: projectDir,
    env: { ...process.env, NODE_ENV: 'test', FORCE_COLOR: '0' },
    timeout: 60_000,
  };
  return execSync(`bunx tsx "${CLI_SOURCE}" ${args}`, opts).toString();
}

function cleanDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('CDM CLI — End-to-End', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanDir(projectDir);
  });

  describe('help and version', () => {
    it('should print help when invoked with no arguments', () => {
      const out = cdm('--help', projectDir);
      expect(out).toContain('cdm');
      expect(out).toContain('Claude Dev Manager');
      expect(out).toContain('start');
      expect(out).toContain('status');
      expect(out).toContain('init');
      expect(out).toContain('artifacts');
      expect(out).toContain('personas');
      expect(out).toContain('resume');
      expect(out).toContain('show');
      expect(out).toContain('config');
    });

    it('should print version', () => {
      const out = cdm('--version', projectDir);
      expect(out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('cdm personas', () => {
    it('should show personas help', () => {
      const out = cdm('personas --help', projectDir);
      expect(out).toContain('list');
      expect(out).toContain('update');
      expect(out).toContain('resolve');
      expect(out).toContain('info');
    });
  });

  describe('cdm init', () => {
    it('should initialize CDM in a project directory', () => {
      const out = cdm(`init --project "${projectDir}"`, projectDir);

      expect(out).toContain('Initializing Claude Dev Manager');
      expect(out).toContain('cdm.config.yaml');
      expect(out).toContain('CLAUDE.md');

      expect(fs.existsSync(path.join(projectDir, 'cdm.config.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.cdm'))).toBe(true);
    });

    it('should detect project language and framework from package.json', () => {
      const out = cdm(`init --project "${projectDir}"`, projectDir);
      expect(out).toContain('typescript');
    });

    it('should generate a valid cdm.config.yaml', () => {
      cdm(`init --project "${projectDir}"`, projectDir);
      const configPath = path.join(projectDir, 'cdm.config.yaml');
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('project');
      expect(content).toContain('execution');
      expect(content).toContain('personas');
    });

    it('should generate a CLAUDE.md with persona information', () => {
      cdm(`init --project "${projectDir}"`, projectDir);
      const claudeMd = fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf-8');
      expect(claudeMd).toContain('Claude Dev Manager');
      expect(claudeMd).toContain('Artifact Format');
      expect(claudeMd).toContain('ARTIFACT_START');
    });
  });

  describe('cdm config', () => {
    beforeEach(() => {
      cdm(`init --project "${projectDir}"`, projectDir);
    });

    it('should display current configuration', () => {
      const out = cdm(`config --project "${projectDir}"`, projectDir);
      expect(out).toContain('CDM Configuration');
      expect(out).toContain('Language');
      expect(out).toContain('Framework');
    });

    it('should update a configuration value with --set', () => {
      cdm(`config --set execution.maxRetries=5 --project "${projectDir}"`, projectDir);
      const out = cdm(`config --project "${projectDir}"`, projectDir);
      expect(out).toContain('5');
    });

    it('should reset configuration to defaults with --reset', () => {
      cdm(`config --set execution.maxRetries=99 --project "${projectDir}"`, projectDir);
      cdm(`config --reset --project "${projectDir}"`, projectDir);
      const out = cdm(`config --project "${projectDir}"`, projectDir);
      expect(out).toContain('2');
    });
  });

  describe('cdm start --dry-run', () => {
    beforeEach(() => {
      setupMockCdmProject(projectDir);
    });

    it('should display execution plan without executing', () => {
      const out = cdm(`start "Add user authentication" --dry-run --project "${projectDir}"`, projectDir);
      expect(out).toContain('DRY RUN');
      expect(out).toContain('Persona');
    });

    it('should show persona resolution in dry run', () => {
      const out = cdm(
        `start "Add feature" --dry-run --project "${projectDir}"`,
        projectDir,
      );
      expect(out).toContain('DRY RUN');
    });
  });

  describe('cdm start (simulation mode)', () => {
    beforeEach(() => {
      setupMockCdmProject(projectDir);
    });

    it('should run the full execution in simulation mode', () => {
      const out = cdm(
        `start "Add user login" --mode simulation --no-interactive --project "${projectDir}"`,
        projectDir,
      );

      expect(out).toContain('Claude Dev Manager');
      expect(out).toContain('Add user login');
    }, 120_000);

    it('should produce artifacts visible via cdm artifacts', () => {
      cdm(
        `start "Add search API" --mode simulation --no-interactive --project "${projectDir}"`,
        projectDir,
      );

      const artifactsOut = cdm(`artifacts --project "${projectDir}"`, projectDir);
      expect(artifactsOut).toContain('Artifacts');
      const totalMatch = artifactsOut.match(/Total:\s+(\d+)/);
      expect(totalMatch).toBeTruthy();
      expect(parseInt(totalMatch![1], 10)).toBeGreaterThan(0);
    }, 120_000);

    it('should record features visible via cdm status', () => {
      cdm(
        `start "Add notifications" --mode simulation --no-interactive --project "${projectDir}"`,
        projectDir,
      );

      const statusOut = cdm(`status --project "${projectDir}"`, projectDir);
      expect(statusOut).toContain('Feature Status');
      expect(statusOut).toContain('Add notifications');
    }, 120_000);

    it('should persist state to .cdm directory', () => {
      cdm(
        `start "State test" --mode simulation --no-interactive --project "${projectDir}"`,
        projectDir,
      );

      const cdmDir = path.join(projectDir, '.cdm');
      expect(fs.existsSync(cdmDir)).toBe(true);
      expect(fs.existsSync(path.join(cdmDir, 'project.json'))).toBe(true);
      expect(fs.existsSync(path.join(cdmDir, 'features'))).toBe(true);

      const featureFiles = fs.readdirSync(path.join(cdmDir, 'features'));
      expect(featureFiles.length).toBeGreaterThan(0);

      const artifactDir = path.join(cdmDir, 'artifacts');
      if (fs.existsSync(artifactDir)) {
        const artifactFiles = fs.readdirSync(artifactDir).filter(f => f.endsWith('.json'));
        expect(artifactFiles.length).toBeGreaterThan(0);
      }
    }, 120_000);

    it('should accept priority option', () => {
      const out = cdm(
        `start "Critical fix" --mode simulation --no-interactive --priority critical --project "${projectDir}"`,
        projectDir,
      );
      expect(out).toContain('Critical fix');
    }, 120_000);
  });

  describe('cdm status', () => {
    it('should show message when no features exist', () => {
      const out = cdm(`status --project "${projectDir}"`, projectDir);
      expect(out).toContain('No features found');
    });

    it('should display features after an execution', () => {
      setupMockCdmProject(projectDir);
      cdm(
        `start "Dashboard feature" --mode simulation --no-interactive --project "${projectDir}"`,
        projectDir,
      );

      const out = cdm(`status --project "${projectDir}"`, projectDir);
      expect(out).toContain('Feature Status');
      expect(out).toContain('Dashboard feature');
      expect(out).toMatch(/Status:\s+\w+/);
      expect(out).toMatch(/Artifacts:\s+\d+/);
    }, 120_000);
  });

  describe('cdm show', () => {
    it('should show feature details by ID', () => {
      setupMockCdmProject(projectDir);
      cdm(
        `start "Show test" --mode simulation --no-interactive --project "${projectDir}"`,
        projectDir,
      );

      const featuresDir = path.join(projectDir, '.cdm', 'features');
      const featureFiles = fs.readdirSync(featuresDir).filter(f => f.endsWith('.json'));
      expect(featureFiles.length).toBeGreaterThan(0);

      const featureId = featureFiles[0].replace('.json', '');
      const out = cdm(`show ${featureId} --project "${projectDir}"`, projectDir);
      expect(out).toContain('Feature:');
      expect(out).toContain('Show test');
      expect(out).toContain('Status:');
    }, 120_000);

    it('should report when target is not found', () => {
      const out = cdm(`show nonexistent-id --project "${projectDir}"`, projectDir);
      expect(out).toContain('No artifact or feature found');
    });
  });

  describe('cdm artifacts', () => {
    it('should show empty message when no artifacts exist', () => {
      const out = cdm(`artifacts --project "${projectDir}"`, projectDir);
      expect(out).toContain('No artifacts yet');
    });
  });

  describe('multiple features', () => {
    it('should track multiple features independently', () => {
      setupMockCdmProject(projectDir);
      cdm(
        `start "Feature A" --mode simulation --no-interactive --project "${projectDir}"`,
        projectDir,
      );
      cdm(
        `start "Feature B" --mode simulation --no-interactive --project "${projectDir}"`,
        projectDir,
      );

      const statusOut = cdm(`status --project "${projectDir}"`, projectDir);
      expect(statusOut).toContain('Feature A');
      expect(statusOut).toContain('Feature B');
    }, 180_000);
  });
});
