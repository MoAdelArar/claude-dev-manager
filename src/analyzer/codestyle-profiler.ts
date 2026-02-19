import * as fs from 'node:fs';
import * as path from 'node:path';
import logger from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CodeStyleProfile {
  generatedAt: string;
  projectName: string;
  naming: NamingConventions;
  architecture: ArchitectureProfile;
  errorHandling: ErrorHandlingProfile;
  imports: ImportStyleProfile;
  formatting: FormattingProfile;
  testing: TestingProfile;
  typescript: TypeScriptProfile;
  api: APIProfile;
  stateManagement: string;
  samples: CodeSamples;
}

interface NamingConventions {
  files: string;
  directories: string;
  variables: string;
  functions: string;
  classes: string;
  interfaces: string;
  types: string;
  enums: string;
  constants: string;
  components: string;
  testFiles: string;
}

interface ArchitectureProfile {
  pattern: string;
  layers: string[];
  directoryStrategy: string;
  dependencyDirection: string;
  entryPointPattern: string;
}

interface ErrorHandlingProfile {
  strategy: string;
  customErrorClasses: boolean;
  errorBoundaries: boolean;
  resultTypes: boolean;
  asyncErrorStyle: string;
}

interface ImportStyleProfile {
  moduleSystem: string;
  pathStyle: string;
  barrelExports: boolean;
  typeImports: boolean;
  importOrder: string;
  nodeProtocol: boolean;
}

interface FormattingProfile {
  indentation: string;
  quotes: string;
  semicolons: boolean;
  trailingCommas: string;
  maxLineLength: number;
  bracketSpacing: boolean;
}

interface TestingProfile {
  framework: string;
  style: string;
  fileNaming: string;
  fileLocation: string;
  mockPattern: string;
  fixturePattern: string;
  coverageApproach: string;
}

interface TypeScriptProfile {
  strictMode: boolean;
  anyUsage: string;
  genericsStyle: string;
  enumStyle: string;
  nullHandling: string;
  assertionStyle: string;
}

interface APIProfile {
  style: string;
  routePattern: string;
  validationApproach: string;
  authPattern: string;
  responseFormat: string;
}

interface CodeSamples {
  typicalFunction: string;
  typicalClass: string;
  typicalTest: string;
  typicalImportBlock: string;
  typicalErrorHandler: string;
}

// ─── Source patterns used for detection ──────────────────────────────────────

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.rb', '.java', '.kt',
]);
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '.cdm', '.cache', '__pycache__', '.venv', 'venv',
  'env', '.env', '.tox', '.mypy_cache', '.pytest_cache', '.ruff_cache',
  'target', 'vendor',
]);

// ─── Profiler ───────────────────────────────────────────────────────────────

export class CodeStyleProfiler {
  private projectPath: string;
  private sourceContents: Map<string, string> = new Map();

  constructor(projectPath: string) {
    this.projectPath = path.resolve(projectPath);
  }

  async profile(): Promise<CodeStyleProfile> {
    logger.info('Starting code style profiling...');

    this.loadSourceFiles();
    const projectName = this.detectProjectName();

    const result: CodeStyleProfile = {
      generatedAt: new Date().toISOString(),
      projectName,
      naming: this.detectNaming(),
      architecture: this.detectArchitecture(),
      errorHandling: this.detectErrorHandling(),
      imports: this.detectImportStyle(),
      formatting: this.detectFormatting(),
      testing: this.detectTesting(),
      typescript: this.detectTypeScript(),
      api: this.detectAPI(),
      stateManagement: this.detectStateManagement(),
      samples: this.extractSamples(),
    };

    logger.info(`Code style profiling complete for ${projectName}`);
    return result;
  }

