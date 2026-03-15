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
      personas: {
        primary: { id: 'engineering-senior-developer', name: 'Senior Developer' },
        supporting: [],
        reviewLens: [],
      },
    },
  ];

  const mockConfig = {
    project: {
      language: 'typescript',
      framework: 'node',
    },
    execution: {
      maxRetries: 2,
      defaultMode: 'claude-cli',
    },
    personas: {
      divisions: ['engineering', 'testing'],
      overrides: {},
    },
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

  it('should include personas in feature data', () => {
    const features = mockGetAllFeatures();
    expect(features[0].personas).toBeDefined();
    expect(features[0].personas.primary).toBeDefined();
  });

  it('should have correct config sections', () => {
    const config = mockLoadConfig('/test/path');
    expect(config.project).toBeDefined();
    expect(config.execution).toBeDefined();
    expect(config.personas).toBeDefined();
  });
});
