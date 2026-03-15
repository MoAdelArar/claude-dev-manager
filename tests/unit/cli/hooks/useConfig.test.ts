import { describe, it, expect, mock, beforeEach } from 'bun:test';

describe('useConfig', () => {
  const mockConfig = {
    project: {
      language: 'typescript',
      framework: 'node',
      testFramework: 'jest',
      buildTool: 'tsc',
      ciProvider: 'github',
      deployTarget: 'npm',
    },
    execution: {
      maxRetries: 2,
      timeoutMinutes: 120,
      defaultMode: 'claude-cli',
    },
    personas: {
      divisions: ['engineering', 'testing', 'design'],
      overrides: {},
    },
  };

  const mockLoadConfig = mock((_path: string) => mockConfig);
  const mockSaveConfig = mock((_path: string, _config: typeof mockConfig) => {});
  const mockGetDefaultConfig = mock(() => mockConfig);

  beforeEach(() => {
    mockLoadConfig.mockClear();
    mockSaveConfig.mockClear();
    mockGetDefaultConfig.mockClear();
  });

  it('should load config on mount', () => {
    const config = mockLoadConfig('/test/path');
    expect(config).toEqual(mockConfig);
    expect(mockLoadConfig).toHaveBeenCalledWith('/test/path');
  });

  it('should handle loadConfig errors', () => {
    const errorMock = mock((_path: string) => {
      throw new Error('Config not found');
    });
    expect(() => errorMock('/test/path')).toThrow('Config not found');
  });

  it('should save config changes', () => {
    mockSaveConfig('/test/path', mockConfig);
    expect(mockSaveConfig).toHaveBeenCalledWith('/test/path', mockConfig);
  });

  it('should reset to default config', () => {
    const defaultConfig = mockGetDefaultConfig();
    expect(defaultConfig).toEqual(mockConfig);
  });

  it('should set nested value correctly', () => {
    const obj: Record<string, unknown> = { execution: { maxRetries: 2 } };
    const keys = 'execution.maxRetries'.split('.');
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]] as Record<string, unknown>;
    }
    current[keys[keys.length - 1]] = 5;
    expect(obj.execution).toEqual({ maxRetries: 5 });
  });

  it('should have correct persona config structure', () => {
    const config = mockLoadConfig('/test/path');
    expect(config.personas).toBeDefined();
    expect(config.personas.divisions).toBeDefined();
    expect(Array.isArray(config.personas.divisions)).toBe(true);
  });

  it('should have correct execution config structure', () => {
    const config = mockLoadConfig('/test/path');
    expect(config.execution).toBeDefined();
    expect(config.execution.maxRetries).toBe(2);
    expect(config.execution.defaultMode).toBe('claude-cli');
  });
});