  generateMarkdown(profile: CodeStyleProfile): string {
    const s: string[] = [];

    s.push(`# Code Style Profile: ${profile.projectName}`);
    s.push(`> Generated: ${profile.generatedAt}`);
    s.push(`> IMPORTANT: Agents MUST follow these conventions when modifying this codebase.\n`);

    // Naming
    s.push('## Naming Conventions');
    s.push(`| Element | Convention | Example |`);
    s.push(`|---|---|---|`);
    s.push(`| Files | ${profile.naming.files} | ${this.namingExample(profile.naming.files, 'file')} |`);
    s.push(`| Directories | ${profile.naming.directories} | ${this.namingExample(profile.naming.directories, 'dir')} |`);
    s.push(`| Variables | ${profile.naming.variables} | \`${profile.naming.variables === 'camelCase' ? 'userName' : 'user_name'}\` |`);
    s.push(`| Functions | ${profile.naming.functions} | \`${profile.naming.functions === 'camelCase' ? 'getUserById' : 'get_user_by_id'}\` |`);
    s.push(`| Classes | ${profile.naming.classes} | \`UserService\` |`);
    s.push(`| Interfaces | ${profile.naming.interfaces} | \`${profile.naming.interfaces.includes('I-prefix') ? 'IUserService' : 'UserService'}\` |`);
    s.push(`| Types | ${profile.naming.types} | \`${profile.naming.types === 'PascalCase' ? 'CreateUserInput' : 'createUserInput'}\` |`);
    s.push(`| Enums | ${profile.naming.enums} | |`);
    s.push(`| Constants | ${profile.naming.constants} | \`${profile.naming.constants === 'UPPER_SNAKE_CASE' ? 'MAX_RETRIES' : 'maxRetries'}\` |`);
    s.push(`| Test files | ${profile.naming.testFiles} | |`);
    s.push('');

    // Architecture
    s.push('## Architecture');
    s.push(`- **Pattern:** ${profile.architecture.pattern}`);
    s.push(`- **Layers:** ${profile.architecture.layers.join(' → ')}`);
    s.push(`- **Directory strategy:** ${profile.architecture.directoryStrategy}`);
    s.push(`- **Dependency direction:** ${profile.architecture.dependencyDirection}`);
    s.push(`- **Entry point:** ${profile.architecture.entryPointPattern}`);
    s.push('');

    // Error handling
    s.push('## Error Handling');
    s.push(`- **Strategy:** ${profile.errorHandling.strategy}`);
    s.push(`- **Custom error classes:** ${profile.errorHandling.customErrorClasses ? 'Yes' : 'No'}`);
    s.push(`- **Result/Either types:** ${profile.errorHandling.resultTypes ? 'Yes' : 'No'}`);
    s.push(`- **Error boundaries (React):** ${profile.errorHandling.errorBoundaries ? 'Yes' : 'No'}`);
    s.push(`- **Async errors:** ${profile.errorHandling.asyncErrorStyle}`);
    s.push('');

    // Imports
    s.push('## Import Style');
    s.push(`- **Module system:** ${profile.imports.moduleSystem}`);
    s.push(`- **Path style:** ${profile.imports.pathStyle}`);
    s.push(`- **Barrel exports:** ${profile.imports.barrelExports ? 'Yes — use index files' : 'No — import directly'}`);
    s.push(`- **Type-only imports:** ${profile.imports.typeImports ? 'Yes — use `import type` or `import { type X }`' : 'No'}`);
    s.push(`- **node: protocol:** ${profile.imports.nodeProtocol ? 'Yes — use `node:fs` not `fs`' : 'No'}`);
    s.push(`- **Import ordering:** ${profile.imports.importOrder}`);
    s.push('');

    // Formatting
    s.push('## Formatting');
    s.push(`- **Indentation:** ${profile.formatting.indentation}`);
    s.push(`- **Quotes:** ${profile.formatting.quotes}`);
    s.push(`- **Semicolons:** ${profile.formatting.semicolons ? 'Yes' : 'No'}`);
    s.push(`- **Trailing commas:** ${profile.formatting.trailingCommas}`);
    s.push(`- **Max line length:** ${profile.formatting.maxLineLength}`);
    s.push('');

    // Testing
    s.push('## Testing Conventions');
    s.push(`- **Framework:** ${profile.testing.framework}`);
    s.push(`- **Style:** ${profile.testing.style}`);
    s.push(`- **File naming:** ${profile.testing.fileNaming}`);
    s.push(`- **File location:** ${profile.testing.fileLocation}`);
    s.push(`- **Mocking:** ${profile.testing.mockPattern}`);
    s.push(`- **Fixtures:** ${profile.testing.fixturePattern}`);
    s.push(`- **Coverage:** ${profile.testing.coverageApproach}`);
    s.push('');

    // TypeScript
    s.push('## TypeScript Usage');
    s.push(`- **Strict mode:** ${profile.typescript.strictMode ? 'Yes' : 'No'}`);
    s.push(`- **\`any\` usage:** ${profile.typescript.anyUsage}`);
    s.push(`- **Generics:** ${profile.typescript.genericsStyle}`);
    s.push(`- **Enums:** ${profile.typescript.enumStyle}`);
    s.push(`- **Null handling:** ${profile.typescript.nullHandling}`);
    s.push('');

    // API
    if (profile.api.style !== 'none') {
      s.push('## API Conventions');
      s.push(`- **Style:** ${profile.api.style}`);
      s.push(`- **Route pattern:** ${profile.api.routePattern}`);
      s.push(`- **Validation:** ${profile.api.validationApproach}`);
      s.push(`- **Auth:** ${profile.api.authPattern}`);
      s.push(`- **Response format:** ${profile.api.responseFormat}`);
      s.push('');
    }

    // State management
    if (profile.stateManagement !== 'none') {
      s.push(`## State Management: ${profile.stateManagement}\n`);
    }

    // Code samples
    const lang = this.detectPrimaryLanguage();
    s.push('## Code Samples (follow these patterns)\n');
    if (profile.samples.typicalImportBlock) {
      s.push('### Import block');
      s.push(`\`\`\`${lang}`);
      s.push(profile.samples.typicalImportBlock);
      s.push('```\n');
    }
    if (profile.samples.typicalFunction) {
      s.push('### Function');
      s.push(`\`\`\`${lang}`);
      s.push(profile.samples.typicalFunction);
      s.push('```\n');
    }
    if (profile.samples.typicalClass) {
      s.push('### Class');
      s.push(`\`\`\`${lang}`);
      s.push(profile.samples.typicalClass);
      s.push('```\n');
    }
    if (profile.samples.typicalErrorHandler) {
      s.push('### Error handling');
      s.push(`\`\`\`${lang}`);
      s.push(profile.samples.typicalErrorHandler);
      s.push('```\n');
    }
    if (profile.samples.typicalTest) {
      s.push('### Test');
      s.push(`\`\`\`${lang}`);
      s.push(profile.samples.typicalTest);
      s.push('```\n');
    }

    return s.join('\n');
  }

