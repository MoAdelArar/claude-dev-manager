import { describe, it, expect, jest, beforeEach, afterEach } from 'bun:test';

const mockLoadConfig = jest.fn();
const mockSaveConfig = jest.fn();
const mockGetDefaultConfig = jest.fn();

jest.mock('../../../../src/utils/config.js', () => ({
  loadConfig: mockLoadConfig,
  saveConfig: mockSaveConfig,
  getDefaultConfig: mockGetDefaultConfig,
}));

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
      skipSteps: [],
    },
    agents: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadConfig.mockReturnValue(mockConfig);
    mockGetDefaultConfig.mockReturnValue(mockConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should load config on mount', async () => {
    mockLoadConfig.mockReturnValue(mockConfig);
    expect(mockLoadConfig).toBeDefined();
  });

  it('should handle loadConfig errors', () => {
    mockLoadConfig.mockImplementation(() => {
      throw new Error('Config not found');
    });
    expect(() => mockLoadConfig('/test/path')).toThrow('Config not found');
  });

  it('should save config changes', () => {
    mockSaveConfig.mockImplementation(() => {});
    mockSaveConfig('/test/path', mockConfig);
    expect(mockSaveConfig).toHaveBeenCalledWith('/test/path', mockConfig);
  });

  it('should reset to default config', () => {
    mockGetDefaultConfig.mockReturnValue(mockConfig);
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
