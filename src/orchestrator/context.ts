import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { v4 as uuidv4 } from 'uuid';
import {
  type Project,
  type ProjectConfig,
  type Feature,
  FeatureStatus,
  FeaturePriority,
  PipelineStage,
  type StageResult,
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
      const projectCreatedAt = this.detectProjectCreationDate(projectPath);
      this.project = {
        id: uuidv4(),
        name: projectName ?? path.basename(projectPath),
        description: '',
        rootPath: projectPath,
        createdAt: projectCreatedAt,
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

  // ── Table-driven detection ─────────────────────────────────────────────────
  //
  // All detection is driven by lookup tables. To support a new ecosystem,
  // add entries to the tables — no new code branches needed.
  //

  private static readonly EXT_TO_LANG: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.py': 'python', '.pyw': 'python', '.pyi': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.rb': 'ruby', '.erb': 'ruby',
    '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin', '.scala': 'scala',
    '.php': 'php',
    '.cs': 'csharp',
    '.swift': 'swift',
    '.dart': 'dart',
    '.ex': 'elixir', '.exs': 'elixir',
    '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
    '.lua': 'lua',
    '.r': 'r', '.R': 'r',
    '.zig': 'zig',
    '.nim': 'nim',
    '.vue': 'vue', '.svelte': 'svelte',
  };

  // config file → language hint (only used to break ties)
  private static readonly CONFIG_LANG_HINTS: Record<string, string> = {
    'tsconfig.json': 'typescript',
    'requirements.txt': 'python', 'pyproject.toml': 'python', 'setup.py': 'python',
    'setup.cfg': 'python', 'Pipfile': 'python',
    'go.mod': 'go',
    'Cargo.toml': 'rust',
    'Gemfile': 'ruby',
    'composer.json': 'php',
    'pom.xml': 'java', 'build.gradle': 'java', 'build.gradle.kts': 'kotlin',
    'Package.swift': 'swift',
    'pubspec.yaml': 'dart',
    'mix.exs': 'elixir',
    'CMakeLists.txt': 'cpp',
    'Makefile.PL': 'perl',
    'package.json': 'javascript',
  };

  // dep name (lowercase) → what it indicates (first match per category wins)
  private static readonly DEP_INDICATORS: Record<string, { cat: string; val: string }> = {
    // ── frameworks ──
    django: { cat: 'framework', val: 'django' },
    flask: { cat: 'framework', val: 'flask' },
    fastapi: { cat: 'framework', val: 'fastapi' },
    tornado: { cat: 'framework', val: 'tornado' },
    starlette: { cat: 'framework', val: 'starlette' },
    aiohttp: { cat: 'framework', val: 'aiohttp' },
    sanic: { cat: 'framework', val: 'sanic' },
    pyramid: { cat: 'framework', val: 'pyramid' },
    scrapy: { cat: 'framework', val: 'scrapy' },
    celery: { cat: 'framework', val: 'celery' },
    react: { cat: 'framework', val: 'react' },
    next: { cat: 'framework', val: 'nextjs' },
    vue: { cat: 'framework', val: 'vue' },
    nuxt: { cat: 'framework', val: 'nuxt' },
    svelte: { cat: 'framework', val: 'svelte' },
    '@angular/core': { cat: 'framework', val: 'angular' },
    express: { cat: 'framework', val: 'express' },
    fastify: { cat: 'framework', val: 'fastify' },
    '@nestjs/core': { cat: 'framework', val: 'nestjs' },
    hono: { cat: 'framework', val: 'hono' },
    'gin-gonic/gin': { cat: 'framework', val: 'gin' },
    'labstack/echo': { cat: 'framework', val: 'echo' },
    'gorilla/mux': { cat: 'framework', val: 'gorilla' },
    'gofiber/fiber': { cat: 'framework', val: 'fiber' },
    actix: { cat: 'framework', val: 'actix' },
    'actix-web': { cat: 'framework', val: 'actix' },
    axum: { cat: 'framework', val: 'axum' },
    rocket: { cat: 'framework', val: 'rocket' },
    rails: { cat: 'framework', val: 'rails' },
    sinatra: { cat: 'framework', val: 'sinatra' },
    laravel: { cat: 'framework', val: 'laravel' },
    symfony: { cat: 'framework', val: 'symfony' },
    'spring-boot': { cat: 'framework', val: 'spring-boot' },
    'spring-core': { cat: 'framework', val: 'spring' },
    phoenix: { cat: 'framework', val: 'phoenix' },
    // ── test frameworks ──
    jest: { cat: 'testFramework', val: 'jest' },
    vitest: { cat: 'testFramework', val: 'vitest' },
    mocha: { cat: 'testFramework', val: 'mocha' },
    ava: { cat: 'testFramework', val: 'ava' },
    cypress: { cat: 'testFramework', val: 'cypress' },
    '@playwright/test': { cat: 'testFramework', val: 'playwright' },
    playwright: { cat: 'testFramework', val: 'playwright' },
    pytest: { cat: 'testFramework', val: 'pytest' },
    nose: { cat: 'testFramework', val: 'nose' },
    nose2: { cat: 'testFramework', val: 'nose2' },
    unittest2: { cat: 'testFramework', val: 'unittest' },
    rspec: { cat: 'testFramework', val: 'rspec' },
    minitest: { cat: 'testFramework', val: 'minitest' },
    phpunit: { cat: 'testFramework', val: 'phpunit' },
    junit: { cat: 'testFramework', val: 'junit' },
    'junit-jupiter': { cat: 'testFramework', val: 'junit5' },
    testify: { cat: 'testFramework', val: 'testify' },
    'flutter_test': { cat: 'testFramework', val: 'flutter_test' },
    // ── build tools (from deps) ──
    vite: { cat: 'buildTool', val: 'vite' },
    webpack: { cat: 'buildTool', val: 'webpack' },
    esbuild: { cat: 'buildTool', val: 'esbuild' },
    rollup: { cat: 'buildTool', val: 'rollup' },
    turbo: { cat: 'buildTool', val: 'turbo' },
    turborepo: { cat: 'buildTool', val: 'turbo' },
    // ── cloud providers ──
    boto3: { cat: 'cloudProvider', val: 'aws' },
    'aws-sdk': { cat: 'cloudProvider', val: 'aws' },
    '@aws-sdk/client-s3': { cat: 'cloudProvider', val: 'aws' },
    '@aws-cdk/core': { cat: 'cloudProvider', val: 'aws' },
    'google-cloud-storage': { cat: 'cloudProvider', val: 'gcp' },
    'google-cloud-bigquery': { cat: 'cloudProvider', val: 'gcp' },
    'google-cloud-pubsub': { cat: 'cloudProvider', val: 'gcp' },
    '@google-cloud/storage': { cat: 'cloudProvider', val: 'gcp' },
    '@google-cloud/pubsub': { cat: 'cloudProvider', val: 'gcp' },
    '@google-cloud/firestore': { cat: 'cloudProvider', val: 'gcp' },
    'firebase-admin': { cat: 'cloudProvider', val: 'gcp' },
    firebase: { cat: 'cloudProvider', val: 'gcp' },
    '@azure/storage-blob': { cat: 'cloudProvider', val: 'azure' },
    '@azure/identity': { cat: 'cloudProvider', val: 'azure' },
    '@azure/cosmos': { cat: 'cloudProvider', val: 'azure' },
    'azure-storage': { cat: 'cloudProvider', val: 'azure' },
  };

  // config file presence → category + value
  private static readonly FILE_INDICATORS: { file: string; cat: string; val: string }[] = [
    // CI
    { file: '.github/workflows', cat: 'ciProvider', val: 'github-actions' },
    { file: '.gitlab-ci.yml', cat: 'ciProvider', val: 'gitlab-ci' },
    { file: 'cloudbuild.yaml', cat: 'ciProvider', val: 'cloud-build' },
    { file: 'cloudbuild.json', cat: 'ciProvider', val: 'cloud-build' },
    { file: '.circleci', cat: 'ciProvider', val: 'circleci' },
    { file: 'Jenkinsfile', cat: 'ciProvider', val: 'jenkins' },
    { file: '.travis.yml', cat: 'ciProvider', val: 'travis-ci' },
    { file: 'bitbucket-pipelines.yml', cat: 'ciProvider', val: 'bitbucket-pipelines' },
    { file: 'azure-pipelines.yml', cat: 'ciProvider', val: 'azure-devops' },
    { file: 'buildspec.yml', cat: 'ciProvider', val: 'aws-codebuild' },
    // Deploy
    { file: 'Dockerfile', cat: 'deployTarget', val: 'docker' },
    { file: 'docker-compose.yml', cat: 'deployTarget', val: 'docker' },
    { file: 'docker-compose.yaml', cat: 'deployTarget', val: 'docker' },
    { file: 'app.yaml', cat: 'deployTarget', val: 'gcp-app-engine' },
    { file: 'serverless.yml', cat: 'deployTarget', val: 'serverless' },
    { file: 'serverless.yaml', cat: 'deployTarget', val: 'serverless' },
    { file: 'vercel.json', cat: 'deployTarget', val: 'vercel' },
    { file: '.vercel', cat: 'deployTarget', val: 'vercel' },
    { file: 'netlify.toml', cat: 'deployTarget', val: 'netlify' },
    { file: 'fly.toml', cat: 'deployTarget', val: 'fly-io' },
    { file: 'render.yaml', cat: 'deployTarget', val: 'render' },
    { file: 'Procfile', cat: 'deployTarget', val: 'heroku' },
    { file: 'cdk.json', cat: 'deployTarget', val: 'aws-cdk' },
    { file: 'samconfig.toml', cat: 'deployTarget', val: 'aws-sam' },
    { file: 'k8s', cat: 'deployTarget', val: 'kubernetes' },
    { file: 'kubernetes', cat: 'deployTarget', val: 'kubernetes' },
    { file: 'helm', cat: 'deployTarget', val: 'kubernetes' },
    // Cloud
    { file: 'app.yaml', cat: 'cloudProvider', val: 'gcp' },
    { file: '.gcloudignore', cat: 'cloudProvider', val: 'gcp' },
    { file: 'firebase.json', cat: 'cloudProvider', val: 'gcp' },
    { file: 'cloudbuild.yaml', cat: 'cloudProvider', val: 'gcp' },
    { file: 'cloudbuild.json', cat: 'cloudProvider', val: 'gcp' },
    { file: 'serverless.yml', cat: 'cloudProvider', val: 'aws' },
    { file: 'samconfig.toml', cat: 'cloudProvider', val: 'aws' },
    { file: 'cdk.json', cat: 'cloudProvider', val: 'aws' },
    { file: 'buildspec.yml', cat: 'cloudProvider', val: 'aws' },
    { file: '.aws', cat: 'cloudProvider', val: 'aws' },
    { file: 'azure-pipelines.yml', cat: 'cloudProvider', val: 'azure' },
    { file: 'host.json', cat: 'cloudProvider', val: 'azure' },
    { file: '.azure', cat: 'cloudProvider', val: 'azure' },
    // Build tools (from files)
    { file: 'yarn.lock', cat: 'buildTool', val: 'yarn' },
    { file: 'pnpm-lock.yaml', cat: 'buildTool', val: 'pnpm' },
    { file: 'bun.lockb', cat: 'buildTool', val: 'bun' },
    { file: 'poetry.lock', cat: 'buildTool', val: 'poetry' },
    { file: 'Pipfile.lock', cat: 'buildTool', val: 'pipenv' },
    { file: 'Makefile', cat: 'buildTool', val: 'make' },
    // Test config files
    { file: 'pytest.ini', cat: 'testFramework', val: 'pytest' },
    { file: 'conftest.py', cat: 'testFramework', val: 'pytest' },
    { file: '.rspec', cat: 'testFramework', val: 'rspec' },
    { file: 'jest.config.js', cat: 'testFramework', val: 'jest' },
    { file: 'jest.config.ts', cat: 'testFramework', val: 'jest' },
    { file: 'vitest.config.ts', cat: 'testFramework', val: 'vitest' },
    { file: 'vitest.config.js', cat: 'testFramework', val: 'vitest' },
    { file: '.mocharc.yml', cat: 'testFramework', val: 'mocha' },
    { file: 'phpunit.xml', cat: 'testFramework', val: 'phpunit' },
    { file: 'phpunit.xml.dist', cat: 'testFramework', val: 'phpunit' },
  ];

  private detectProjectConfig(projectPath: string): ProjectConfig {
    const config: ProjectConfig = {
      language: 'unknown',
      framework: 'unknown',
      testFramework: 'unknown',
      buildTool: 'unknown',
      ciProvider: 'unknown',
      deployTarget: 'unknown',
      cloudProvider: CloudProvider.NONE,
      codeStyle: 'standard',
      branchStrategy: 'unknown',
      customInstructions: '',
    };

    // Phase 1: Scan file extensions to count source files per language
    const langCounts = this.countFileExtensions(projectPath);

    // Phase 2: Check for config files that hint at language + tools
    const presentFiles = new Set<string>();
    for (const file of Object.keys(ProjectContext.CONFIG_LANG_HINTS)) {
      if (fs.existsSync(path.join(projectPath, file))) {
        presentFiles.add(file);
      }
    }
    for (const indicator of ProjectContext.FILE_INDICATORS) {
      if (fs.existsSync(path.join(projectPath, indicator.file))) {
        presentFiles.add(indicator.file);
      }
    }

    // Phase 3: Determine primary language (file count wins, config files break ties)
    config.language = this.resolveLanguage(langCounts, presentFiles);

    // Phase 4: Read all dependency names from whatever dep files exist
    const depNames = this.readAllDependencies(projectPath, presentFiles);

    // Phase 5: Match deps against the indicator table (first match per category wins)
    const matched: Record<string, string> = {};
    for (const dep of depNames) {
      const key = dep.toLowerCase();
      const indicator = ProjectContext.DEP_INDICATORS[key];
      if (indicator && !matched[indicator.cat]) {
        matched[indicator.cat] = indicator.val;
      }
    }

    // Phase 6: Match config files against file indicator table
    for (const indicator of ProjectContext.FILE_INDICATORS) {
      if (presentFiles.has(indicator.file) && !matched[indicator.cat]) {
        matched[indicator.cat] = indicator.val;
      }
    }

    // Phase 7: Resolve cloud provider with scoring for multi-cloud detection
    const cloudVal = this.resolveCloudProvider(depNames, presentFiles);

    // Apply matched values
    if (matched.framework) config.framework = matched.framework;
    if (matched.testFramework) config.testFramework = matched.testFramework;
    if (matched.buildTool) config.buildTool = matched.buildTool;
    if (matched.ciProvider) config.ciProvider = matched.ciProvider;
    if (matched.deployTarget) config.deployTarget = matched.deployTarget;
    config.cloudProvider = cloudVal;

    // Phase 8: Git-based detection
    if (fs.existsSync(path.join(projectPath, '.git'))) {
      config.branchStrategy = this.detectBranchStrategy(projectPath);
    }

    return config;
  }

  private countFileExtensions(projectPath: string, maxDepth = 4): Record<string, number> {
    const counts: Record<string, number> = {};
    const ignoreSet = new Set([
      'node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor',
      '__pycache__', '.venv', 'venv', 'env', '.tox', '.mypy_cache',
      '.next', '.nuxt', 'coverage', '.cdm', '.cache',
    ]);

    const walk = (dir: string, depth: number) => {
      if (depth > maxDepth) return;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.isDirectory()) continue;
        if (ignoreSet.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          const lang = ProjectContext.EXT_TO_LANG[ext];
          if (lang) counts[lang] = (counts[lang] ?? 0) + 1;
        }
      }
    };

    walk(projectPath, 0);
    return counts;
  }

  private resolveLanguage(langCounts: Record<string, number>, presentFiles: Set<string>): string {
    // Strongest signal: which language has the most source files
    const sorted = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0 && sorted[0][1] > 0) {
      // tsconfig.json promotes javascript → typescript
      if (sorted[0][0] === 'javascript' && presentFiles.has('tsconfig.json')) {
        return 'typescript';
      }
      return sorted[0][0];
    }

    // Fallback: config file hints
    for (const [file, lang] of Object.entries(ProjectContext.CONFIG_LANG_HINTS)) {
      if (presentFiles.has(file)) return lang;
    }

    return 'unknown';
  }

  /**
   * Reads dependency names from all recognized dep-file formats.
   * Returns a flat list of package/module names (not versions).
   */
  private readAllDependencies(projectPath: string, presentFiles: Set<string>): string[] {
    const deps: string[] = [];
    const seen = new Set<string>();
    const add = (name: string) => {
      const key = name.toLowerCase().trim();
      if (key && !seen.has(key)) { seen.add(key); deps.push(key); }
    };

    // ── package.json (Node) ──
    if (presentFiles.has('package.json')) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
        for (const name of Object.keys(pkg.dependencies ?? {})) add(name);
        for (const name of Object.keys(pkg.devDependencies ?? {})) add(name);
      } catch { /* skip */ }
    }

    // ── requirements*.txt (Python) ──
    const reqFiles = ['requirements.txt', 'requirements-dev.txt', 'requirements_dev.txt',
                      'requirements/base.txt', 'requirements/dev.txt'];
    for (const rf of reqFiles) {
      const p = path.join(projectPath, rf);
      if (fs.existsSync(p)) {
        for (const line of this.safeReadFile(p).split('\n')) {
          const t = line.trim();
          if (t && !t.startsWith('#') && !t.startsWith('-')) {
            const name = t.split(/[>=<!~\[\s]/)[0];
            if (name) add(name);
          }
        }
      }
    }

    // ── pyproject.toml (Python/generic) ──
    if (presentFiles.has('pyproject.toml')) {
      const content = this.safeReadFile(path.join(projectPath, 'pyproject.toml'));
      const m = content.match(/["']([a-zA-Z0-9_-]+)(?:\[.*?\])?[>=<!~]/g);
      if (m) for (const x of m) { const n = x.replace(/^["']/, '').split(/[>=<!~\[]/)[0]; if (n) add(n); }
    }

    // ── Pipfile (Python) ──
    if (presentFiles.has('Pipfile')) {
      const content = this.safeReadFile(path.join(projectPath, 'Pipfile'));
      const m = content.match(/^([a-zA-Z0-9_-]+)\s*=/gm);
      if (m) for (const x of m) {
        const n = x.split('=')[0]?.trim();
        if (n && !['python_version', 'name', 'url', 'verify_ssl'].includes(n)) add(n);
      }
    }

    // ── go.mod (Go) ──
    const goMod = path.join(projectPath, 'go.mod');
    if (fs.existsSync(goMod)) {
      const content = this.safeReadFile(goMod);
      const block = content.match(/require\s*\(([\s\S]*?)\)/);
      if (block) for (const line of block[1].split('\n')) {
        const m = line.trim().match(/^([\w./-]+)\s/);
        if (m) add(m[1]);
      }
    }

    // ── Cargo.toml (Rust) ──
    const cargo = path.join(projectPath, 'Cargo.toml');
    if (fs.existsSync(cargo)) {
      const content = this.safeReadFile(cargo);
      const depSec = content.match(/\[dependencies\]([\s\S]*?)(?:\n\[|$)/);
      if (depSec) for (const line of depSec[1].split('\n')) {
        const m = line.match(/^(\w[\w-]*)\s*=/);
        if (m) add(m[1]);
      }
    }

    // ── Gemfile (Ruby) ──
    const gemfile = path.join(projectPath, 'Gemfile');
    if (fs.existsSync(gemfile)) {
      const content = this.safeReadFile(gemfile);
      const m = content.matchAll(/gem\s+['"]([^'"]+)['"]/g);
      for (const x of m) add(x[1]);
    }

    // ── composer.json (PHP) ──
    if (presentFiles.has('composer.json')) {
      try {
        const cmp = JSON.parse(fs.readFileSync(path.join(projectPath, 'composer.json'), 'utf-8'));
        for (const name of Object.keys(cmp.require ?? {})) add(name);
        for (const name of Object.keys(cmp['require-dev'] ?? {})) add(name);
      } catch { /* skip */ }
    }

    // ── pom.xml (Java/Maven) — just extract artifactIds from top-level deps
    if (presentFiles.has('pom.xml')) {
      const content = this.safeReadFile(path.join(projectPath, 'pom.xml'));
      const m = content.matchAll(/<artifactId>([^<]+)<\/artifactId>/g);
      for (const x of m) add(x[1]);
    }

    // ── build.gradle / build.gradle.kts (Java/Kotlin) ──
    for (const gf of ['build.gradle', 'build.gradle.kts']) {
      const p = path.join(projectPath, gf);
      if (fs.existsSync(p)) {
        const content = this.safeReadFile(p);
        const m = content.matchAll(/['"]([a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+)(?::[^'"]+)?['"]/g);
        for (const x of m) { const parts = x[1].split(':'); if (parts[1]) add(parts[1]); }
      }
    }

    // ── pubspec.yaml (Dart/Flutter) ──
    const pubspec = path.join(projectPath, 'pubspec.yaml');
    if (fs.existsSync(pubspec)) {
      const content = this.safeReadFile(pubspec);
      const m = content.matchAll(/^\s{2}(\w[\w_-]*):/gm);
      for (const x of m) add(x[1]);
    }

    // ── mix.exs (Elixir) ──
    const mixExs = path.join(projectPath, 'mix.exs');
    if (fs.existsSync(mixExs)) {
      const content = this.safeReadFile(mixExs);
      const m = content.matchAll(/\{:(\w+)/g);
      for (const x of m) add(x[1]);
    }

    return deps;
  }

  private resolveCloudProvider(depNames: string[], presentFiles: Set<string>): CloudProvider {
    const scores: Record<string, number> = { aws: 0, gcp: 0, azure: 0 };

    for (const dep of depNames) {
      const ind = ProjectContext.DEP_INDICATORS[dep];
      if (ind?.cat === 'cloudProvider' && ind.val in scores) {
        scores[ind.val]++;
      }
    }
    for (const indicator of ProjectContext.FILE_INDICATORS) {
      if (indicator.cat === 'cloudProvider' && presentFiles.has(indicator.file) && indicator.val in scores) {
        scores[indicator.val]++;
      }
    }

    const max = Math.max(scores.aws, scores.gcp, scores.azure);
    if (max === 0) return CloudProvider.NONE;

    const active = [scores.aws > 0, scores.gcp > 0, scores.azure > 0].filter(Boolean).length;
    if (active > 1) return CloudProvider.MULTI_CLOUD;
    if (scores.gcp === max) return CloudProvider.GCP;
    if (scores.aws === max) return CloudProvider.AWS;
    return CloudProvider.AZURE;
  }

  private detectBranchStrategy(projectPath: string): string {
    try {
      const gitDir = path.join(projectPath, '.git');
      const refsDir = path.join(gitDir, 'refs', 'heads');
      if (fs.existsSync(refsDir)) {
        const branches = fs.readdirSync(refsDir);
        if (branches.includes('develop') || branches.includes('development')) return 'gitflow';
        if (branches.length <= 2) return 'trunk-based';
      }
    } catch { /* ignore */ }
    return 'unknown';
  }

  private safeReadFile(filePath: string): string {
    try { return fs.readFileSync(filePath, 'utf-8'); } catch { return ''; }
  }

  private detectProjectCreationDate(projectPath: string): Date {
    try {
      if (fs.existsSync(path.join(projectPath, '.git'))) {
        const result = execSync('git log --reverse --format=%aI | head -1', {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        if (result) {
          const date = new Date(result);
          if (!isNaN(date.getTime())) return date;
        }
      }
    } catch { /* git not available or not a repo */ }
    return new Date();
  }

  private ensureStateDir(): void {
    const dirs = [
      this.stateDir,
      path.join(this.stateDir, 'agents'),
      path.join(this.stateDir, 'agent-prompts'),
      path.join(this.stateDir, 'features'),
      path.join(this.stateDir, 'artifacts'),
    ];
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