  saveProfile(outputPath: string, markdown: string): void {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, markdown, 'utf-8');
  }

  // ── Source loading ────────────────────────────────────────────────────

  private loadSourceFiles(): void {
    this.walkDir(this.projectPath, (filePath) => {
      const ext = path.extname(filePath);
      if (SOURCE_EXTENSIONS.has(ext)) {
        const rel = path.relative(this.projectPath, filePath);
        try {
          this.sourceContents.set(rel, fs.readFileSync(filePath, 'utf-8'));
        } catch { /* skip unreadable */ }
      }
    });
  }

  private walkDir(dir: string, cb: (filePath: string) => void): void {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) this.walkDir(full, cb);
      else cb(full);
    }
  }

  private allSource(): string[] {
    return Array.from(this.sourceContents.values());
  }

  private allPaths(): string[] {
    return Array.from(this.sourceContents.keys());
  }

  // ── Naming detection ──────────────────────────────────────────────────

  private detectNaming(): NamingConventions {
    const paths = this.allPaths();
    const sources = this.allSource();
    const lang = this.detectPrimaryLanguage();

    const fileNames = paths.map(p => path.basename(p, path.extname(p)));
    const fileStyle = this.dominantCase(fileNames);

    const dirNames = [...new Set(paths.map(p => path.dirname(p).split('/').pop()!).filter(Boolean))];
    const dirStyle = this.dominantCase(dirNames);

    let varStyle = 'camelCase';
    let fnStyle = 'camelCase';
    let constStyle = 'camelCase';
    let interfaceStyle = 'PascalCase';
    let enumStyle = 'PascalCase with PascalCase values';
    let testNaming = '*.test.ts';
    let componentStyle = 'N/A';

    const allCode = sources.join('\n');

    if (lang === 'python') {
      varStyle = 'snake_case';
      fnStyle = 'snake_case';
      constStyle = 'UPPER_SNAKE_CASE';
      interfaceStyle = 'N/A (Python uses ABC/Protocol)';
      enumStyle = 'PascalCase with UPPER_SNAKE_CASE values';

      const testPaths = paths.filter(p => p.includes('test_') || p.includes('_test.py'));
      testNaming = testPaths.length > 0
        ? (testPaths[0]!.includes('test_') ? 'test_*.py' : '*_test.py')
        : 'test_*.py';
    } else {
      const constNames = [...allCode.matchAll(/(?:const|let)\s+([A-Z][A-Z_0-9]+)\s*=/g)].map(m => m[1]);
      if (constNames.length > 3) constStyle = 'UPPER_SNAKE_CASE';

      const snakeVars = [...allCode.matchAll(/(?:const|let|var)\s+([a-z][a-z_0-9]+)\s*=/g)];
      const camelVars = [...allCode.matchAll(/(?:const|let|var)\s+([a-z][a-zA-Z0-9]+)\s*=/g)];
      if (snakeVars.length > camelVars.length * 2) varStyle = 'snake_case';

      const snakeFns = [...allCode.matchAll(/function\s+([a-z][a-z_0-9]+)\s*\(/g)];
      const camelFns = [...allCode.matchAll(/function\s+([a-z][a-zA-Z0-9]+)\s*\(/g)];
      if (snakeFns.length > camelFns.length * 2) fnStyle = 'snake_case';

      const iPrefixInterfaces = [...allCode.matchAll(/interface\s+(I[A-Z]\w+)/g)];
      if (iPrefixInterfaces.length > 2) interfaceStyle = 'PascalCase with I-prefix';

      const stringEnumValues = [...allCode.matchAll(/=\s*'[a-z_]+'/g)];
      const pascalEnumValues = [...allCode.matchAll(/=\s*'[A-Z][a-zA-Z]+'/g)];
      if (stringEnumValues.length > pascalEnumValues.length) {
        enumStyle = 'PascalCase with snake_case string values';
      }

      const testPaths = paths.filter(p => p.includes('.test.') || p.includes('.spec.'));
      testNaming = testPaths.length > 0
        ? (testPaths[0]!.includes('.spec.') ? '*.spec.ts' : '*.test.ts')
        : '*.test.ts';

      const componentPaths = paths.filter(p => p.endsWith('.tsx') || p.endsWith('.jsx'));
      componentStyle = componentPaths.length > 0 ? 'PascalCase' : 'N/A';
    }

    return {
      files: fileStyle,
      directories: dirStyle,
      variables: varStyle,
      functions: fnStyle,
      classes: 'PascalCase',
      interfaces: interfaceStyle,
      types: 'PascalCase',
      enums: enumStyle,
      constants: constStyle,
      components: componentStyle,
      testFiles: testNaming,
    };
  }

  // ── Architecture detection ────────────────────────────────────────────

  private detectArchitecture(): ArchitectureProfile {
    const paths = this.allPaths();
    const dirs = [...new Set(paths.map(p => p.split('/')[0]!))];

    let pattern = 'Flat / unknown';
    const layers: string[] = [];
    let dirStrategy = 'Layer-based (by function)';
    let depDirection = 'Top-down (controllers → services → models)';

    const hasControllers = paths.some(p => /controller/i.test(p));
    const hasServices = paths.some(p => /service/i.test(p));
    const hasModels = paths.some(p => /model/i.test(p) || /entity/i.test(p));
    const hasRepositories = paths.some(p => /repositor/i.test(p));
    const hasDomain = paths.some(p => /domain/i.test(p));
    const hasUseCases = paths.some(p => /use.?case/i.test(p));
    const hasPages = paths.some(p => /pages\//i.test(p) || /app\//i.test(p));
    const hasComponents = paths.some(p => /components\//i.test(p));
    const hasFeatureDirs = paths.some(p => /features\//i.test(p) || /modules\//i.test(p));

    if (hasDomain && hasUseCases && hasRepositories) {
      pattern = 'Clean Architecture / Hexagonal';
      layers.push('Domain', 'Use Cases', 'Repositories', 'Controllers');
      depDirection = 'Inward (outer layers depend on inner)';
    } else if (hasControllers && hasServices && hasModels) {
      pattern = 'MVC / Layered Architecture';
      layers.push('Controllers', 'Services', 'Models');
      if (hasRepositories) layers.splice(2, 0, 'Repositories');
    } else if (hasPages && hasComponents) {
      pattern = 'Component-based (Frontend)';
      layers.push('Pages/Routes', 'Components', 'Hooks/Utils');
      dirStrategy = 'Feature-based or route-based';
    } else if (hasFeatureDirs) {
      pattern = 'Feature-based / Modular';
      layers.push('Features', 'Shared');
      dirStrategy = 'Feature-based (by domain)';
    } else if (dirs.length <= 3) {
      pattern = 'Simple / Flat';
      layers.push(...dirs);
    }

    if (hasFeatureDirs) dirStrategy = 'Feature-based (by domain)';

    const entryFiles = ['src/index.ts', 'src/main.ts', 'src/app.ts', 'src/server.ts', 'index.ts', 'main.ts'];
    const entryPointPattern = entryFiles.find(e => paths.includes(e)) ?? 'unknown';

    return { pattern, layers, directoryStrategy: dirStrategy, dependencyDirection: depDirection, entryPointPattern };
  }

  // ── Error handling detection ──────────────────────────────────────────

  private detectErrorHandling(): ErrorHandlingProfile {
    const allCode = this.allSource().join('\n');
    const lang = this.detectPrimaryLanguage();

    if (lang === 'python') {
      const tryExcept = (allCode.match(/\btry\s*:/g) ?? []).length;
      const customExceptions = (allCode.match(/class\s+\w+(?:Error|Exception)\s*\(/g) ?? []).length;
      const raiseCount = (allCode.match(/\braise\s+\w+/g) ?? []).length;

      return {
        strategy: tryExcept > 0 ? 'try/except blocks' : 'Exceptions (raise)',
        customErrorClasses: customExceptions > 0,
        errorBoundaries: false,
        resultTypes: false,
        asyncErrorStyle: (allCode.match(/async\s+def/g) ?? []).length > 0 ? 'try/except in async functions' : 'N/A',
      };
    }

    const tryCatchCount = (allCode.match(/try\s*\{/g) ?? []).length;
    const catchCount = (allCode.match(/\.catch\s*\(/g) ?? []).length;
    const resultTypeCount = (allCode.match(/Result<|Either<|Ok\(|Err\(/g) ?? []).length;
    const customErrors = (allCode.match(/class\s+\w+Error\s+extends\s+Error/g) ?? []).length;
    const errorBoundaries = (allCode.match(/ErrorBoundary|componentDidCatch/g) ?? []).length;

    let strategy = 'try/catch blocks';
    if (resultTypeCount > tryCatchCount) strategy = 'Result/Either types (functional)';
    else if (catchCount > tryCatchCount) strategy = 'Promise .catch() chains';

    const asyncErrors = (allCode.match(/async\s+\w+[^{]*\{[\s\S]*?try\s*\{/g) ?? []).length;
    const asyncErrorStyle = asyncErrors > 0 ? 'try/catch in async functions' : 'Promise .catch() or unhandled';

    return {
      strategy,
      customErrorClasses: customErrors > 0,
      errorBoundaries: errorBoundaries > 0,
      resultTypes: resultTypeCount > 0,
      asyncErrorStyle,
    };
  }

  // ── Import style detection ────────────────────────────────────────────

  private detectImportStyle(): ImportStyleProfile {
    const allCode = this.allSource().join('\n');
    const paths = this.allPaths();
    const lang = this.detectPrimaryLanguage();

    if (lang === 'python') {
      const absoluteImports = (allCode.match(/^import\s+\w/gm) ?? []).length;
      const fromImports = (allCode.match(/^from\s+\w/gm) ?? []).length;
      const relativeImports = (allCode.match(/^from\s+\./gm) ?? []).length;

      const barrelExports = paths.some(p => p.endsWith('__init__.py'));

      let importOrder = 'No enforced order detected';
      const firstPy = this.allSource().find(s => s.includes('import ')) ?? '';
      const importLines = firstPy.split('\n').filter(l => /^(?:import|from)\s/.test(l));
      if (importLines.length > 3) {
        const stdlibFirst = importLines[0]?.match(/^(?:import|from)\s+(?:os|sys|re|json|pathlib|typing|collections|datetime|logging|functools|itertools)/);
        if (stdlibFirst) {
          importOrder = 'stdlib → third-party → local (PEP 8 / isort)';
        }
      }

      return {
        moduleSystem: 'Python modules (import/from)',
        pathStyle: relativeImports > absoluteImports / 3 ? 'Relative imports (from . import)' : 'Absolute imports',
        barrelExports,
        typeImports: (allCode.match(/from\s+__future__\s+import\s+annotations/g) ?? []).length > 0,
        importOrder,
        nodeProtocol: false,
      };
    }

    const esImports = (allCode.match(/^import\s+/gm) ?? []).length;
    const requireCalls = (allCode.match(/require\s*\(/g) ?? []).length;
    const moduleSystem = esImports > requireCalls ? 'ES Modules (import/export)' : 'CommonJS (require/module.exports)';

    const aliasImports = (allCode.match(/@\w+\//g) ?? []).length;
    const relativeImports = (allCode.match(/from\s+['"]\.\//g) ?? []).length;
    const pathStyle = aliasImports > relativeImports / 2 ? 'Path aliases (@/..., @components/...)' : 'Relative paths (./...)';

    const barrelExports = paths.some(p => /\/index\.[jt]sx?$/.test(p));
    const typeImports = (allCode.match(/import\s+type\s|import\s*\{\s*type\s/g) ?? []).length > 2;
    const nodeProtocol = (allCode.match(/from\s+['"]node:/g) ?? []).length > 0;

    let importOrder = 'No enforced order detected';
    const firstFile = this.allSource()[0] ?? '';
    const importLines = firstFile.split('\n').filter(l => l.startsWith('import '));
    if (importLines.length > 3) {
      const hasNodeFirst = importLines[0]?.includes('node:') || importLines[0]?.includes('from \'fs') || importLines[0]?.includes('from \'path');
      const hasExternalNext = importLines.some((l, i) => i > 0 && !l.includes('./') && !l.includes('node:'));
      if (hasNodeFirst && hasExternalNext) {
        importOrder = 'Node builtins → External packages → Internal modules';
      }
    }

    return { moduleSystem, pathStyle, barrelExports, typeImports, importOrder, nodeProtocol };
  }

  // ── Formatting detection ──────────────────────────────────────────────

  private detectFormatting(): FormattingProfile {
    const lang = this.detectPrimaryLanguage();
    let indentation = lang === 'python' ? '4 spaces' : '2 spaces';
    let quotes: 'single' | 'double' = lang === 'python' ? 'double' : 'single';
    let semicolons = lang !== 'python';
    let trailingCommas = 'es5';
    let maxLineLength = lang === 'python' ? 88 : 100;

    if (lang === 'python') {
      // Check Python-specific formatters
      const pyprojectContent = this.readConfigFile(['pyproject.toml']);
      if (pyprojectContent) {
        const blackLine = pyprojectContent.match(/line[_-]length\s*=\s*(\d+)/);
        if (blackLine) maxLineLength = parseInt(blackLine[1], 10);
        if (pyprojectContent.includes('[tool.black]')) {
          indentation = '4 spaces';
          const singleQ = pyprojectContent.match(/skip[_-]string[_-]normalization\s*=\s*true/i);
          if (!singleQ) quotes = 'double';
        }
        if (pyprojectContent.includes('[tool.ruff]')) {
          const ruffLine = pyprojectContent.match(/line-length\s*=\s*(\d+)/);
          if (ruffLine) maxLineLength = parseInt(ruffLine[1], 10);
        }
      }

      const sample = this.allSource().slice(0, 5).join('\n');
      const singleQuotes = (sample.match(/'/g) ?? []).length;
      const doubleQuotes = (sample.match(/"/g) ?? []).length;
      if (singleQuotes > doubleQuotes * 1.5) quotes = 'single';
      else if (doubleQuotes > singleQuotes * 1.5) quotes = 'double';

      return { indentation, quotes, semicolons: false, trailingCommas: 'yes (Python)', maxLineLength, bracketSpacing: true };
    }

    const prettierRc = this.readConfigFile(['.prettierrc', '.prettierrc.json', '.prettierrc.yml', 'prettier.config.js']);
    if (prettierRc) {
      try {
        const cfg = JSON.parse(prettierRc);
        if (cfg.tabWidth) indentation = `${cfg.tabWidth} spaces`;
        if (cfg.useTabs) indentation = 'tabs';
        if (cfg.singleQuote === false) quotes = 'double';
        if (cfg.semi === false) semicolons = false;
        if (cfg.trailingComma) trailingCommas = cfg.trailingComma;
        if (cfg.printWidth) maxLineLength = cfg.printWidth;
      } catch { /* not JSON, skip */ }
    }

    const editorConfig = this.readConfigFile(['.editorconfig']);
    if (editorConfig) {
      const sizeMatch = editorConfig.match(/indent_size\s*=\s*(\d+)/);
      if (sizeMatch) indentation = `${sizeMatch[1]} spaces`;
      const tabMatch = editorConfig.match(/indent_style\s*=\s*tab/);
      if (tabMatch) indentation = 'tabs';
    }

    if (!prettierRc && !editorConfig) {
      const sample = this.allSource().slice(0, 5).join('\n');
      const twoSpaceLines = (sample.match(/^  \S/gm) ?? []).length;
      const fourSpaceLines = (sample.match(/^    \S/gm) ?? []).length;
      const tabLines = (sample.match(/^\t\S/gm) ?? []).length;
      if (tabLines > twoSpaceLines && tabLines > fourSpaceLines) indentation = 'tabs';
      else if (fourSpaceLines > twoSpaceLines * 2) indentation = '4 spaces';

      const singleQuotes = (sample.match(/'/g) ?? []).length;
      const doubleQuotes = (sample.match(/"/g) ?? []).length;
      if (doubleQuotes > singleQuotes * 1.5) quotes = 'double';

      const statementsWithSemi = (sample.match(/;\s*$/gm) ?? []).length;
      const statementsWithoutSemi = (sample.match(/[^;{}\s]\s*$/gm) ?? []).length;
      if (statementsWithoutSemi > statementsWithSemi * 2) semicolons = false;
    }

    return { indentation, quotes, semicolons, trailingCommas, maxLineLength, bracketSpacing: true };
  }

  // ── Testing detection ─────────────────────────────────────────────────

  private detectTesting(): TestingProfile {
    const paths = this.allPaths();
    const lang = this.detectPrimaryLanguage();

    if (lang === 'python') {
      const testFiles = paths.filter(p => p.includes('test_') || p.includes('_test.py') || p.includes('tests/'));
      const testCode = testFiles.map(p => this.sourceContents.get(p) ?? '').join('\n');

      let framework = 'unittest';
      if (fs.existsSync(path.join(this.projectPath, 'pytest.ini')) ||
          fs.existsSync(path.join(this.projectPath, 'conftest.py')) ||
          testCode.includes('import pytest') || testCode.includes('from pytest')) {
        framework = 'pytest';
      }

      const classTests = (testCode.match(/class\s+Test\w+/g) ?? []).length;
      const fnTests = (testCode.match(/^def\s+test_/gm) ?? []).length;
      const style = classTests > fnTests ? 'Class-based test cases' : 'Function-based tests (def test_...)';

      const fileNaming = testFiles.some(p => p.includes('test_')) ? 'test_*.py' : '*_test.py';
      const colocated = testFiles.some(p => !p.startsWith('test'));
      const fileLocation = colocated ? 'Colocated (tests next to source)' : 'Separate tests/ directory';

      const patchUsage = (testCode.match(/mock\.patch|@patch|MagicMock|mocker\./g) ?? []).length;
      const mockPattern = patchUsage > 0 ? 'unittest.mock / pytest-mock (patch/MagicMock)' : 'Manual mocking';

      const hasFixtures = (testCode.match(/@pytest\.fixture/g) ?? []).length;
      const fixturePattern = hasFixtures > 0 ? 'pytest fixtures (@pytest.fixture)' : 'setUp/inline test data';

      const hasCoverage = fs.existsSync(path.join(this.projectPath, '.coveragerc')) ||
                          fs.existsSync(path.join(this.projectPath, 'setup.cfg'));
      const coverageApproach = hasCoverage ? 'Configured (pytest-cov / coverage.py)' : 'Not configured';

      return { framework, style, fileNaming, fileLocation, mockPattern, fixturePattern, coverageApproach };
    }

    const testFiles = paths.filter(p => p.includes('.test.') || p.includes('.spec.') || p.includes('__tests__'));
    const testCode = testFiles.map(p => this.sourceContents.get(p) ?? '').join('\n');

    let framework = 'unknown';
    const pkgPath = path.join(this.projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.jest) framework = 'Jest';
        else if (deps.vitest) framework = 'Vitest';
        else if (deps.mocha) framework = 'Mocha';
        else if (deps['@playwright/test']) framework = 'Playwright';
        else if (deps.cypress) framework = 'Cypress';
      } catch { /* skip */ }
    }

    const describeIt = (testCode.match(/describe\(/g) ?? []).length;
    const testFn = (testCode.match(/\btest\(/g) ?? []).length;
    const style = describeIt > testFn ? 'describe/it nesting' : 'flat test() functions';

    const fileNaming = testFiles.some(p => p.includes('.spec.')) ? '*.spec.ts' : '*.test.ts';
    const colocated = testFiles.some(p => p.includes('__tests__') || !p.startsWith('test'));
    const fileLocation = colocated ? 'Colocated (__tests__/ next to source)' : 'Separate test directory (tests/)';

    const jestMock = (testCode.match(/jest\.mock\(|vi\.mock\(/g) ?? []).length;
    const manualMock = (testCode.match(/mock\w+\s*=\s*\{/g) ?? []).length;
    const mockPattern = jestMock > manualMock ? `${framework} mock system (jest.mock / vi.mock)` : 'Manual mock objects';

    const hasFixtureDir = paths.some(p => /fixture|__fixtures__|factory/i.test(p));
    const hasBeforeEach = (testCode.match(/beforeEach/g) ?? []).length;
    const fixturePattern = hasFixtureDir ? 'Fixture files / factory functions' : hasBeforeEach > 0 ? 'beforeEach setup blocks' : 'Inline test data';

    const coverageConfig = testCode.includes('coverage') || fs.existsSync(path.join(this.projectPath, 'jest.config.js'));
    const coverageApproach = coverageConfig ? 'Configured with thresholds' : 'Not configured';

    return { framework, style, fileNaming, fileLocation, mockPattern, fixturePattern, coverageApproach };
  }

  // ── TypeScript detection ──────────────────────────────────────────────

  private detectTypeScript(): TypeScriptProfile {
    const lang = this.detectPrimaryLanguage();

    if (lang === 'python') {
      const allCode = this.allSource().join('\n');
      const typeHints = (allCode.match(/:\s*(?:str|int|float|bool|list|dict|Optional|Union|Any)/g) ?? []).length;
      const hasMypy = fs.existsSync(path.join(this.projectPath, 'mypy.ini')) ||
                       fs.existsSync(path.join(this.projectPath, '.mypy.ini'));
      const pyprojectContent = this.readConfigFile(['pyproject.toml']) ?? '';
      const hasStrictMypy = pyprojectContent.includes('strict = true') || pyprojectContent.includes('strict=true');

      return {
        strictMode: hasStrictMypy,
        anyUsage: typeHints > 0 ? 'Type hints used' : 'No type hints (untyped)',
        genericsStyle: (allCode.match(/Generic\[|TypeVar/g) ?? []).length > 0 ? 'Used (TypeVar/Generic)' : 'Not used',
        enumStyle: (allCode.match(/class\s+\w+\(.*Enum/g) ?? []).length > 0 ? 'Python Enum classes' : 'N/A',
        nullHandling: 'Optional[T] / None checks',
        assertionStyle: hasMypy ? 'mypy static analysis' : 'Runtime only',
      };
    }

    let strictMode = false;
    let anyUsage = 'Avoided';
    let genericsStyle = 'Used sparingly';
    let enumStyle = 'String enums';
    let nullHandling = 'Optional chaining (?.)';
    const assertionStyle = 'as Type (not angle-bracket)';

    const tsConfigPath = path.join(this.projectPath, 'tsconfig.json');
    if (fs.existsSync(tsConfigPath)) {
      try {
        const tsConfig = JSON.parse(fs.readFileSync(tsConfigPath, 'utf-8'));
        strictMode = tsConfig.compilerOptions?.strict === true;
      } catch { /* skip */ }
    }

    const allCode = this.allSource().join('\n');
    const anyCount = (allCode.match(/:\s*any\b/g) ?? []).length;
    const totalTypes = (allCode.match(/:\s*\w+/g) ?? []).length;
    if (anyCount > totalTypes * 0.1) anyUsage = 'Used frequently (consider reducing)';
    else if (anyCount > 0) anyUsage = 'Used sparingly (acceptable escape hatch)';
    else anyUsage = 'Not used (strict typing)';

    const genericCount = (allCode.match(/<[A-Z]\w*>/g) ?? []).length;
    if (genericCount > 20) genericsStyle = 'Used extensively (generic functions, classes, and utilities)';
    else if (genericCount > 5) genericsStyle = 'Used moderately';

    const stringEnums = (allCode.match(/=\s*'[a-z_]+',?\s*$/gm) ?? []).length;
    const numericEnums = (allCode.match(/=\s*\d+,?\s*$/gm) ?? []).length;
    if (stringEnums > numericEnums) enumStyle = 'String enums (preferred for serialization)';
    else if (numericEnums > stringEnums) enumStyle = 'Numeric enums';
    else enumStyle = 'Mixed';

    const optionalChaining = (allCode.match(/\?\./g) ?? []).length;
    const nullCoalescing = (allCode.match(/\?\?/g) ?? []).length;
    if (optionalChaining > 10 || nullCoalescing > 5) {
      nullHandling = 'Optional chaining (?.) and nullish coalescing (??)';
    }

    return { strictMode, anyUsage, genericsStyle, enumStyle, nullHandling, assertionStyle };
  }

  // ── API detection ─────────────────────────────────────────────────────

  private detectAPI(): APIProfile {
    const allCode = this.allSource().join('\n');
    const paths = this.allPaths();
    const lang = this.detectPrimaryLanguage();

    if (lang === 'python') {
      const hasDjango = allCode.includes('urlpatterns') || allCode.includes('django.urls');
      const hasDRF = allCode.includes('rest_framework') || allCode.includes('APIView') || allCode.includes('ViewSet');
      const hasFastAPI = allCode.includes('FastAPI') || allCode.includes('APIRouter');
      const hasFlask = allCode.includes('Flask(') || allCode.includes('@app.route');
      const hasGraphQL = allCode.includes('graphene') || allCode.includes('strawberry');

      if (!hasDjango && !hasDRF && !hasFastAPI && !hasFlask && !hasGraphQL) {
        return { style: 'none', routePattern: 'N/A', validationApproach: 'N/A', authPattern: 'N/A', responseFormat: 'N/A' };
      }

      let style = 'REST';
      if (hasGraphQL) style = 'GraphQL';

      let routePattern = 'Unknown';
      if (hasFastAPI) routePattern = 'FastAPI decorators (@app.get, @router.post)';
      else if (hasDRF) routePattern = 'DRF ViewSets / APIView';
      else if (hasDjango) routePattern = 'Django URL patterns (urlpatterns)';
      else if (hasFlask) routePattern = 'Flask route decorators (@app.route)';

      const hasPydantic = allCode.includes('BaseModel') || allCode.includes('pydantic');
      const hasMarshmallow = allCode.includes('marshmallow') || allCode.includes('Schema(');
      const hasDjangoForms = allCode.includes('forms.Form') || allCode.includes('ModelForm');
      const validationApproach = hasPydantic ? 'Pydantic models (BaseModel)' :
        hasMarshmallow ? 'Marshmallow schemas' :
        hasDjangoForms ? 'Django Forms / Serializers' : 'Manual / none detected';

      const hasJWT = allCode.includes('jwt') || allCode.includes('PyJWT');
      const hasOAuth = allCode.includes('oauth') || allCode.includes('OAuth');
      const hasDjangoAuth = allCode.includes('django.contrib.auth') || allCode.includes('login_required');
      const authPattern = hasDjangoAuth ? 'Django auth system' :
        hasJWT ? 'JWT tokens' :
        hasOAuth ? 'OAuth' : 'Not detected';

      const responseFormat = hasFastAPI ? 'JSON (automatic Pydantic serialization)' :
        hasDRF ? 'JSON (DRF Response)' :
        hasFlask ? 'JSON (jsonify)' :
        hasDjango ? 'JSON (JsonResponse)' : 'JSON';

      return { style, routePattern, validationApproach, authPattern, responseFormat };
    }

    const hasExpress = allCode.includes('express()') || allCode.includes('Router()');
    const hasFastify = allCode.includes('fastify(') || allCode.includes('Fastify');
    const hasGraphQL = allCode.includes('GraphQL') || allCode.includes('gql`') || paths.some(p => p.includes('schema.graphql'));
    const hasTRPC = allCode.includes('trpc') || allCode.includes('createTRPCRouter');
    const hasNest = allCode.includes('@Controller') || allCode.includes('@nestjs');

    if (!hasExpress && !hasFastify && !hasGraphQL && !hasTRPC && !hasNest) {
      return { style: 'none', routePattern: 'N/A', validationApproach: 'N/A', authPattern: 'N/A', responseFormat: 'N/A' };
    }

    let style = 'REST';
    if (hasGraphQL) style = 'GraphQL';
    if (hasTRPC) style = 'tRPC';

    const routePattern = hasNest ? 'Decorator-based (@Get, @Post)' :
      hasExpress ? 'Express router (app.get, router.post)' :
      hasFastify ? 'Fastify route registration' : 'Unknown';

    const hasZod = allCode.includes('z.object') || allCode.includes('z.string');
    const hasJoi = allCode.includes('Joi.object');
    const hasClassValidator = allCode.includes('@IsString') || allCode.includes('class-validator');
    const validationApproach = hasZod ? 'Zod schema validation' :
      hasJoi ? 'Joi validation' :
      hasClassValidator ? 'class-validator decorators' : 'Manual / none detected';

    const hasJWT = allCode.includes('jwt') || allCode.includes('jsonwebtoken');
    const hasPassport = allCode.includes('passport');
    const hasAuth0 = allCode.includes('auth0');
    const authPattern = hasPassport ? 'Passport.js strategies' :
      hasJWT ? 'JWT tokens' :
      hasAuth0 ? 'Auth0' : 'Not detected';

    const responseFormat = allCode.includes('res.json(') ? 'JSON (res.json)' :
      allCode.includes('reply.send(') ? 'JSON (reply.send)' : 'JSON';

    return { style, routePattern, validationApproach, authPattern, responseFormat };
  }

  // ── State management detection ────────────────────────────────────────

  private detectStateManagement(): string {
    const allCode = this.allSource().join('\n');
    const lang = this.detectPrimaryLanguage();

    if (lang === 'python') {
      if (allCode.includes('celery') || allCode.includes('Celery(')) return 'Celery (task queue)';
      if (allCode.includes('redis') || allCode.includes('Redis(')) return 'Redis';
      if (allCode.includes('django.db') || allCode.includes('models.Model')) return 'Django ORM';
      if (allCode.includes('SQLAlchemy') || allCode.includes('sqlalchemy')) return 'SQLAlchemy ORM';
      return 'none';
    }

    if (allCode.includes('createSlice') || allCode.includes('configureStore') || allCode.includes('@reduxjs')) return 'Redux Toolkit';
    if (allCode.includes('zustand') || allCode.includes('create(') && allCode.includes('set(')) return 'Zustand';
    if (allCode.includes('useContext') && allCode.includes('createContext')) return 'React Context';
    if (allCode.includes('observable') && allCode.includes('makeAutoObservable')) return 'MobX';
    if (allCode.includes('atom(') && allCode.includes('useAtom')) return 'Jotai';
    if (allCode.includes('createSignal') || allCode.includes('createStore')) return 'SolidJS signals / stores';
    return 'none';
  }

  // ── Code sample extraction ────────────────────────────────────────────

  private extractSamples(): CodeSamples {
    const sources = Array.from(this.sourceContents.entries());
    const lang = this.detectPrimaryLanguage();

    if (lang === 'python') {
      const nonTestSources = sources.filter(([p]) => !p.includes('test_') && !p.includes('_test.py'));
      const testSources = sources.filter(([p]) => p.includes('test_') || p.includes('_test.py'));

      return {
        typicalFunction: this.findSample(nonTestSources, /^(?:async\s+)?def\s+\w+\([^)]*\)[\s\S]*?(?=\n(?:class\s|def\s|async\s+def\s|\S)|\n\n\n)/m, 20),
        typicalClass: this.findSample(nonTestSources, /^class\s+\w+[\s\S]*?(?=\nclass\s|\n\n\n\w)/m, 25),
        typicalTest: this.findSample(testSources, /(?:def\s+test_\w+|class\s+Test\w+)[\s\S]*?(?=\ndef\s+test_|\nclass\s)/m, 20),
        typicalImportBlock: this.findPythonImportBlock(nonTestSources),
        typicalErrorHandler: this.findSample(nonTestSources, /try\s*:[\s\S]*?except[\s\S]*?(?:\n\S)/m, 15),
      };
    }

    const nonTestSources = sources.filter(([p]) => !p.includes('.test.') && !p.includes('.spec.'));
    const testSources = sources.filter(([p]) => p.includes('.test.') || p.includes('.spec.'));

    return {
      typicalFunction: this.findSample(nonTestSources, /^(?:export\s+)?(?:async\s+)?function\s+\w+[\s\S]*?^\}/m, 30),
      typicalClass: this.findSample(nonTestSources, /^(?:export\s+)?class\s+\w+[\s\S]*?^  \w/m, 20),
      typicalTest: this.findSample(testSources, /(?:it|test)\s*\([^)]+,[\s\S]*?\}\s*\)/m, 20),
      typicalImportBlock: this.findImportBlock(nonTestSources),
      typicalErrorHandler: this.findSample(nonTestSources, /try\s*\{[\s\S]*?catch[\s\S]*?\}/m, 15),
    };
  }

  private findSample(sources: [string, string][], pattern: RegExp, maxLines: number): string {
    for (const [, content] of sources) {
      const match = content.match(pattern);
      if (match) {
        const lines = match[0].split('\n').slice(0, maxLines);
        if (lines.length > 2) return lines.join('\n');
      }
    }
    return '';
  }

  private findImportBlock(sources: [string, string][]): string {
    for (const [, content] of sources) {
      const lines = content.split('\n');
      const importLines = lines.filter(l => l.startsWith('import '));
      if (importLines.length >= 3) {
        return importLines.slice(0, 8).join('\n');
      }
    }
    return '';
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private detectPrimaryLanguage(): string {
    const paths = this.allPaths();
    const pyCount = paths.filter(p => p.endsWith('.py')).length;
    const tsCount = paths.filter(p => p.endsWith('.ts') || p.endsWith('.tsx')).length;
    const jsCount = paths.filter(p => p.endsWith('.js') || p.endsWith('.jsx')).length;
    const goCount = paths.filter(p => p.endsWith('.go')).length;
    const rsCount = paths.filter(p => p.endsWith('.rs')).length;

    const counts = [
      { lang: 'python', count: pyCount },
      { lang: 'typescript', count: tsCount },
      { lang: 'javascript', count: jsCount },
      { lang: 'go', count: goCount },
      { lang: 'rust', count: rsCount },
    ];
    counts.sort((a, b) => b.count - a.count);

    if (counts[0].count === 0) {
      if (fs.existsSync(path.join(this.projectPath, 'requirements.txt')) ||
          fs.existsSync(path.join(this.projectPath, 'pyproject.toml'))) return 'python';
      if (fs.existsSync(path.join(this.projectPath, 'tsconfig.json'))) return 'typescript';
      if (fs.existsSync(path.join(this.projectPath, 'go.mod'))) return 'go';
      if (fs.existsSync(path.join(this.projectPath, 'Cargo.toml'))) return 'rust';
      if (fs.existsSync(path.join(this.projectPath, 'package.json'))) return 'javascript';
      return 'unknown';
    }

    return counts[0].lang;
  }

  private findPythonImportBlock(sources: [string, string][]): string {
    for (const [, content] of sources) {
      const lines = content.split('\n');
      const importLines = lines.filter(l => /^(?:import|from)\s/.test(l));
      if (importLines.length >= 3) {
        return importLines.slice(0, 8).join('\n');
      }
    }
    return '';
  }

  private dominantCase(names: string[]): string {
    let kebab = 0, camel = 0, pascal = 0, snake = 0;
    for (const n of names) {
      if (/^[a-z]+(-[a-z]+)+$/.test(n)) kebab++;
      else if (/^[a-z][a-zA-Z0-9]*$/.test(n)) camel++;
      else if (/^[A-Z][a-zA-Z0-9]*$/.test(n)) pascal++;
      else if (/^[a-z]+(_[a-z]+)+$/.test(n)) snake++;
    }
    const max = Math.max(kebab, camel, pascal, snake);
    if (max === 0) return 'mixed';
    if (max === kebab) return 'kebab-case';
    if (max === pascal) return 'PascalCase';
    if (max === snake) return 'snake_case';
    return 'camelCase';
  }

  private namingExample(style: string, kind: 'file' | 'dir'): string {
    const examples: Record<string, string> = {
      'kebab-case': kind === 'file' ? '`user-service.ts`' : '`user-auth/`',
      'camelCase': kind === 'file' ? '`userService.ts`' : '`userAuth/`',
      'PascalCase': kind === 'file' ? '`UserService.ts`' : '`UserAuth/`',
      'snake_case': kind === 'file' ? '`user_service.ts`' : '`user_auth/`',
    };
    return examples[style] ?? '';
  }

  private readConfigFile(names: string[]): string | null {
    for (const name of names) {
      const fullPath = path.join(this.projectPath, name);
      if (fs.existsSync(fullPath)) {
        try { return fs.readFileSync(fullPath, 'utf-8'); } catch { /* skip */ }
      }
    }
    return null;
  }

  private detectProjectName(): string {
    const pkgPath = path.join(this.projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).name ?? path.basename(this.projectPath);
      } catch { /* skip */ }
    }
    return path.basename(this.projectPath);
  }
}
