import * as fs from 'fs';
import * as path from 'path';
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
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '.cdm', '.cache', '.turbo', '__pycache__', '.venv',
  'venv', 'env', '.env', '.idea', '.vscode', '.DS_Store',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '*.map', '*.d.ts', '*.min.js', '*.min.css',
];

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.rb',
  '.vue', '.svelte', '.astro',
]);

const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /_test\.[jt]sx?$/,
  /test_.*\.py$/, /.*_test\.py$/, /.*_test\.go$/,
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

    const pkgPath = path.join(this.projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        projectName = pkg.name ?? projectName;
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (fs.existsSync(path.join(this.projectPath, 'tsconfig.json'))) language = 'TypeScript';
        else language = 'JavaScript';

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
    } else if (fs.existsSync(path.join(this.projectPath, 'pyproject.toml')) ||
               fs.existsSync(path.join(this.projectPath, 'requirements.txt'))) {
      language = 'Python';
      framework = 'unknown';
      buildTool = fs.existsSync(path.join(this.projectPath, 'pyproject.toml')) ? 'poetry/pip' : 'pip';
      testFramework = 'pytest';
    } else if (fs.existsSync(path.join(this.projectPath, 'go.mod'))) {
      language = 'Go';
      buildTool = 'go';
      testFramework = 'go test';
    } else if (fs.existsSync(path.join(this.projectPath, 'Cargo.toml'))) {
      language = 'Rust';
      buildTool = 'cargo';
      testFramework = 'cargo test';
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

  private extractImports(content: string, language: string): string[] {
    const imports: string[] = [];
    if (!['typescript', 'javascript'].includes(language)) return imports;

    const regex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
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
    const firstComment = content.match(/^\/\*\*\s*\n\s*\*\s*(.+?)(?:\n|\*\/)/);
    if (firstComment) return firstComment[1].trim();

    const firstLineComment = content.match(/^\/\/\s*(.+)$/m);
    if (firstLineComment && content.indexOf(firstLineComment[0]) < 100) {
      return firstLineComment[1].trim();
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

    if (filePath.includes('index')) {
      return 'Barrel file — re-exports from sibling modules.';
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
    const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
    const suffixes = ['', '/index'];

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
      .replace(/\.[jt]sx?$/, '');
  }

  // ── External dependencies ─────────────────────────────────────────────

  private extractExternalDeps(): ExternalDep[] {
    const pkgPath = path.join(this.projectPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return [];

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
        deps.push({
          name,
          version: String(version),
          purpose: wellKnown[name],
        });
      }

      return deps;
    } catch {
      return [];
    }
  }

  // ── Entry points ──────────────────────────────────────────────────────

  private findEntryPoints(): string[] {
    const entryPoints: string[] = [];

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

    const commonEntries = ['src/index.ts', 'src/main.ts', 'src/app.ts', 'src/cli.ts', 'index.ts', 'main.ts'];
    for (const entry of commonEntries) {
      if (fs.existsSync(path.join(this.projectPath, entry)) && !entryPoints.some(e => e.includes(entry))) {
        entryPoints.push(entry);
      }
    }

    return entryPoints;
  }

  // ── Pattern detection ─────────────────────────────────────────────────

  private detectPatterns(modules: ModuleSummary[]): string[] {
    const patterns: string[] = [];
    const allExports = modules.flatMap(m => m.exports);
    const allPaths = modules.map(m => m.filePath);

    if (allPaths.some(p => p.includes('controller')) && allPaths.some(p => p.includes('service'))) {
      patterns.push('Controller-Service pattern (routes separated from business logic)');
    }
    if (allPaths.some(p => p.includes('middleware'))) {
      patterns.push('Middleware pattern for request processing');
    }
    if (allExports.some(e => e.kind === 'class' && e.signature?.includes('extends')) &&
        allExports.some(e => e.kind === 'interface')) {
      patterns.push('Object-oriented design with inheritance and interfaces');
    }
    if (allPaths.some(p => p.includes('utils') || p.includes('helpers'))) {
      patterns.push('Shared utility/helper modules');
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
    if (allPaths.some(p => p.includes('config'))) {
      patterns.push('External configuration (config files)');
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
