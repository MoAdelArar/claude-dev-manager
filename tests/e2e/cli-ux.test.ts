import { describe, it, expect } from 'bun:test';
import { $ } from 'bun';

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
    it('shows cost estimate for task', async () => {
      const result = await $`bunx tsx src/cli/index.tsx start "Test feature" --estimate`.quiet();
      const output = result.stdout.toString();

      expect(result.exitCode).toBe(0);
      expect(output).toContain('Cost Estimate');
    });

    it('shows persona information in estimate', async () => {
      const result = await $`bunx tsx src/cli/index.tsx start "Build React component" --estimate`.quiet();
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
