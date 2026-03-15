import { describe, it, expect } from 'bun:test';
import { PromptComposer, createPromptComposer, ComposerContext } from '../../../src/personas/composer';
import type { AgentPersona, ResolvedPersonas } from '../../../src/personas/types';
import { CloudProvider, type ProjectConfig } from '../../../src/types';

function createMockPersona(overrides: Partial<AgentPersona> = {}): AgentPersona {
  return {
    id: 'test-persona',
    division: 'engineering',
    frontmatter: {
      name: 'Test Developer',
      description: 'A test persona for unit testing',
      color: 'blue',
      emoji: '🧪',
      vibe: 'Testing everything thoroughly',
    },
    fullContent: `# Test Developer

## Identity
You are a skilled test developer who writes comprehensive tests.

## Core Mission
Write clean, maintainable, well-tested code.

## Critical Rules
- Always write unit tests
- Follow coding standards
- Document your work`,
    tags: ['test', 'developer', 'engineering'],
    filePath: 'engineering/test-developer.md',
    ...overrides,
  };
}

function createMockReviewPersona(): AgentPersona {
  return {
    id: 'test-reviewer',
    division: 'testing',
    frontmatter: {
      name: 'Code Reviewer',
      description: 'Reviews code for quality',
      color: 'green',
      emoji: '👁️',
      vibe: 'Quality is non-negotiable',
    },
    fullContent: `# Code Reviewer

## Core Mission
Ensure code quality through thorough reviews.

## Critical Rules
- Check for bugs
- Verify test coverage
- Ensure best practices followed
- Must validate error handling
- Should verify edge cases`,
    tags: ['review', 'quality', 'testing'],
    filePath: 'testing/code-reviewer.md',
  };
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

const defaultContext: ComposerContext = {
  projectConfig: defaultProjectConfig,
  featureId: 'feat-123',
  featureName: 'Test Feature',
};

describe('PromptComposer', () => {
  describe('compose', () => {
    it('should compose a prompt with primary persona', () => {
      const composer = new PromptComposer();
      const resolved: ResolvedPersonas = {
        primary: createMockPersona(),
        supporting: [],
        reviewLens: [],
        reason: 'Best match',
        needsReviewPass: false,
      };

      const prompt = composer.compose(resolved, defaultContext, 'Build a new feature');

      expect(prompt).toContain('Test Developer');
      expect(prompt).toContain('Testing everything thoroughly');
      expect(prompt).toContain('Build a new feature');
    });

    it('should include project context in prompt', () => {
      const composer = new PromptComposer();
      const resolved: ResolvedPersonas = {
        primary: createMockPersona(),
        supporting: [],
        reviewLens: [],
        reason: 'Best match',
        needsReviewPass: false,
      };

      const prompt = composer.compose(resolved, defaultContext, 'Build a feature');

      expect(prompt).toContain('typescript');
      expect(prompt).toContain('react');
      expect(prompt).toContain('jest');
    });

    it('should include supporting personas when provided', () => {
      const composer = new PromptComposer();
      const supportingPersona = createMockPersona({
        id: 'supporting-persona',
        frontmatter: {
          name: 'Supporting Expert',
          description: 'Provides additional expertise',
          color: 'purple',
          emoji: '🎯',
          vibe: 'Here to help',
        },
        fullContent: '# Supporting Expert\n\n## Core Mission\nProvide expertise.',
      });

      const resolved: ResolvedPersonas = {
        primary: createMockPersona(),
        supporting: [supportingPersona],
        reviewLens: [],
        reason: 'Best match',
        needsReviewPass: false,
      };

      const prompt = composer.compose(resolved, defaultContext, 'Build a feature');

      expect(prompt).toContain('Supporting Expertise');
      expect(prompt).toContain('Supporting Expert');
    });

    it('should include self-review checklist when review personas provided', () => {
      const composer = new PromptComposer();
      const resolved: ResolvedPersonas = {
        primary: createMockPersona(),
        supporting: [],
        reviewLens: [createMockReviewPersona()],
        reason: 'Best match',
        needsReviewPass: true,
      };

      const prompt = composer.compose(resolved, defaultContext, 'Build a feature');

      expect(prompt).toContain('Self-Review Checklist');
      expect(prompt).toContain('[ ]');
    });

    it('should include output format section', () => {
      const composer = new PromptComposer();
      const resolved: ResolvedPersonas = {
        primary: createMockPersona(),
        supporting: [],
        reviewLens: [],
        reason: 'Best match',
        needsReviewPass: false,
      };

      const prompt = composer.compose(resolved, defaultContext, 'Build a feature');

      expect(prompt).toContain('Output Format');
      expect(prompt).toContain('ARTIFACT_START');
      expect(prompt).toContain('ARTIFACT_END');
      expect(prompt).toContain('ISSUE_START');
      expect(prompt).toContain('ISSUE_END');
    });

    it('should include feature ID and name in task section', () => {
      const composer = new PromptComposer();
      const resolved: ResolvedPersonas = {
        primary: createMockPersona(),
        supporting: [],
        reviewLens: [],
        reason: 'Best match',
        needsReviewPass: false,
      };

      const prompt = composer.compose(resolved, defaultContext, 'Build a feature');

      expect(prompt).toContain('feat-123');
      expect(prompt).toContain('Test Feature');
    });

    it('should include custom instructions when provided', () => {
      const composer = new PromptComposer();
      const context: ComposerContext = {
        ...defaultContext,
        projectConfig: {
          ...defaultProjectConfig,
          customInstructions: 'Always use async/await',
        },
      };

      const resolved: ResolvedPersonas = {
        primary: createMockPersona(),
        supporting: [],
        reviewLens: [],
        reason: 'Best match',
        needsReviewPass: false,
      };

      const prompt = composer.compose(resolved, context, 'Build a feature');

      expect(prompt).toContain('Always use async/await');
    });

    it('should include code style content when provided', () => {
      const composer = new PromptComposer();
      const context: ComposerContext = {
        ...defaultContext,
        codeStyleContent: '2 space indentation, semicolons required',
      };

      const resolved: ResolvedPersonas = {
        primary: createMockPersona(),
        supporting: [],
        reviewLens: [],
        reason: 'Best match',
        needsReviewPass: false,
      };

      const prompt = composer.compose(resolved, context, 'Build a feature');

      expect(prompt).toContain('Code Conventions');
      expect(prompt).toContain('2 space indentation');
    });

    it('should include analysis content when provided', () => {
      const composer = new PromptComposer();
      const context: ComposerContext = {
        ...defaultContext,
        analysisContent: 'Uses repository pattern for data access',
      };

      const resolved: ResolvedPersonas = {
        primary: createMockPersona(),
        supporting: [],
        reviewLens: [],
        reason: 'Best match',
        needsReviewPass: false,
      };

      const prompt = composer.compose(resolved, context, 'Build a feature');

      expect(prompt).toContain('Architecture Notes');
      expect(prompt).toContain('repository pattern');
    });
  });

  describe('composeReviewPrompt', () => {
    it('should compose a review prompt with first pass output', () => {
      const composer = new PromptComposer();
      const resolved: ResolvedPersonas = {
        primary: createMockPersona(),
        supporting: [],
        reviewLens: [createMockReviewPersona()],
        reason: 'Best match',
        needsReviewPass: true,
      };

      const firstPassOutput = 'Here is the implementation code...';
      const prompt = composer.composeReviewPrompt(
        resolved,
        firstPassOutput,
        defaultContext,
        'Build a feature',
      );

      expect(prompt).toContain('Code Reviewer');
      expect(prompt).toContain('Review Pass');
      expect(prompt).toContain('Original Task');
      expect(prompt).toContain('Implementation to Review');
      expect(prompt).toContain(firstPassOutput);
    });

    it('should include review instructions', () => {
      const composer = new PromptComposer();
      const resolved: ResolvedPersonas = {
        primary: createMockPersona(),
        supporting: [],
        reviewLens: [createMockReviewPersona()],
        reason: 'Best match',
        needsReviewPass: true,
      };

      const prompt = composer.composeReviewPrompt(
        resolved,
        'Implementation output',
        defaultContext,
        'Build a feature',
      );

      expect(prompt).toContain('Review Instructions');
      expect(prompt).toContain('ISSUE_START/ISSUE_END');
    });

    it('should use primary persona as fallback if no review personas', () => {
      const composer = new PromptComposer();
      const resolved: ResolvedPersonas = {
        primary: createMockPersona(),
        supporting: [],
        reviewLens: [],
        reason: 'Best match',
        needsReviewPass: true,
      };

      const prompt = composer.composeReviewPrompt(
        resolved,
        'Implementation output',
        defaultContext,
        'Build a feature',
      );

      expect(prompt).toContain('Test Developer');
    });

    it('should truncate very long first pass output', () => {
      const composer = new PromptComposer();
      const resolved: ResolvedPersonas = {
        primary: createMockPersona(),
        supporting: [],
        reviewLens: [createMockReviewPersona()],
        reason: 'Best match',
        needsReviewPass: true,
      };

      const longOutput = 'x'.repeat(20000);
      const prompt = composer.composeReviewPrompt(
        resolved,
        longOutput,
        defaultContext,
        'Build a feature',
      );

      expect(prompt.length).toBeLessThan(longOutput.length + 5000);
      expect(prompt).toContain('truncated');
    });
  });

  describe('createPromptComposer factory', () => {
    it('should create a PromptComposer instance', () => {
      const composer = createPromptComposer();
      expect(composer).toBeInstanceOf(PromptComposer);
    });
  });
});
