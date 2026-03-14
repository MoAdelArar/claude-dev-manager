import { describe, it, expect } from 'bun:test';
import { $ } from 'bun';

describe('CLI UX Commands', () => {
  const CLI_PATH = './dist/cli/index.js';

  describe('cdm completion', () => {
    it('shows help when no shell specified', async () => {
      const result = await $`npx tsx src/cli/index.tsx completion`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('Shell Completion');
      expect(output).toContain('bash');
      expect(output).toContain('zsh');
      expect(output).toContain('fish');
    });

    it('generates bash completion script', async () => {
      const result = await $`npx tsx src/cli/index.tsx completion bash`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('_cdm_completions');
      expect(output).toContain('complete -F');
    });

    it('generates zsh completion script', async () => {
      const result = await $`npx tsx src/cli/index.tsx completion zsh`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('#compdef cdm');
      expect(output).toContain('_cdm');
    });

    it('generates fish completion script', async () => {
      const result = await $`npx tsx src/cli/index.tsx completion fish`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('complete -c cdm');
    });
  });

  describe('cdm start --estimate', () => {
    it('shows cost estimate for feature template', async () => {
      const result = await $`npx tsx src/cli/index.tsx start "Test feature" --estimate --template feature`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('Pipeline Cost Estimate');
      expect(output).toContain('Feature');
      expect(output).toContain('Est. tokens');
      expect(output).toContain('Est. cost');
      expect(output).toContain('Est. time');
    });

    it('shows cost estimate for quick-fix template', async () => {
      const result = await $`npx tsx src/cli/index.tsx start "Fix bug" --estimate --template quick-fix`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('Quick Fix');
      expect(output).toContain('2 steps');
    });

    it('auto-detects template from description', async () => {
      const result = await $`npx tsx src/cli/index.tsx start "Fix login bug" --estimate`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('Quick Fix');
    });
  });

  describe('cdm --help', () => {
    it('shows completion command in help', async () => {
      const result = await $`npx tsx src/cli/index.tsx --help`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('completion');
    });

    it('shows dashboard command in help', async () => {
      const result = await $`npx tsx src/cli/index.tsx --help`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('dashboard');
    });

    it('shows estimate flag in start help', async () => {
      const result = await $`npx tsx src/cli/index.tsx start --help`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('--estimate');
    });
  });
});
