import * as fs from 'node:fs';
import * as path from 'node:path';
import logger from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectAnalysis {
  generatedAt: string;
  projectName: string;
  projectPath: string;
  overview: ProjectOverview;
  fileTree: FileNode[];
  modules: ModuleSummary[];
  dependencyGraph: DependencyEdge[];
  externalDeps: ExternalDep[];
  entryPoints: string[];
  patterns: string[];
  testStructure: TestStructure;
}

interface ProjectOverview {
  language: string;
  framework: string;
  buildTool: string;
  testFramework: string;
  totalFiles: number;
  totalSourceFiles: number;
  totalTestFiles: number;
  totalLines: number;
}

interface FileNode {
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export interface ModuleSummary {
  filePath: string;
  language: string;
  lines: number;
  exports: ExportEntry[];
  imports: string[];
  description: string;
}

interface ExportEntry {
  name: string;
  kind: 'class' | 'function' | 'interface' | 'type' | 'enum' | 'const' | 'default' | 'variable';
  signature?: string;
}

interface DependencyEdge {
  from: string;
  to: string;
}

interface ExternalDep {
  name: string;
  version: string;
  purpose?: string;
}

interface TestStructure {
  dirs: string[];
  fileCount: number;
  frameworks: string[];
}

// ─── Ignore patterns ────────────────────────────────────────────────────────

const DEFAULT_IGNORE = [
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor',
  '.next', '.nuxt', 'coverage', '.cdm', '.cache', '.turbo',
  '__pycache__', '.venv', 'venv', 'env', '.tox', '.mypy_cache',
  '.pytest_cache', '.ruff_cache', 'egg-info',
  '.idea', '.vscode', '.DS_Store',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  'poetry.lock', 'Pipfile.lock',
  '*.map', '*.d.ts', '*.min.js', '*.min.css',
];

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw',
  '.go',
  '.rs',
  '.java', '.kt', '.kts', '.scala',
  '.rb', '.erb',
  '.php',
  '.cs',
  '.swift',
  '.dart',
  '.ex', '.exs',
  '.c', '.cpp', '.cc', '.h', '.hpp',
  '.lua',
  '.r', '.R',
  '.vue', '.svelte', '.astro',
]);

const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/,  /\.spec\.[jt]sx?$/,   /_test\.[jt]sx?$/,
  /test_.*\.py$/,       /.*_test\.py$/,
  /.*_test\.go$/,
  /Test\.java$/,        /Spec\.java$/,
  /_test\.rb$/,         /_spec\.rb$/,
  /Test\.php$/,
  /test_.*\.exs$/,
];

// ─── Analyzer ───────────────────────────────────────────────────────────────

export class ProjectAnalyzer {
  private projectPath: string;
  private customIgnore: string[];

  constructor(projectPath: string, customIgnore: string[] = []) {
    this.projectPath = path.resolve(projectPath);
    this.customIgnore = [...DEFAULT_IGNORE, ...customIgnore];
  }

  async analyze(): Promise<ProjectAnalysis> {
    logger.info('Starting project analysis...');

    const overview = this.buildOverview();
    const fileTree = this.scanFileTree(this.projectPath, 0, 4);
    const sourceFiles = this.collectSourceFiles(this.projectPath);
    const testFiles = sourceFiles.filter(f => this.isTestFile(f));
    const nonTestFiles = sourceFiles.filter(f => !this.isTestFile(f));

    const modules = this.analyzeModules(nonTestFiles);
    const dependencyGraph = this.buildDependencyGraph(modules);
    const externalDeps = this.extractExternalDeps();
    const entryPoints = this.findEntryPoints();
    const patterns = this.detectPatterns(modules);
    const testStructure = this.analyzeTestStructure(testFiles);

    const totalLines = modules.reduce((sum, m) => sum + m.lines, 0);

    const analysis: ProjectAnalysis = {
      generatedAt: new Date().toISOString(),
      projectName: overview.projectName,
      projectPath: this.projectPath,
      overview: {
        ...overview,
        totalFiles: sourceFiles.length,
        totalSourceFiles: nonTestFiles.length,
        totalTestFiles: testFiles.length,
        totalLines,
      },
      fileTree,
      modules,
      dependencyGraph,
      externalDeps,
      entryPoints,
      patterns,
      testStructure,
    };

    logger.info(`Analysis complete: ${modules.length} modules, ${dependencyGraph.length} edges`);
    return analysis;
  }

