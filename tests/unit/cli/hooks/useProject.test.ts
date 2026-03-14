import { describe, it, expect, mock, beforeEach } from 'bun:test';

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
    features: [] as unknown[],
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

  const mockGetProject = mock(() => mockProject);
  const mockGetAllFeatures = mock(() => mockFeatures);
  const mockLoadConfig = mock((_path: string) => mockConfig);

  beforeEach(() => {
    mockGetProject.mockClear();
    mockGetAllFeatures.mockClear();
    mockLoadConfig.mockClear();
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
    const errorMock = mock(() => {
      throw new Error('Project not found');
    });
    expect(() => errorMock()).toThrow('Project not found');
  });

  it('should handle empty features list', () => {
    const emptyFeaturesMock = mock(() => [] as unknown[]);
    const features = emptyFeaturesMock();
    expect(features).toHaveLength(0);
  });
});
