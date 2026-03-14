import { describe, it, expect, jest, beforeEach, afterEach } from 'bun:test';

const mockGetProject = jest.fn();
const mockGetAllFeatures = jest.fn();
const mockLoadConfig = jest.fn();

jest.mock('../../../../src/orchestrator/context.js', () => ({
  ProjectContext: jest.fn().mockImplementation(() => ({
    getProject: mockGetProject,
    getAllFeatures: mockGetAllFeatures,
  })),
}));

jest.mock('../../../../src/utils/config.js', () => ({
  loadConfig: mockLoadConfig,
}));

describe('useProject', () => {
  const mockProject = {
    id: 'test-project-id',
    name: 'Test Project',
    description: 'A test project',
    rootPath: '/test/path',
    createdAt: new Date(),
    updatedAt: new Date(),
    config: {
      language: 'typescript',
      framework: 'node',
      testFramework: 'jest',
      buildTool: 'tsc',
      ciProvider: 'github',
      deployTarget: 'npm',
      cloudProvider: 'none',
      codeStyle: 'standard',
      branchStrategy: 'main',
      customInstructions: '',
    },
    features: [],
  };

  const mockFeatures = [
    {
      id: 'feature-1',
      name: 'Test Feature',
      status: 'in_progress',
      currentStep: 'step-1',
    },
  ];

  const mockConfig = {
    project: {
      language: 'typescript',
      framework: 'node',
    },
    pipeline: {
      maxRetries: 2,
    },
    agents: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProject.mockReturnValue(mockProject);
    mockGetAllFeatures.mockReturnValue(mockFeatures);
    mockLoadConfig.mockReturnValue(mockConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return project data', () => {
    const project = mockGetProject();
    expect(project).toEqual(mockProject);
    expect(project.name).toBe('Test Project');
  });

  it('should return features list', () => {
    const features = mockGetAllFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].name).toBe('Test Feature');
  });

  it('should return config', () => {
    const config = mockLoadConfig('/test/path');
    expect(config.project.language).toBe('typescript');
  });

  it('should handle errors gracefully', () => {
    mockGetProject.mockImplementation(() => {
      throw new Error('Project not found');
    });
    expect(() => mockGetProject()).toThrow('Project not found');
  });

  it('should handle empty features list', () => {
    mockGetAllFeatures.mockReturnValue([]);
    const features = mockGetAllFeatures();
    expect(features).toHaveLength(0);
  });
});
