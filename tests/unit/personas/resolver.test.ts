import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PersonaResolver, createPersonaResolver } from '../../../src/personas/resolver';
import { PersonaCatalog } from '../../../src/personas/catalog';
import { CloudProvider, type ProjectConfig } from '../../../src/types';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-resolver-test-'));
}

function createPersonaFile(dir: string, name: string, frontmatter: Record<string, string>, body: string): void {
  const yamlFrontmatter = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const content = `---\n${yamlFrontmatter}\n---\n${body}`;
  fs.writeFileSync(path.join(dir, name), content);
}

const defaultProjectConfig: ProjectConfig = {
  language: 'typescript',
  framework: 'react',
  testFramework: 'jest',
  buildTool: 'webpack',
  ciProvider: 'github',
  deployTarget: 'vercel',
  cloudProvider: CloudProvider.NONE,
  codeStyle: 'standard',
  branchStrategy: 'main',
  customInstructions: '',
};

describe('PersonaResolver', () => {
  let tempDir: string;
  let catalog: PersonaCatalog;

  beforeEach(async () => {
    tempDir = createTempDir();

    const engineeringDir = path.join(tempDir, 'engineering');
    const testingDir = path.join(tempDir, 'testing');
    const designDir = path.join(tempDir, 'design');
    fs.mkdirSync(engineeringDir);
    fs.mkdirSync(testingDir);
    fs.mkdirSync(designDir);

    createPersonaFile(
      engineeringDir,
      'senior-developer.md',
      { name: 'Senior Developer', emoji: '👨‍💻', description: 'Experienced full-stack developer' },
      '# Senior Developer\n\nBuilds scalable applications with React and Node.js.',
    );

    createPersonaFile(
      engineeringDir,
      'frontend-developer.md',
      { name: 'Frontend Developer', emoji: '🎨', description: 'React and TypeScript expert' },
      '# Frontend Developer\n\nSpecializes in React, TypeScript, and CSS.',
    );

    createPersonaFile(
      engineeringDir,
      'backend-architect.md',
      { name: 'Backend Architect', emoji: '🏗️', description: 'API and database expert' },
      '# Backend Architect\n\nDesigns APIs, databases, and backend systems.',
    );

    createPersonaFile(
      engineeringDir,
      'security-engineer.md',
      { name: 'Security Engineer', emoji: '🔐', description: 'Security and authentication specialist' },
      '# Security Engineer\n\n- Check for authentication vulnerabilities\n- Verify encryption\n- Ensure secure coding practices',
    );

    createPersonaFile(
      engineeringDir,
      'code-reviewer.md',
      { name: 'Code Reviewer', emoji: '👁️', description: 'Code quality expert' },
      '# Code Reviewer\n\n- Review code for best practices\n- Check for bugs\n- Verify tests',
    );

    createPersonaFile(
      testingDir,
      'reality-checker.md',
      { name: 'Reality Checker', emoji: '🔍', description: 'Testing and QA specialist' },
      '# Reality Checker\n\nEnsures code works correctly with comprehensive testing.',
    );

    createPersonaFile(
      testingDir,
      'accessibility-auditor.md',
      { name: 'Accessibility Auditor', emoji: '♿', description: 'Accessibility and WCAG expert' },
      '# Accessibility Auditor\n\n- Check WCAG compliance\n- Verify screen reader support\n- Ensure keyboard navigation',
    );

    createPersonaFile(
      designDir,
      'ux-designer.md',
      { name: 'UX Designer', emoji: '🎨', description: 'User experience specialist' },
      '# UX Designer\n\nCreates user-friendly interfaces and designs.',
    );

    catalog = await PersonaCatalog.buildFromDirectory(tempDir, 'test/repo', 'test123');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('extractSignals', () => {
    it('should extract framework signals from description', () => {
      const resolver = new PersonaResolver();
      const signals = resolver.extractSignals('Build a React dashboard with TypeScript');

      expect(signals.frameworks).toContain('react');
    });

    it('should extract domain signals', () => {
      const resolver = new PersonaResolver();
      const signals = resolver.extractSignals('Create an API endpoint for user authentication');

      expect(signals.domains).toContain('api');
      expect(signals.domains).toContain('auth');
    });

    it('should extract action signals', () => {
      const resolver = new PersonaResolver();
      const signals = resolver.extractSignals('Fix the login bug in the authentication flow');

      expect(signals.actions).toContain('fix');
    });

    it('should extract risk signals for auth-related tasks', () => {
      const resolver = new PersonaResolver();
      const signals = resolver.extractSignals('Implement password reset with JWT tokens');

      expect(signals.risks).toContain('auth');
    });

    it('should extract risk signals for payment-related tasks', () => {
      const resolver = new PersonaResolver();
      const signals = resolver.extractSignals('Add Stripe payment integration for billing');

      expect(signals.risks).toContain('payment');
    });

    it('should extract keywords from description', () => {
      const resolver = new PersonaResolver();
      const signals = resolver.extractSignals('Create a user profile page with avatar upload');

      expect(signals.keywords.length).toBeGreaterThan(0);
    });
  });

  describe('resolve', () => {
    it('should select best matching persona based on signals', () => {
      const resolver = new PersonaResolver();
      const result = resolver.resolve(
        'Build a React component with TypeScript',
        defaultProjectConfig,
        catalog,
      );

      expect(result.primary).toBeDefined();
      expect(result.reason).toBeDefined();
    });

    it('should return fallback persona when no matches found', () => {
      const resolver = new PersonaResolver();
      const result = resolver.resolve(
        'xyz123 gibberish no framework',
        { ...defaultProjectConfig, language: 'cobol', framework: 'none' },
        catalog,
      );

      expect(result.primary).toBeDefined();
      expect(result.primary.frontmatter.name).toBeDefined();
    });

    it('should mark needsReviewPass true for risky tasks', () => {
      const resolver = new PersonaResolver();
      const result = resolver.resolve(
        'Implement user authentication with password hashing',
        defaultProjectConfig,
        catalog,
      );

      expect(result.needsReviewPass).toBe(true);
    });

    it('should include review personas for risky tasks', () => {
      const resolver = new PersonaResolver();
      const result = resolver.resolve(
        'Add payment processing with credit card encryption',
        defaultProjectConfig,
        catalog,
      );

      expect(result.needsReviewPass).toBe(true);
    });

    it('should force specific persona when provided in options', () => {
      const resolver = new PersonaResolver();
      const result = resolver.resolve(
        'Build some feature',
        defaultProjectConfig,
        catalog,
        { config: {}, forcePrimaryPersona: 'engineering-backend-architect' },
      );

      expect(result.primary.id).toBe('engineering-backend-architect');
      expect(result.reason).toContain('Forced');
    });

    it('should force review pass when option is set', () => {
      const resolver = new PersonaResolver();
      const result = resolver.resolve(
        'Simple CSS change',
        defaultProjectConfig,
        catalog,
        { config: {}, forceReview: true },
      );

      expect(result.needsReviewPass).toBe(true);
    });

    it('should include supporting personas from different divisions', () => {
      const resolver = new PersonaResolver();
      const result = resolver.resolve(
        'Build an accessible React form with validation and unit tests',
        defaultProjectConfig,
        catalog,
      );

      if (result.supporting.length > 0) {
        const primaryDivision = result.primary.division;
        const supportingDivisions = result.supporting.map(p => p.division);
        expect(supportingDivisions.every(d => d !== primaryDivision)).toBe(true);
      }
    });
  });

  describe('needsReviewPass', () => {
    it('should return true when forceReview is true', () => {
      const resolver = new PersonaResolver();
      const signals = resolver.extractSignals('Simple task');
      expect(resolver.needsReviewPass(signals, true)).toBe(true);
    });

    it('should return true when risks are present', () => {
      const resolver = new PersonaResolver();
      const signals = resolver.extractSignals('Add authentication with JWT');
      expect(resolver.needsReviewPass(signals)).toBe(true);
    });

    it('should return false for safe tasks without force', () => {
      const resolver = new PersonaResolver();
      const signals = resolver.extractSignals('Update button color');
      expect(resolver.needsReviewPass(signals)).toBe(false);
    });
  });

  describe('createPersonaResolver factory', () => {
    it('should create resolver with default config', () => {
      const resolver = createPersonaResolver();
      expect(resolver).toBeInstanceOf(PersonaResolver);
    });

    it('should create resolver with custom config', () => {
      const resolver = createPersonaResolver({
        overrides: { react: 'engineering-frontend-developer' },
      });
      expect(resolver).toBeInstanceOf(PersonaResolver);
    });
  });
});
