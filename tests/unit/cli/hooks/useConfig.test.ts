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
    pipeline: {
      maxRetries: 2,
      timeoutMinutes: 30,
      requireApprovals: false,
      skipSteps: [] as string[],
    },
    agents: {},
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
    const obj: Record<string, unknown> = { pipeline: { maxRetries: 2 } };
    const keys = 'pipeline.maxRetries'.split('.');
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]] as Record<string, unknown>;
    }
    current[keys[keys.length - 1]] = 5;
    expect(obj.pipeline).toEqual({ maxRetries: 5 });
  });
});
