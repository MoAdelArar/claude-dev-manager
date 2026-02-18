import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  Project,
  ProjectConfig,
  Feature,
  FeatureStatus,
  FeaturePriority,
  PipelineStage,
  StageResult,
  StageStatus,
  CloudProvider,
} from '../types';
import logger from '../utils/logger';

export class ProjectContext {
  private project: Project;
  private features: Map<string, Feature> = new Map();
  private readonly stateDir: string;

  constructor(projectPath: string, projectName?: string) {
    this.stateDir = path.join(projectPath, '.cdm');
    this.ensureStateDir();

    const existingProject = this.loadProject();
    if (existingProject) {
      this.project = existingProject;
      this.loadFeatures();
    } else {
      this.project = {
        id: uuidv4(),
        name: projectName ?? path.basename(projectPath),
        description: '',
        rootPath: projectPath,
        createdAt: new Date(),
        updatedAt: new Date(),
        config: this.detectProjectConfig(projectPath),
        features: [],
      };
      this.saveProject();
    }
  }

  getProject(): Project {
    return this.project;
  }

  updateProject(updates: Partial<Project>): void {
    Object.assign(this.project, updates, { updatedAt: new Date() });
    this.saveProject();
  }

  createFeature(
    name: string,
    description: string,
    priority: FeaturePriority = FeaturePriority.MEDIUM,
  ): Feature {
    const feature: Feature = {
      id: uuidv4(),
      projectId: this.project.id,
      name,
      description,
      requestedBy: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
      currentStage: PipelineStage.REQUIREMENTS_GATHERING,
      stageResults: new Map(),
      artifacts: [],
      issues: [],
      status: FeatureStatus.DRAFT,
      priority,
      metadata: {},
    };

    this.features.set(feature.id, feature);
    this.project.features.push(feature);
    this.saveFeature(feature);
    this.saveProject();

    logger.info(`Created feature: ${name} (${feature.id})`);
    return feature;
  }

  getFeature(id: string): Feature | undefined {
    return this.features.get(id);
  }

  getActiveFeature(): Feature | undefined {
    return Array.from(this.features.values()).find(
      (f) => f.status === FeatureStatus.IN_PROGRESS,
    );
  }

  getAllFeatures(): Feature[] {
    return Array.from(this.features.values());
  }

  updateFeature(id: string, updates: Partial<Feature>): void {
    const feature = this.features.get(id);
    if (feature) {
      Object.assign(feature, updates, { updatedAt: new Date() });
      this.saveFeature(feature);
    }
  }

  updateFeatureStage(featureId: string, stage: PipelineStage): void {
    const feature = this.features.get(featureId);
    if (feature) {
      feature.currentStage = stage;
      feature.updatedAt = new Date();
      if (feature.status === FeatureStatus.DRAFT) {
        feature.status = FeatureStatus.IN_PROGRESS;
      }
      this.saveFeature(feature);
    }
  }

  recordStageResult(featureId: string, result: StageResult): void {
    const feature = this.features.get(featureId);
    if (feature) {
      feature.stageResults.set(result.stage, result);
      feature.artifacts.push(...result.artifacts);
      feature.issues.push(...result.issues);
      feature.updatedAt = new Date();
      this.saveFeature(feature);
    }
  }

  completeFeature(featureId: string): void {
    const feature = this.features.get(featureId);
    if (feature) {
      feature.status = FeatureStatus.COMPLETED;
      feature.currentStage = PipelineStage.COMPLETED;
      feature.updatedAt = new Date();
      this.saveFeature(feature);
      logger.info(`Feature completed: ${feature.name}`);
    }
  }

  private detectProjectConfig(projectPath: string): ProjectConfig {
    const config: ProjectConfig = {
      language: 'typescript',
      framework: 'node',
      testFramework: 'jest',
      buildTool: 'npm',
      ciProvider: 'github-actions',
      deployTarget: 'docker',
      cloudProvider: CloudProvider.AWS,
      codeStyle: 'standard',
      branchStrategy: 'gitflow',
      customInstructions: '',
    };

    if (fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
      config.language = 'typescript';
    } else if (fs.existsSync(path.join(projectPath, 'package.json'))) {
      config.language = 'javascript';
    } else if (fs.existsSync(path.join(projectPath, 'requirements.txt')) || fs.existsSync(path.join(projectPath, 'pyproject.toml'))) {
      config.language = 'python';
    } else if (fs.existsSync(path.join(projectPath, 'go.mod'))) {
      config.language = 'go';
    } else if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) {
      config.language = 'rust';
    }

