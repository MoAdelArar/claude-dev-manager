import { execSync, ExecSyncOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CLI_PATH = path.join(PROJECT_ROOT, 'dist', 'cli.js');

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

function cdm(args: string, projectDir: string): string {
  const opts: ExecSyncOptions = {
    cwd: projectDir,
    env: { ...process.env, NODE_ENV: 'test', FORCE_COLOR: '0' },
    timeout: 60_000,
  };
  return execSync(`node "${CLI_PATH}" ${args}`, opts).toString();
}

function cleanDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('CDM CLI — End-to-End', () => {
  let projectDir: string;

  beforeAll(() => {
    const built = fs.existsSync(CLI_PATH);
    if (!built) {
      execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'pipe' });
    }
  });

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanDir(projectDir);
  });

  // ── Help & Version ──────────────────────────────────────────────────────

  describe('help and version', () => {
    it('should print help when invoked with no arguments', () => {
      const out = cdm('--help', projectDir);
      expect(out).toContain('cdm');
      expect(out).toContain('Claude Dev Manager');
      expect(out).toContain('start');
      expect(out).toContain('status');
      expect(out).toContain('agents');
      expect(out).toContain('init');
      expect(out).toContain('artifacts');
      expect(out).toContain('pipeline');
      expect(out).toContain('resume');
      expect(out).toContain('show');
      expect(out).toContain('config');
    });

    it('should print version', () => {
      const out = cdm('--version', projectDir);
      expect(out.trim()).toBe('1.0.0');
    });
  });

  // ── cdm agents ──────────────────────────────────────────────────────────

  describe('cdm agents', () => {
    it('should list all 11 agents with descriptions', () => {
      const out = cdm('agents', projectDir);
      expect(out).toContain('Agent Team');
      expect(out).toContain('Product Manager');
      expect(out).toContain('Engineering Manager');
      expect(out).toContain('System Architect');
      expect(out).toContain('UI/UX Designer');
      expect(out).toContain('Senior Developer');
      expect(out).toContain('Junior Developer');
      expect(out).toContain('Code Reviewer');
      expect(out).toContain('QA Engineer');
      expect(out).toContain('Security Engineer');
      expect(out).toContain('DevOps Engineer');
      expect(out).toContain('Documentation Writer');
    });
  });

  // ── cdm pipeline ────────────────────────────────────────────────────────

  describe('cdm pipeline', () => {
    it('should display all 10 pipeline stages in order', () => {
      const out = cdm('pipeline', projectDir);
      expect(out).toContain('Development Pipeline');
      expect(out).toContain('Requirements Gathering');
      expect(out).toContain('Architecture Design');
      expect(out).toContain('Implementation');
      expect(out).toContain('Code Review');
      expect(out).toContain('Testing');
      expect(out).toContain('Deployment');

      const reqIdx = out.indexOf('Requirements Gathering');
      const archIdx = out.indexOf('Architecture Design');
      const implIdx = out.indexOf('Implementation');
      const deployIdx = out.indexOf('Deployment');
      expect(reqIdx).toBeLessThan(archIdx);
      expect(archIdx).toBeLessThan(implIdx);
      expect(implIdx).toBeLessThan(deployIdx);
    });
  });

  // ── cdm init ────────────────────────────────────────────────────────────

  describe('cdm init', () => {
    it('should initialize CDM in a project directory', () => {
      const out = cdm(`init --project "${projectDir}"`, projectDir);

      expect(out).toContain('Initializing Claude Dev Manager');
      expect(out).toContain('cdm.config.yaml');
      expect(out).toContain('agent instruction files');
      expect(out).toContain('CLAUDE.md');
      expect(out).toContain('CDM initialized');

      expect(fs.existsSync(path.join(projectDir, 'cdm.config.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'agents'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.cdm'))).toBe(true);
    });

    it('should detect project language and framework from package.json', () => {
      const out = cdm(`init --project "${projectDir}"`, projectDir);
      expect(out).toContain('typescript');
    });

    it('should generate agent instruction files for all agents', () => {
      cdm(`init --project "${projectDir}"`, projectDir);
      const agentsDir = path.join(projectDir, 'agents');
      const files = fs.readdirSync(agentsDir);
      expect(files.length).toBeGreaterThanOrEqual(11);
      expect(files.some(f => f.includes('product-manager'))).toBe(true);
      expect(files.some(f => f.includes('senior-developer'))).toBe(true);
      expect(files.some(f => f.includes('qa-engineer'))).toBe(true);
    });

    it('should generate a valid cdm.config.yaml', () => {
      cdm(`init --project "${projectDir}"`, projectDir);
      const configPath = path.join(projectDir, 'cdm.config.yaml');
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('project');
      expect(content).toContain('pipeline');
      expect(content).toContain('agents');
    });

    it('should generate a CLAUDE.md with team structure', () => {
      cdm(`init --project "${projectDir}"`, projectDir);
      const claudeMd = fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf-8');
      expect(claudeMd).toContain('Team Structure');
      expect(claudeMd).toContain('Development Pipeline');
      expect(claudeMd).toContain('Artifact Format');
      expect(claudeMd).toContain('ARTIFACT_START');
    });
  });

  // ── cdm config ──────────────────────────────────────────────────────────

  describe('cdm config', () => {
    beforeEach(() => {
      cdm(`init --project "${projectDir}"`, projectDir);
    });

    it('should display current configuration', () => {
      const out = cdm(`config --project "${projectDir}"`, projectDir);
      expect(out).toContain('CDM Configuration');
      expect(out).toContain('Language');
      expect(out).toContain('Framework');
      expect(out).toContain('Max retries');
      expect(out).toContain('Agents');
    });

    it('should update a configuration value with --set', () => {
      cdm(`config --set pipeline.maxRetries=5 --project "${projectDir}"`, projectDir);
      const out = cdm(`config --project "${projectDir}"`, projectDir);
      expect(out).toContain('5');
    });

    it('should reset configuration to defaults with --reset', () => {
      cdm(`config --set pipeline.maxRetries=99 --project "${projectDir}"`, projectDir);
      cdm(`config --reset --project "${projectDir}"`, projectDir);
      const out = cdm(`config --project "${projectDir}"`, projectDir);
      expect(out).toContain('2');
    });
  });

  // ── cdm start (dry run) ────────────────────────────────────────────────

  describe('cdm start --dry-run', () => {
    it('should display pipeline plan without executing', () => {
      const out = cdm(`start "Add user authentication" --dry-run --project "${projectDir}"`, projectDir);
      expect(out).toContain('DRY RUN');
      expect(out).toContain('Requirements Gathering');
      expect(out).toContain('Product Manager');
      expect(out).toContain('Deployment');
    });

    it('should show skipped stages in dry run', () => {
      const out = cdm(
        `start "Add feature" --dry-run --skip ui_ux_design,security_review --project "${projectDir}"`,
        projectDir,
      );
      expect(out).toContain('DRY RUN');
      expect(out).toContain('SKIP');
    });
  });

  // ── cdm start (simulation mode, full pipeline) ─────────────────────────

  describe('cdm start (simulation mode)', () => {
    it('should run the full pipeline end-to-end in simulation mode', () => {
      const out = cdm(
        `start "Add user login" --mode simulation --no-interactive --project "${projectDir}"`,
        projectDir,
      );

      expect(out).toContain('Claude Dev Manager');
      expect(out).toContain('Add user login');
      expect(out).toContain('Pipeline Execution');
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

  // ── cdm status ──────────────────────────────────────────────────────────

  describe('cdm status', () => {
    it('should show message when no features exist', () => {
      const out = cdm(`status --project "${projectDir}"`, projectDir);
      expect(out).toContain('No features found');
    });

    it('should display features after a pipeline run', () => {
      cdm(
        `start "Dashboard feature" --mode simulation --no-interactive --project "${projectDir}"`,
        projectDir,
      );

      const out = cdm(`status --project "${projectDir}"`, projectDir);
      expect(out).toContain('Feature Status');
      expect(out).toContain('Dashboard feature');
      expect(out).toMatch(/Status:\s+\w+/);
      expect(out).toMatch(/Stage:/);
      expect(out).toMatch(/Artifacts:\s+\d+/);
    }, 120_000);
  });

  // ── cdm show ────────────────────────────────────────────────────────────

  describe('cdm show', () => {
    it('should show feature details by ID', () => {
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

  // ── cdm artifacts ───────────────────────────────────────────────────────

  describe('cdm artifacts', () => {
    it('should show empty message when no artifacts exist', () => {
      const out = cdm(`artifacts --project "${projectDir}"`, projectDir);
      expect(out).toContain('No artifacts yet');
    });
  });

  // ── Multiple features ──────────────────────────────────────────────────

  describe('multiple features', () => {
    it('should track multiple features independently', () => {
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