  generateMarkdown(analysis: ProjectAnalysis): string {
    const s: string[] = [];

    s.push(`# Project Analysis: ${analysis.projectName}`);
    s.push(`> Generated: ${analysis.generatedAt}`);
    s.push(`> Path: ${analysis.projectPath}\n`);

    // Overview
    s.push('## Overview');
    const o = analysis.overview;
    s.push(`- **Language:** ${o.language}`);
    s.push(`- **Framework:** ${o.framework}`);
    s.push(`- **Build tool:** ${o.buildTool}`);
    s.push(`- **Test framework:** ${o.testFramework}`);
    s.push(`- **Source files:** ${o.totalSourceFiles} (${o.totalLines.toLocaleString()} lines)`);
    s.push(`- **Test files:** ${o.totalTestFiles}`);
    s.push('');

    // File tree
    s.push('## File Map');
    s.push('```');
    this.renderTreeToLines(analysis.fileTree, s, '');
    s.push('```');
    s.push('');

    // Module summaries — the core value
    s.push('## Modules\n');
    const grouped = this.groupByDirectory(analysis.modules);
    for (const [dir, mods] of Object.entries(grouped)) {
      s.push(`### ${dir}/\n`);
      for (const mod of mods) {
        const relPath = mod.filePath;
        const exportStr = mod.exports
          .map(e => {
            if (e.signature) return `${e.kind} ${e.name}: ${e.signature}`;
            return `${e.kind} ${e.name}`;
          })
          .join(', ');
        const importCount = mod.imports.length;

        s.push(`**\`${relPath}\`** (${mod.lines} lines)`);
        if (mod.description) {
          s.push(`${mod.description}`);
        }
        if (exportStr) {
          s.push(`Exports: ${exportStr}`);
        }
        if (importCount > 0) {
          s.push(`Imports: ${mod.imports.join(', ')}`);
        }
        s.push('');
      }
    }

    // Dependency graph — compact adjacency list
    if (analysis.dependencyGraph.length > 0) {
      s.push('## Internal Dependency Graph\n');
      const adjMap = new Map<string, string[]>();
      for (const edge of analysis.dependencyGraph) {
        if (!adjMap.has(edge.from)) adjMap.set(edge.from, []);
        adjMap.get(edge.from)!.push(edge.to);
      }
      for (const [from, tos] of adjMap) {
        s.push(`- \`${from}\` -> ${tos.map(t => `\`${t}\``).join(', ')}`);
      }
      s.push('');
    }

    // External deps
    if (analysis.externalDeps.length > 0) {
      s.push('## External Dependencies\n');
      for (const dep of analysis.externalDeps) {
        const purpose = dep.purpose ? ` — ${dep.purpose}` : '';
        s.push(`- **${dep.name}**@${dep.version}${purpose}`);
      }
      s.push('');
    }

    // Entry points
    if (analysis.entryPoints.length > 0) {
      s.push('## Entry Points\n');
      for (const ep of analysis.entryPoints) {
        s.push(`- \`${ep}\``);
      }
      s.push('');
    }

    // Patterns
    if (analysis.patterns.length > 0) {
      s.push('## Patterns & Conventions\n');
      for (const p of analysis.patterns) {
        s.push(`- ${p}`);
      }
      s.push('');
    }

    // Test structure
    s.push('## Test Structure\n');
    s.push(`- **Directories:** ${analysis.testStructure.dirs.join(', ') || 'none detected'}`);
    s.push(`- **Test files:** ${analysis.testStructure.fileCount}`);
    s.push(`- **Frameworks:** ${analysis.testStructure.frameworks.join(', ') || 'none detected'}`);
    s.push('');

    return s.join('\n');
  }

  saveAnalysis(outputPath: string, markdown: string): void {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, markdown, 'utf-8');
  }

  // ── Overview ────────────────────────────────────────────────────────────

  private buildOverview(): ProjectOverview & { projectName: string } {
    let projectName = path.basename(this.projectPath);
    let language = 'unknown';
    let framework = 'unknown';
    let buildTool = 'unknown';
    let testFramework = 'unknown';

    const hasTsConfig = fs.existsSync(path.join(this.projectPath, 'tsconfig.json'));
    const hasPkgJson = fs.existsSync(path.join(this.projectPath, 'package.json'));
    const hasPyproject = fs.existsSync(path.join(this.projectPath, 'pyproject.toml'));
    const hasRequirements = fs.existsSync(path.join(this.projectPath, 'requirements.txt'));
    const hasSetupPy = fs.existsSync(path.join(this.projectPath, 'setup.py'));
    const hasPipfile = fs.existsSync(path.join(this.projectPath, 'Pipfile'));
    const hasGoMod = fs.existsSync(path.join(this.projectPath, 'go.mod'));
    const hasCargoToml = fs.existsSync(path.join(this.projectPath, 'Cargo.toml'));

    const isPython = hasPyproject || hasRequirements || hasSetupPy || hasPipfile;

    if (hasTsConfig) {
      language = 'TypeScript';
    } else if (isPython) {
      language = 'Python';
    } else if (hasGoMod) {
      language = 'Go';
    } else if (hasCargoToml) {
      language = 'Rust';
    } else if (hasPkgJson) {
      language = 'JavaScript';
    }

    if (language === 'Python') {
      const pyDeps = this.readPythonDeps();
      const allDeps = pyDeps.join(' ').toLowerCase();

      // Project name from pyproject.toml or setup.py
      if (hasPyproject) {
        const content = this.safeReadFile(path.join(this.projectPath, 'pyproject.toml'));
        const nameMatch = content.match(/^name\s*=\s*["']([^"']+)["']/m);
        if (nameMatch) projectName = nameMatch[1];
      }

      // Framework
      if (allDeps.includes('django')) framework = 'Django';
      else if (allDeps.includes('fastapi')) framework = 'FastAPI';
      else if (allDeps.includes('flask')) framework = 'Flask';
      else if (allDeps.includes('tornado')) framework = 'Tornado';
      else if (allDeps.includes('starlette')) framework = 'Starlette';
      else if (allDeps.includes('aiohttp')) framework = 'aiohttp';
      else if (allDeps.includes('sanic')) framework = 'Sanic';
      else if (allDeps.includes('celery')) framework = 'Celery';
      else if (allDeps.includes('scrapy')) framework = 'Scrapy';
      else framework = 'Python stdlib';

      // Test framework
      if (allDeps.includes('pytest')) testFramework = 'pytest';
      else if (allDeps.includes('nose')) testFramework = 'nose';
      else if (fs.existsSync(path.join(this.projectPath, 'pytest.ini')) ||
               fs.existsSync(path.join(this.projectPath, 'conftest.py'))) {
        testFramework = 'pytest';
      } else testFramework = 'unittest';

      // Build tool
      if (hasPyproject) {
        const content = this.safeReadFile(path.join(this.projectPath, 'pyproject.toml'));
        if (content.includes('poetry')) buildTool = 'Poetry';
        else if (content.includes('hatch')) buildTool = 'Hatch';
        else if (content.includes('flit')) buildTool = 'Flit';
        else buildTool = 'pip';
      } else if (hasPipfile) {
        buildTool = 'Pipenv';
      } else if (hasSetupPy) {
        buildTool = 'setuptools';
      } else {
        buildTool = 'pip';
      }
    } else if (language === 'Go') {
      buildTool = 'go';
      testFramework = 'go test';
      const goModContent = this.safeReadFile(path.join(this.projectPath, 'go.mod'));
      const moduleMatch = goModContent.match(/^module\s+(.+)/m);
      if (moduleMatch) {
        const parts = moduleMatch[1].trim().split('/');
        projectName = parts[parts.length - 1] ?? projectName;
      }
      if (goModContent.includes('gin-gonic')) framework = 'Gin';
      else if (goModContent.includes('labstack/echo')) framework = 'Echo';
      else if (goModContent.includes('gorilla/mux')) framework = 'Gorilla Mux';
      else if (goModContent.includes('fiber')) framework = 'Fiber';
      else framework = 'Go stdlib';
    } else if (language === 'Rust') {
      buildTool = 'cargo';
      testFramework = 'cargo test';
      const cargoContent = this.safeReadFile(path.join(this.projectPath, 'Cargo.toml'));
      const nameMatch = cargoContent.match(/^name\s*=\s*"([^"]+)"/m);
      if (nameMatch) projectName = nameMatch[1];
      if (cargoContent.includes('actix')) framework = 'Actix';
      else if (cargoContent.includes('axum')) framework = 'Axum';
      else if (cargoContent.includes('rocket')) framework = 'Rocket';
      else if (cargoContent.includes('warp')) framework = 'Warp';
      else framework = 'Rust stdlib';
    } else if (hasPkgJson) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(this.projectPath, 'package.json'), 'utf-8'));
        projectName = pkg.name ?? projectName;
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (deps.next) framework = 'Next.js';
        else if (deps.react) framework = 'React';
        else if (deps.vue) framework = 'Vue';
        else if (deps['@angular/core']) framework = 'Angular';
        else if (deps.svelte) framework = 'Svelte';
        else if (deps.express) framework = 'Express';
        else if (deps.fastify) framework = 'Fastify';
        else if (deps['@nestjs/core']) framework = 'NestJS';
        else framework = 'Node.js';

        if (deps.jest) testFramework = 'Jest';
        else if (deps.vitest) testFramework = 'Vitest';
        else if (deps.mocha) testFramework = 'Mocha';

        if (pkg.scripts?.build?.includes('tsc')) buildTool = 'tsc';
        else if (deps.webpack) buildTool = 'Webpack';
        else if (deps.vite) buildTool = 'Vite';
        else if (deps.esbuild) buildTool = 'esbuild';
        else buildTool = 'npm scripts';
      } catch { /* ignore parse errors */ }
    }

    return {
      projectName,
      language,
      framework,
      buildTool,
      testFramework,
      totalFiles: 0,
      totalSourceFiles: 0,
      totalTestFiles: 0,
      totalLines: 0,
    };
  }

  // ── File tree ───────────────────────────────────────────────────────────

  private scanFileTree(dir: string, depth: number, maxDepth: number): FileNode[] {
    if (depth > maxDepth) return [];
    const nodes: FileNode[] = [];

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return nodes;
    }

    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (this.shouldIgnore(entry.name)) continue;

      const rel = path.relative(this.projectPath, path.join(dir, entry.name));

      if (entry.isDirectory()) {
        const children = this.scanFileTree(path.join(dir, entry.name), depth + 1, maxDepth);
        nodes.push({ path: rel, type: 'directory', children });
      } else {
        nodes.push({ path: rel, type: 'file' });
      }
    }

    return nodes;
  }

  private renderTreeToLines(nodes: FileNode[], lines: string[], indent: string): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const isLast = i === nodes.length - 1;
      const prefix = isLast ? '└── ' : '├── ';
      const name = path.basename(node.path);

      if (node.type === 'directory') {
        lines.push(`${indent}${prefix}${name}/`);
        const childIndent = indent + (isLast ? '    ' : '│   ');
        if (node.children && node.children.length > 0) {
          this.renderTreeToLines(node.children, lines, childIndent);
        }
      } else {
        lines.push(`${indent}${prefix}${name}`);
      }
    }
  }

  // ── Source file collection ──────────────────────────────────────────────

  private collectSourceFiles(dir: string): string[] {
    const files: string[] = [];
    this.walkDir(dir, (filePath) => {
      const ext = path.extname(filePath);
      if (SOURCE_EXTENSIONS.has(ext)) {
        files.push(path.relative(this.projectPath, filePath));
      }
    });
    return files;
  }

  private walkDir(dir: string, callback: (filePath: string) => void): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (this.shouldIgnore(entry.name)) continue;

      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkDir(full, callback);
      } else {
        callback(full);
      }
    }
  }

  // ── Module analysis ────────────────────────────────────────────────────

  private analyzeModules(files: string[]): ModuleSummary[] {
    return files.map(relPath => {
      const absPath = path.join(this.projectPath, relPath);
      let content: string;
      try {
        content = fs.readFileSync(absPath, 'utf-8');
      } catch {
        return null;
      }

      const lines = content.split('\n').length;
      const ext = path.extname(relPath);
      const language = this.extToLanguage(ext);

      const exports = this.extractExports(content, language);
      const imports = this.extractImports(content, language);
      const description = this.generateDescription(content, exports, relPath);

      return { filePath: relPath, language, lines, exports, imports, description };
    }).filter(Boolean) as ModuleSummary[];
  }

  private extractExports(content: string, language: string): ExportEntry[] {
    const exports: ExportEntry[] = [];

    if (language === 'python') {
      return this.extractPythonExports(content);
    }

    if (!['typescript', 'javascript'].includes(language)) return exports;

    const patterns: [RegExp, ExportEntry['kind']][] = [
      [/export\s+class\s+(\w+)/g, 'class'],
      [/export\s+abstract\s+class\s+(\w+)/g, 'class'],
      [/export\s+(?:async\s+)?function\s+(\w+)/g, 'function'],
      [/export\s+interface\s+(\w+)/g, 'interface'],
      [/export\s+type\s+(\w+)/g, 'type'],
      [/export\s+enum\s+(\w+)/g, 'enum'],
      [/export\s+const\s+(\w+)/g, 'const'],
    ];

    for (const [regex, kind] of patterns) {
      let m: RegExpExecArray | null;
      while ((m = regex.exec(content)) !== null) {
        const name = m[1];
        let signature: string | undefined;

        if (kind === 'function') {
          const sigMatch = content.substring(m.index).match(
            /export\s+(?:async\s+)?function\s+\w+\s*(\([^)]*\))\s*(?::\s*([^\s{]+))?/,
          );
          if (sigMatch) {
            signature = `${sigMatch[1]}${sigMatch[2] ? ` -> ${sigMatch[2]}` : ''}`;
          }
        }

        if (kind === 'class') {
          const classMatch = content.substring(m.index).match(
            /class\s+\w+(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/,
          );
          if (classMatch) {
            const parts: string[] = [];
            if (classMatch[1]) parts.push(`extends ${classMatch[1]}`);
            if (classMatch[2]) parts.push(`implements ${classMatch[2].trim()}`);
            if (parts.length > 0) signature = parts.join(' ');
          }
        }

        exports.push({ name, kind, signature });
      }
    }

    if (/export\s+default\s+/.test(content)) {
      const defaultMatch = content.match(/export\s+default\s+(?:class|function)?\s*(\w+)?/);
      exports.push({
        name: defaultMatch?.[1] ?? 'default',
        kind: 'default',
      });
    }

    return exports;
  }

  private extractPythonExports(content: string): ExportEntry[] {
    const exports: ExportEntry[] = [];
    const seen = new Set<string>();

    // Top-level classes
    const classPattern = /^class\s+(\w+)(?:\(([^)]*)\))?:/gm;
    let m: RegExpExecArray | null;
    while ((m = classPattern.exec(content)) !== null) {
      const name = m[1];
      if (!seen.has(name)) {
        seen.add(name);
        const bases = m[2]?.trim();
        exports.push({ name, kind: 'class', signature: bases ? `(${bases})` : undefined });
      }
    }

    // Top-level functions (not indented = module-level)
    const fnPattern = /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^\n:]+))?:/gm;
    while ((m = fnPattern.exec(content)) !== null) {
      const name = m[1];
      if (!name.startsWith('_') && !seen.has(name)) {
        seen.add(name);
        const params = m[2]?.trim();
        const returnType = m[3]?.trim();
        let signature = `(${params})`;
        if (returnType) signature += ` -> ${returnType}`;
        exports.push({ name, kind: 'function', signature });
      }
    }

    // Module-level constants (UPPER_CASE = ...)
    const constPattern = /^([A-Z][A-Z_0-9]+)\s*(?::\s*\w+\s*)?=/gm;
    while ((m = constPattern.exec(content)) !== null) {
      const name = m[1];
      if (!seen.has(name)) {
        seen.add(name);
        exports.push({ name, kind: 'const' });
      }
    }

    // __all__ exports
    const allMatch = content.match(/__all__\s*=\s*\[([^\]]+)\]/);
    if (allMatch) {
      const names = allMatch[1].match(/['"](\w+)['"]/g);
      if (names) {
        for (const n of names) {
          const clean = n.replace(/['"]/g, '');
          if (!seen.has(clean)) {
            seen.add(clean);
            exports.push({ name: clean, kind: 'variable' });
          }
        }
      }
    }

    return exports;
  }

  private extractImports(content: string, language: string): string[] {
    const imports: string[] = [];
    const seen = new Set<string>();

    if (language === 'python') {
      // from X import Y  and  import X
      const fromImport = /^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
      let m: RegExpExecArray | null;
      while ((m = fromImport.exec(content)) !== null) {
        const imp = m[1] ?? m[2];
        if (imp && !seen.has(imp)) {
          seen.add(imp);
          imports.push(imp);
        }
      }
      return imports;
    }

    if (!['typescript', 'javascript'].includes(language)) return imports;

    const regex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      const imp = m[1];
      if (!seen.has(imp)) {
        seen.add(imp);
        imports.push(imp);
      }
    }

    return imports;
  }

  private generateDescription(content: string, exports: ExportEntry[], filePath: string): string {
    // JS/TS doc comments
    const firstComment = content.match(/^\/\*\*\s*\n\s*\*\s*(.+?)(?:\n|\*\/)/);
    if (firstComment) return firstComment[1].trim();

    const firstLineComment = content.match(/^\/\/\s*(.+)$/m);
    if (firstLineComment && content.indexOf(firstLineComment[0]) < 100) {
      return firstLineComment[1].trim();
    }

    // Python docstrings (module-level)
    const pyDocstring = content.match(/^(?:#![^\n]*\n)*(?:#[^\n]*\n)*\s*(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/);
    if (pyDocstring) {
      const doc = (pyDocstring[1] ?? pyDocstring[2] ?? '').trim().split('\n')[0];
      if (doc) return doc;
    }

    // Python # comments at top
    const pyComment = content.match(/^#\s*(.+)$/m);
    if (pyComment && content.indexOf(pyComment[0]) < 100) {
      return pyComment[1].trim();
    }

    const classExports = exports.filter(e => e.kind === 'class');
    const fnExports = exports.filter(e => e.kind === 'function');
    const typeExports = exports.filter(e => e.kind === 'interface' || e.kind === 'type' || e.kind === 'enum');

    if (classExports.length === 1 && exports.length <= 3) {
      return `Defines the ${classExports[0].name} class${classExports[0].signature ? ` (${classExports[0].signature})` : ''}.`;
    }

    if (typeExports.length > 0 && classExports.length === 0 && fnExports.length === 0) {
      return `Type definitions: ${typeExports.map(e => e.name).join(', ')}.`;
    }

    if (filePath.includes('index') || filePath.includes('__init__')) {
      return 'Package init — re-exports from submodules.';
    }

    return '';
  }

  // ── Dependency graph ───────────────────────────────────────────────────

  private buildDependencyGraph(modules: ModuleSummary[]): DependencyEdge[] {
    const edges: DependencyEdge[] = [];
    const moduleSet = new Set(modules.map(m => m.filePath));

    for (const mod of modules) {
      const fromDir = path.dirname(mod.filePath);
      for (const imp of mod.imports) {
        if (!imp.startsWith('.') && !imp.startsWith('/')) continue;

        const resolved = this.resolveImportPath(fromDir, imp);
        if (resolved && moduleSet.has(resolved)) {
          const fromShort = this.shortenPath(mod.filePath);
          const toShort = this.shortenPath(resolved);
          if (fromShort !== toShort) {
            edges.push({ from: fromShort, to: toShort });
          }
        }
      }
    }

    const unique = new Map<string, DependencyEdge>();
    for (const e of edges) {
      const key = `${e.from}|${e.to}`;
      if (!unique.has(key)) unique.set(key, e);
    }

    return Array.from(unique.values());
  }

  private resolveImportPath(fromDir: string, importPath: string): string | null {
    const target = path.normalize(path.join(fromDir, importPath));
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', ''];
    const suffixes = ['', '/index', '/__init__'];

    for (const suffix of suffixes) {
      for (const ext of extensions) {
        const candidate = target + suffix + ext;
        const absCandidate = path.join(this.projectPath, candidate);
        if (fs.existsSync(absCandidate)) {
          return candidate;
        }
      }
    }

    return null;
  }

  private shortenPath(filePath: string): string {
    return filePath
      .replace(/\/index\.[jt]sx?$/, '')
      .replace(/\/__init__\.py$/, '')
      .replace(/\.[jt]sx?$/, '')
      .replace(/\.py$/, '');
  }

  // ── External dependencies ─────────────────────────────────────────────

  private extractExternalDeps(): ExternalDep[] {
    // Try package.json first (Node.js)
    const pkgPath = path.join(this.projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      return this.extractNodeDeps(pkgPath);
    }

    // Try Python dependency files
    const reqPath = path.join(this.projectPath, 'requirements.txt');
    const pyprojectPath = path.join(this.projectPath, 'pyproject.toml');
    if (fs.existsSync(reqPath) || fs.existsSync(pyprojectPath)) {
      return this.extractPythonDeps();
    }

    // Try go.mod
    const goModPath = path.join(this.projectPath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      return this.extractGoDeps(goModPath);
    }

    // Try Cargo.toml
    const cargoPath = path.join(this.projectPath, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      return this.extractCargoDeps(cargoPath);
    }

    return [];
  }

  private extractNodeDeps(pkgPath: string): ExternalDep[] {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps: ExternalDep[] = [];
      const wellKnown: Record<string, string> = {
        react: 'UI component library',
        next: 'Full-stack React framework',
        vue: 'Progressive UI framework',
        express: 'HTTP server framework',
        fastify: 'High-performance HTTP framework',
        '@nestjs/core': 'Enterprise Node.js framework',
        typescript: 'Type-safe JavaScript superset',
        jest: 'Testing framework',
        vitest: 'Vite-native testing framework',
        prisma: 'Database ORM',
        '@prisma/client': 'Prisma database client',
        mongoose: 'MongoDB ODM',
        winston: 'Logging library',
        commander: 'CLI framework',
        chalk: 'Terminal string styling',
        zod: 'Schema validation',
        axios: 'HTTP client',
        '@anthropic-ai/sdk': 'Anthropic Claude API SDK',
        uuid: 'UUID generation',
        yaml: 'YAML parsing',
        ora: 'Terminal spinner',
        enquirer: 'Interactive CLI prompts',
        conf: 'Configuration management',
        webpack: 'Module bundler',
        vite: 'Frontend build tool',
        esbuild: 'Fast JS bundler',
        eslint: 'Code linter',
        prettier: 'Code formatter',
        tailwindcss: 'Utility-first CSS framework',
      };

      for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
        deps.push({ name, version: String(version), purpose: wellKnown[name] });
      }
      return deps;
    } catch {
      return [];
    }
  }

  private extractPythonDeps(): ExternalDep[] {
    const deps: ExternalDep[] = [];
    const seen = new Set<string>();

    const wellKnown: Record<string, string> = {
      django: 'Full-stack web framework',
      flask: 'Lightweight web framework',
      fastapi: 'Async web framework with auto docs',
      celery: 'Distributed task queue',
      sqlalchemy: 'SQL toolkit and ORM',
      alembic: 'Database migration tool',
      pydantic: 'Data validation using type hints',
      requests: 'HTTP client library',
      httpx: 'Async HTTP client',
      pytest: 'Testing framework',
      numpy: 'Numerical computing',
      pandas: 'Data analysis library',
      scipy: 'Scientific computing',
      boto3: 'AWS SDK for Python',
      'google-cloud-storage': 'GCP Storage client',
      'google-cloud-pubsub': 'GCP Pub/Sub client',
      'google-cloud-bigquery': 'GCP BigQuery client',
      redis: 'Redis client',
      psycopg2: 'PostgreSQL adapter',
      gunicorn: 'WSGI HTTP server',
      uvicorn: 'ASGI HTTP server',
      black: 'Code formatter',
      ruff: 'Fast Python linter',
      mypy: 'Static type checker',
      click: 'CLI framework',
      typer: 'CLI framework (type hints)',
      tensorflow: 'Machine learning framework',
      torch: 'Deep learning framework',
      transformers: 'NLP models library',
      scrapy: 'Web scraping framework',
      beautifulsoup4: 'HTML parsing',
      pillow: 'Image processing',
      marshmallow: 'Object serialization',
    };

    const reqPath = path.join(this.projectPath, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      const content = this.safeReadFile(reqPath);
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)(?:\[.*?\])?\s*([>=<!~]+\s*[\d.*]+)?/);
        if (match && !seen.has(match[1].toLowerCase())) {
          seen.add(match[1].toLowerCase());
          deps.push({
            name: match[1],
            version: match[2]?.trim() ?? '*',
            purpose: wellKnown[match[1].toLowerCase()],
          });
        }
      }
    }

    const pyprojectPath = path.join(this.projectPath, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      const content = this.safeReadFile(pyprojectPath);
      const depSection = content.match(/\[(?:project\.)?dependencies\]\s*\n([\s\S]*?)(?:\n\[|\n$)/);
      if (depSection) {
        const lines = depSection[1].split('\n');
        for (const line of lines) {
          const match = line.match(/^\s*["']?([a-zA-Z0-9_-]+)/);
          if (match && !seen.has(match[1].toLowerCase())) {
            seen.add(match[1].toLowerCase());
            deps.push({
              name: match[1],
              version: '*',
              purpose: wellKnown[match[1].toLowerCase()],
            });
          }
        }
      }
    }

    return deps;
  }

  private extractGoDeps(goModPath: string): ExternalDep[] {
    const deps: ExternalDep[] = [];
    try {
      const content = fs.readFileSync(goModPath, 'utf-8');
      const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/);
      if (requireBlock) {
        for (const line of requireBlock[1].split('\n')) {
          const match = line.trim().match(/^([\w./-]+)\s+(v[\d.]+)/);
          if (match) {
            deps.push({ name: match[1], version: match[2] });
          }
        }
      }
      const singleRequires = content.matchAll(/^require\s+([\w./-]+)\s+(v[\d.]+)/gm);
      for (const m of singleRequires) {
        deps.push({ name: m[1], version: m[2] });
      }
    } catch { /* ignore */ }
    return deps;
  }

  private extractCargoDeps(cargoPath: string): ExternalDep[] {
    const deps: ExternalDep[] = [];
    try {
      const content = fs.readFileSync(cargoPath, 'utf-8');
      const depSection = content.match(/\[dependencies\]([\s\S]*?)(?:\n\[|$)/);
      if (depSection) {
        for (const line of depSection[1].split('\n')) {
          const simple = line.match(/^(\w[\w-]*)\s*=\s*"([^"]+)"/);
          const complex = line.match(/^(\w[\w-]*)\s*=\s*\{/);
          if (simple) {
            deps.push({ name: simple[1], version: simple[2] });
          } else if (complex) {
            const vMatch = line.match(/version\s*=\s*"([^"]+)"/);
            deps.push({ name: complex[1], version: vMatch?.[1] ?? '*' });
          }
        }
      }
    } catch { /* ignore */ }
    return deps;
  }

  // ── Entry points ──────────────────────────────────────────────────────

  private findEntryPoints(): string[] {
    const entryPoints: string[] = [];

    // Node.js / package.json
    const pkgPath = path.join(this.projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

        if (pkg.main) entryPoints.push(`${pkg.main} (main)`);
        if (pkg.bin) {
          if (typeof pkg.bin === 'string') {
            entryPoints.push(`${pkg.bin} (bin)`);
          } else {
            for (const [cmd, binPath] of Object.entries(pkg.bin)) {
              entryPoints.push(`${binPath} (bin: ${cmd})`);
            }
          }
        }
        if (pkg.scripts?.start) {
          entryPoints.push(`npm start -> ${pkg.scripts.start}`);
        }
        if (pkg.scripts?.dev) {
          entryPoints.push(`npm run dev -> ${pkg.scripts.dev}`);
        }
      } catch { /* ignore */ }
    }

    // Node.js common entries
    const nodeEntries = ['src/index.ts', 'src/main.ts', 'src/app.ts', 'src/cli.ts', 'index.ts', 'main.ts'];
    for (const entry of nodeEntries) {
      if (fs.existsSync(path.join(this.projectPath, entry)) && !entryPoints.some(e => e.includes(entry))) {
        entryPoints.push(entry);
      }
    }

    // Python
    const pythonEntries = [
      'main.py', 'app.py', 'manage.py', 'wsgi.py', 'asgi.py',
      'run.py', 'server.py', 'cli.py',
      'src/main.py', 'src/app.py',
      'app/main.py', 'app/__init__.py',
    ];
    for (const entry of pythonEntries) {
      if (fs.existsSync(path.join(this.projectPath, entry))) {
        const content = this.safeReadFile(path.join(this.projectPath, entry));
        let label = entry;
        if (entry === 'manage.py') label = `${entry} (Django management)`;
        else if (entry.includes('wsgi')) label = `${entry} (WSGI entry)`;
        else if (entry.includes('asgi')) label = `${entry} (ASGI entry)`;
        else if (content.includes('if __name__')) label = `${entry} (main)`;
        entryPoints.push(label);
      }
    }

    // Detect Python entry from pyproject.toml [project.scripts]
    const pyprojectPath = path.join(this.projectPath, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      const content = this.safeReadFile(pyprojectPath);
      const scriptMatch = content.match(/\[project\.scripts\]\s*\n([\s\S]*?)(?:\n\[|$)/);
      if (scriptMatch) {
        for (const line of scriptMatch[1].split('\n')) {
          const m = line.match(/^(\w+)\s*=\s*"([^"]+)"/);
          if (m) entryPoints.push(`${m[2]} (script: ${m[1]})`);
        }
      }
    }

    // Go
    const goMainFile = path.join(this.projectPath, 'main.go');
    const goCmdDir = path.join(this.projectPath, 'cmd');
    if (fs.existsSync(goMainFile)) {
      entryPoints.push('main.go (main)');
    }
    if (fs.existsSync(goCmdDir)) {
      try {
        const cmds = fs.readdirSync(goCmdDir, { withFileTypes: true });
        for (const cmd of cmds) {
          if (cmd.isDirectory()) {
            entryPoints.push(`cmd/${cmd.name}/ (command)`);
          }
        }
      } catch { /* ignore */ }
    }

    // Rust
    const rustMain = path.join(this.projectPath, 'src', 'main.rs');
    const rustLib = path.join(this.projectPath, 'src', 'lib.rs');
    if (fs.existsSync(rustMain)) entryPoints.push('src/main.rs (binary)');
    if (fs.existsSync(rustLib)) entryPoints.push('src/lib.rs (library)');

    // Makefile targets
    if (fs.existsSync(path.join(this.projectPath, 'Makefile'))) {
      entryPoints.push('Makefile (build targets)');
    }

    return entryPoints;
  }

  // ── Pattern detection ─────────────────────────────────────────────────

  private detectPatterns(modules: ModuleSummary[]): string[] {
    const patterns: string[] = [];
    const allExports = modules.flatMap(m => m.exports);
    const allPaths = modules.map(m => m.filePath);

    // Language-agnostic patterns
    if (allPaths.some(p => /controller/i.test(p)) && allPaths.some(p => /service/i.test(p))) {
      patterns.push('Controller-Service pattern (routes separated from business logic)');
    }
    if (allPaths.some(p => /middleware/i.test(p))) {
      patterns.push('Middleware pattern for request processing');
    }
    if (allPaths.some(p => /utils/i.test(p) || /helpers/i.test(p))) {
      patterns.push('Shared utility/helper modules');
    }
    if (allPaths.some(p => /config/i.test(p))) {
      patterns.push('External configuration (config files)');
    }

    // JS/TS specific
    if (allExports.some(e => e.kind === 'class' && e.signature?.includes('extends')) &&
        allExports.some(e => e.kind === 'interface')) {
      patterns.push('Object-oriented design with inheritance and interfaces');
    }
    if (allPaths.some(p => /index\.[jt]sx?$/.test(p))) {
      patterns.push('Barrel exports (index files for clean imports)');
    }
    if (allExports.some(e => e.kind === 'enum')) {
      patterns.push('Enums for type-safe constants');
    }
    if (allPaths.some(p => p.includes('types') || p.includes('interfaces'))) {
      patterns.push('Centralized type definitions');
    }

    // Python specific
    if (allPaths.some(p => p.endsWith('__init__.py'))) {
      patterns.push('Python package structure (__init__.py modules)');
    }
    if (allPaths.some(p => /models\.py/i.test(p)) && allPaths.some(p => /views\.py/i.test(p))) {
      patterns.push('Django MVT pattern (models/views/templates)');
    }
    if (allPaths.some(p => /routers?\//i.test(p) || /routes?\//i.test(p))) {
      patterns.push('Router-based API structure');
    }
    if (allPaths.some(p => /schemas?\//i.test(p) || /schemas?\.py/i.test(p))) {
      patterns.push('Schema validation layer (Pydantic/Marshmallow)');
    }
    if (allPaths.some(p => /migrations?\//i.test(p))) {
      patterns.push('Database migrations');
    }
    if (allPaths.some(p => /tasks?\.py/i.test(p)) || allPaths.some(p => /celery/i.test(p))) {
      patterns.push('Background task processing');
    }
    if (allPaths.some(p => /decorators?\.py/i.test(p))) {
      patterns.push('Decorator pattern for cross-cutting concerns');
    }

    const dirs = new Set(allPaths.map(p => p.split('/').slice(0, -1).join('/')));
    if (dirs.size >= 3) {
      patterns.push(`Modular directory structure (${dirs.size} directories)`);
    }

    return patterns;
  }

  // ── Test structure ────────────────────────────────────────────────────

  private analyzeTestStructure(testFiles: string[]): TestStructure {
    const dirs = [...new Set(testFiles.map(f => path.dirname(f)))];
    const frameworks: string[] = [];

    // Node.js test frameworks
    const pkgPath = path.join(this.projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.jest) frameworks.push('Jest');
        if (deps.vitest) frameworks.push('Vitest');
        if (deps.mocha) frameworks.push('Mocha');
        if (deps.cypress) frameworks.push('Cypress');
        if (deps.playwright || deps['@playwright/test']) frameworks.push('Playwright');
      } catch { /* ignore */ }
    }

    // Python test frameworks
    const pyDeps = this.readPythonDeps();
    const allPyDeps = pyDeps.join(' ').toLowerCase();
    if (allPyDeps.includes('pytest')) frameworks.push('pytest');
    if (allPyDeps.includes('nose')) frameworks.push('nose');
    if (fs.existsSync(path.join(this.projectPath, 'pytest.ini')) ||
        fs.existsSync(path.join(this.projectPath, 'conftest.py'))) {
      if (!frameworks.includes('pytest')) frameworks.push('pytest');
    }

    // Go
    if (fs.existsSync(path.join(this.projectPath, 'go.mod'))) {
      if (!frameworks.includes('go test')) frameworks.push('go test');
    }

    return { dirs, fileCount: testFiles.length, frameworks };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private isTestFile(filePath: string): boolean {
    return TEST_PATTERNS.some(p => p.test(filePath));
  }

  private shouldIgnore(name: string): boolean {
    return this.customIgnore.some(pattern => {
      if (pattern.startsWith('*')) {
        return name.endsWith(pattern.slice(1));
      }
      return name === pattern;
    });
  }

  private extToLanguage(ext: string): string {
    const map: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript',
      '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
      '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java',
      '.kt': 'kotlin', '.rb': 'ruby', '.vue': 'vue', '.svelte': 'svelte',
    };
    return map[ext] ?? 'unknown';
  }

  private readPythonDeps(): string[] {
    const deps: string[] = [];
    const files = ['requirements.txt', 'requirements-dev.txt', 'requirements_dev.txt'];
    for (const file of files) {
      const p = path.join(this.projectPath, file);
      if (fs.existsSync(p)) {
        const content = this.safeReadFile(p);
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-')) {
            const name = trimmed.split(/[>=<!~\[\s]/)[0];
            if (name) deps.push(name);
          }
        }
      }
    }
    const pyprojectPath = path.join(this.projectPath, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      const content = this.safeReadFile(pyprojectPath);
      const depMatches = content.match(/["']([a-zA-Z0-9_-]+)(?:\[.*?\])?[>=<!~]/g);
      if (depMatches) {
        for (const m of depMatches) {
          const name = m.replace(/^["']/, '').split(/[>=<!~\[]/)[0];
          if (name) deps.push(name);
        }
      }
    }
    return deps;
  }

  private safeReadFile(filePath: string): string {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  private groupByDirectory(modules: ModuleSummary[]): Record<string, ModuleSummary[]> {
    const groups: Record<string, ModuleSummary[]> = {};
    for (const mod of modules) {
      const dir = path.dirname(mod.filePath) || '.';
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(mod);
    }
    return groups;
  }
}