    if (fs.existsSync(path.join(projectPath, 'package.json'))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.react) config.framework = 'react';
        else if (deps.next) config.framework = 'nextjs';
        else if (deps.vue) config.framework = 'vue';
        else if (deps.express) config.framework = 'express';
        else if (deps.fastify) config.framework = 'fastify';
        else if (deps.nest || deps['@nestjs/core']) config.framework = 'nestjs';

        if (deps.jest) config.testFramework = 'jest';
        else if (deps.vitest) config.testFramework = 'vitest';
        else if (deps.mocha) config.testFramework = 'mocha';

        if (deps['@aws-sdk/client-s3'] || deps['aws-sdk'] || deps['@aws-cdk/core']) config.cloudProvider = CloudProvider.AWS;
        else if (deps['@google-cloud/storage'] || deps['@google-cloud/pubsub'] || deps['firebase-admin']) config.cloudProvider = CloudProvider.GCP;
        else if (deps['@azure/storage-blob'] || deps['@azure/identity'] || deps['@azure/cosmos']) config.cloudProvider = CloudProvider.AZURE;
      } catch {
        // package.json parse failed, use defaults
      }
    }

    const cloudIndicators: [string, CloudProvider][] = [
      ['serverless.yml', CloudProvider.AWS],
      ['samconfig.toml', CloudProvider.AWS],
      ['cdk.json', CloudProvider.AWS],
      ['app.yaml', CloudProvider.GCP],
      ['.gcloudignore', CloudProvider.GCP],
      ['firebase.json', CloudProvider.GCP],
      ['azure-pipelines.yml', CloudProvider.AZURE],
      ['host.json', CloudProvider.AZURE],
    ];
    for (const [file, provider] of cloudIndicators) {
      if (fs.existsSync(path.join(projectPath, file))) {
        config.cloudProvider = provider;
        break;
      }
    }

    return config;
  }

  private ensureStateDir(): void {
    const dirs = [this.stateDir, path.join(this.stateDir, 'features')];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private saveProject(): void {
    const filePath = path.join(this.stateDir, 'project.json');
    const serializable = {
      ...this.project,
      features: this.project.features.map((f) => f.id),
    };
    fs.writeFileSync(filePath, JSON.stringify(serializable, null, 2), 'utf-8');
  }

  private loadProject(): Project | null {
    const filePath = path.join(this.stateDir, 'project.json');
    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      data.createdAt = new Date(data.createdAt);
      data.updatedAt = new Date(data.updatedAt);
      data.features = [];
      return data as Project;
    } catch {
      return null;
    }
  }

  private saveFeature(feature: Feature): void {
    const filePath = path.join(this.stateDir, 'features', `${feature.id}.json`);
    const serializable = {
      ...feature,
      stageResults: Object.fromEntries(feature.stageResults),
    };
    fs.writeFileSync(filePath, JSON.stringify(serializable, null, 2), 'utf-8');
  }

  private loadFeatures(): void {
    const featuresDir = path.join(this.stateDir, 'features');
    if (!fs.existsSync(featuresDir)) return;

    const files = fs.readdirSync(featuresDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = fs.readFileSync(path.join(featuresDir, file), 'utf-8');
        const data = JSON.parse(content);
        data.createdAt = new Date(data.createdAt);
        data.updatedAt = new Date(data.updatedAt);
        data.stageResults = new Map(Object.entries(data.stageResults ?? {}));
        const feature = data as Feature;
        this.features.set(feature.id, feature);
        this.project.features.push(feature);
      } catch (error) {
        logger.error(`Failed to load feature from ${file}: ${error}`);
      }
    }
  }
}
