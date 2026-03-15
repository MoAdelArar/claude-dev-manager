import { describe, it, expect } from 'bun:test';
import { $ } from 'bun';

describe('CDM CLI Personas', () => {
  const CLI_SOURCE = './src/cli/index.tsx';

  it('cdm personas --help shows available subcommands', async () => {
    const result = await $`bunx tsx ${CLI_SOURCE} personas --help`.quiet();
    const output = result.stdout.toString();
    
    expect(result.exitCode).toBe(0);
    expect(output).toContain('list');
    expect(output).toContain('update');
    expect(output).toContain('resolve');
    expect(output).toContain('info');
  });

  it('cdm --help shows personas command', async () => {
    const result = await $`bunx tsx ${CLI_SOURCE} --help`.quiet();
    const output = result.stdout.toString();
    
    expect(result.exitCode).toBe(0);
    expect(output).toContain('personas');
    expect(output).toContain('start');
    expect(output).toContain('status');
    expect(output).toContain('resume');
  });

  it('cdm version outputs version number', async () => {
    const result = await $`bunx tsx ${CLI_SOURCE} --version`.quiet();
    const output = result.stdout.toString().trim();
    
    expect(result.exitCode).toBe(0);
    expect(output).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('cdm start --help shows available options', async () => {
    const result = await $`bunx tsx ${CLI_SOURCE} start --help`.quiet();
    const output = result.stdout.toString();
    
    expect(result.exitCode).toBe(0);
    expect(output).toContain('--dry-run');
    expect(output).toContain('--mode');
    expect(output).toContain('--persona');
    expect(output).toContain('--review');
  });

  it('cdm resume --help shows available options', async () => {
    const result = await $`bunx tsx ${CLI_SOURCE} resume --help`.quiet();
    const output = result.stdout.toString();
    
    expect(result.exitCode).toBe(0);
    expect(output).toContain('--review');
    expect(output).toContain('--mode');
  });

  it('cdm status --help shows available options', async () => {
    const result = await $`bunx tsx ${CLI_SOURCE} status --help`.quiet();
    const output = result.stdout.toString();
    
    expect(result.exitCode).toBe(0);
    expect(output).toContain('--project');
    expect(output).toContain('--json');
  });

  it('cdm config --help shows available options', async () => {
    const result = await $`bunx tsx ${CLI_SOURCE} config --help`.quiet();
    const output = result.stdout.toString();
    
    expect(result.exitCode).toBe(0);
    expect(output).toContain('--set');
    expect(output).toContain('--reset');
  });

  it('cdm artifacts --help shows available options', async () => {
    const result = await $`bunx tsx ${CLI_SOURCE} artifacts --help`.quiet();
    const output = result.stdout.toString();
    
    expect(result.exitCode).toBe(0);
    expect(output).toContain('--type');
    expect(output).toContain('--json');
  });

  it('cdm history --help shows available options', async () => {
    const result = await $`bunx tsx ${CLI_SOURCE} history --help`.quiet();
    const output = result.stdout.toString();
    
    expect(result.exitCode).toBe(0);
    expect(output).toContain('--last');
    expect(output).toContain('--json');
  });
});
