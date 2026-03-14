import { describe, it, expect } from 'bun:test';
import { $ } from 'bun';

describe('CDM CLI', () => {
  const CLI_PATH = './dist/cli.js';

  it('cdm agents outputs agent list', async () => {
    const result = await $`node ${CLI_PATH} agents --json`.quiet();
    const output = result.stdout.toString();
    
    expect(result.exitCode).toBe(0);
    
    const agents = JSON.parse(output);
    expect(agents).toHaveLength(5);
    expect(agents[0].role).toBe('planner');
    expect(agents[1].role).toBe('architect');
    expect(agents[2].role).toBe('developer');
    expect(agents[3].role).toBe('reviewer');
    expect(agents[4].role).toBe('operator');
  });

  it('cdm agents --json outputs valid JSON', async () => {
    const result = await $`node ${CLI_PATH} agents --json`.quiet();
    const output = result.stdout.toString();
    
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('cdm skills outputs skills list', async () => {
    const result = await $`node ${CLI_PATH} skills --json`.quiet();
    const output = result.stdout.toString();
    
    expect(result.exitCode).toBe(0);
    
    const skills = JSON.parse(output);
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.some((s: { id: string }) => s.id === 'code-implementation')).toBe(true);
  });

  it('cdm skills --category design filters correctly', async () => {
    const result = await $`node ${CLI_PATH} skills --category design --json`.quiet();
    const output = result.stdout.toString();
    
    const skills = JSON.parse(output);
    expect(skills.every((s: { category: string }) => s.category === 'design')).toBe(true);
  });

  it('cdm pipeline outputs templates', async () => {
    const result = await $`node ${CLI_PATH} pipeline --json`.quiet();
    const output = result.stdout.toString();
    
    expect(result.exitCode).toBe(0);
    
    const templates = JSON.parse(output);
    expect(templates).toHaveLength(6);
    expect(templates.some((t: { id: string }) => t.id === 'quick-fix')).toBe(true);
    expect(templates.some((t: { id: string }) => t.id === 'feature')).toBe(true);
    expect(templates.some((t: { id: string }) => t.id === 'full-feature')).toBe(true);
  });

  it('cdm pipeline --template quick-fix shows template details', async () => {
    const result = await $`node ${CLI_PATH} pipeline --template quick-fix`.quiet();
    const output = result.stdout.toString();
    
    expect(result.exitCode).toBe(0);
    expect(output).toContain('Quick Fix');
  });

  it('cdm exits with code 2 for invalid template', async () => {
    try {
      await $`node ${CLI_PATH} pipeline --template invalid-template`.quiet();
    } catch (error: unknown) {
      const exitError = error as { exitCode: number };
      expect(exitError.exitCode).toBe(2);
    }
  });
});
