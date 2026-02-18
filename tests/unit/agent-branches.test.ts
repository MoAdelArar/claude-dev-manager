import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  AgentRole,
  PipelineStage,
  ArtifactType,
  ArtifactStatus,
  ReviewStatus,
  IssueSeverity,
  IssueType,
  type AgentTask,
  type Artifact,
} from '../../src/types';
import { AgentRegistry } from '../../src/agents/index';
import { ArtifactStore } from '../../src/workspace/artifact-store';

let registry: AgentRegistry;
let artifactStore: ArtifactStore;
let tempDir: string;

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'art-1',
    type: ArtifactType.ARCHITECTURE_DOC,
    name: 'Test Artifact',
    description: 'test',
    filePath: 'test/file.md',
    createdBy: AgentRole.SYSTEM_ARCHITECT,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    content: 'test content',
    metadata: {},
    status: ArtifactStatus.DRAFT,
    reviewStatus: ReviewStatus.PENDING,
    ...overrides,
  };
}

function makeTask(role: AgentRole, overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    featureId: 'feat-1',
    stage: PipelineStage.REQUIREMENTS_GATHERING,
    assignedTo: role,
    title: 'Test Task',
    description: 'A test feature description',
    instructions: 'Generate output',
    inputArtifacts: [],
    expectedOutputs: [],
    constraints: ['Be good'],
    priority: 'high' as any,
    status: 'idle' as any,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-agent-branches-'));
  artifactStore = new ArtifactStore(tempDir);
  registry = new AgentRegistry(artifactStore);
});

afterAll(() => {
  registry.reset();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ─── ProductManagerAgent ────────────────────────────────────────────────────

describe('ProductManagerAgent branch coverage', () => {
  const agent = () => registry.getAgent(AgentRole.PRODUCT_MANAGER) as any;

  describe('parseClaudeOutput', () => {
    it('parses artifacts with Description field', () => {
      const output = [
        '---ARTIFACT_START---',
        'Type: requirements_doc',
        'Name: Req Doc',
        'Description: Full description here',
        'Content:',
        'Some content',
        '---ARTIFACT_END---',
      ].join('\n');
      const result = agent().parseClaudeOutput(output);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].description).toBe('Full description here');
      expect(result.artifacts[0].content).toBe('Some content');
    });

    it('parses artifacts without Description field', () => {
      const output = [
        '---ARTIFACT_START---',
        'Type: user_stories',
        'Name: Stories',
        'Content:',
        'Story content',
        '---ARTIFACT_END---',
      ].join('\n');
      const result = agent().parseClaudeOutput(output);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].description).toBe('');
    });

    it('parses issues with Severity field', () => {
      const output = [
        '---ISSUE_START---',
        'Type: bug',
        'Severity: high',
        'Title: Something broke',
        'Description: It is broken',
        '---ISSUE_END---',
      ].join('\n');
      const result = agent().parseClaudeOutput(output);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('high');
    });

    it('parses issues without Severity field (defaults to medium)', () => {
      const output = [
        '---ISSUE_START---',
        'Type: bug',
        'Title: No severity',
        '---ISSUE_END---',
      ].join('\n');
      const result = agent().parseClaudeOutput(output);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('medium');
    });

    it('parses Summary section', () => {
      const output = '### Summary\nThis is a summary\n### Other';
      const result = agent().parseClaudeOutput(output);
      expect(result.summary).toBe('This is a summary');
    });

    it('parses Recommendations section', () => {
      const output = '### Recommendations\nDo this and that';
      const result = agent().parseClaudeOutput(output);
      expect(result.recommendations).toBe('Do this and that');
    });

    it('returns empty result for empty string', () => {
      const result = agent().parseClaudeOutput('');
      expect(result.summary).toBe('');
      expect(result.artifacts).toHaveLength(0);
      expect(result.issues).toHaveLength(0);
      expect(result.recommendations).toBe('');
    });

    it('returns empty result for output with no markers', () => {
      const result = agent().parseClaudeOutput('Just plain text with no markers at all.');
      expect(result.artifacts).toHaveLength(0);
      expect(result.issues).toHaveLength(0);
    });

    it('skips artifact blocks missing Type or Name', () => {
      const output = [
        '---ARTIFACT_START---',
        'Content:',
        'orphaned',
        '---ARTIFACT_END---',
      ].join('\n');
      const result = agent().parseClaudeOutput(output);
      expect(result.artifacts).toHaveLength(0);
    });

    it('skips issue blocks missing Type or Title', () => {
      const output = [
        '---ISSUE_START---',
        'Description: orphaned',
        '---ISSUE_END---',
      ].join('\n');
      const result = agent().parseClaudeOutput(output);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('execute / produceArtifacts', () => {
    it('produces default artifacts when task generates parseable output', async () => {
      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const result = await agent().execute(task);
      expect(result.status).toBe('success');
      expect(result.artifacts.length).toBeGreaterThan(0);
      const types = result.artifacts.map((a: Artifact) => a.type);
      expect(types).toContain(ArtifactType.REQUIREMENTS_DOC);
    });

    it('generates defaults when output has no parseable artifacts', async () => {
      const a = agent();
      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const defaults = a.generateDefaultArtifacts(task, 'raw output');
      expect(defaults.length).toBeGreaterThan(0);
      expect(defaults[0].type).toBe(ArtifactType.REQUIREMENTS_DOC);
    });

    it('skips unrecognized artifact types', async () => {
      const a = agent();
      const resolved = a.resolveArtifactType('unknown_garbage_type');
      expect(resolved).toBeNull();
    });
  });

  describe('identifyIssues / detectRequirementGaps', () => {
    it('flags missing non-functional requirements', async () => {
      const a = agent();
      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const issues = a.detectRequirementGaps(task, 'security auth edge case metric');
      const titles = issues.map((i: any) => i.title);
      expect(titles).toContain('Missing non-functional requirements');
    });

    it('does not flag non-functional when present', () => {
      const a = agent();
      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const issues = a.detectRequirementGaps(task, 'non-functional security edge case metric');
      const titles = issues.map((i: any) => i.title);
      expect(titles).not.toContain('Missing non-functional requirements');
    });

    it('flags missing security when absent', () => {
      const a = agent();
      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const issues = a.detectRequirementGaps(task, 'NFR edge case metric');
      const titles = issues.map((i: any) => i.title);
      expect(titles).toContain('Security requirements not addressed');
    });

    it('does not flag security when "auth" present', () => {
      const a = agent();
      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const issues = a.detectRequirementGaps(task, 'NFR auth edge case metric');
      expect(issues.find((i: any) => i.title === 'Security requirements not addressed')).toBeUndefined();
    });

    it('flags missing edge case analysis', () => {
      const a = agent();
      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const issues = a.detectRequirementGaps(task, 'NFR security metric');
      expect(issues.find((i: any) => i.title === 'Missing edge case analysis')).toBeDefined();
    });

    it('does not flag edge cases when "boundary" present', () => {
      const a = agent();
      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const issues = a.detectRequirementGaps(task, 'NFR security boundary metric');
      expect(issues.find((i: any) => i.title === 'Missing edge case analysis')).toBeUndefined();
    });

    it('flags no success metrics', () => {
      const a = agent();
      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const issues = a.detectRequirementGaps(task, 'NFR security error');
      expect(issues.find((i: any) => i.title === 'No success metrics defined')).toBeDefined();
    });

    it('does not flag metrics when "kpi" present', () => {
      const a = agent();
      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const issues = a.detectRequirementGaps(task, 'NFR security error kpi');
      expect(issues.find((i: any) => i.title === 'No success metrics defined')).toBeUndefined();
    });
  });

  describe('resolveArtifactType', () => {
    it.each([
      ['requirements_doc', ArtifactType.REQUIREMENTS_DOC],
      ['requirements_document', ArtifactType.REQUIREMENTS_DOC],
      ['requirements', ArtifactType.REQUIREMENTS_DOC],
      ['user_stories', ArtifactType.USER_STORIES],
      ['user_story', ArtifactType.USER_STORIES],
      ['stories', ArtifactType.USER_STORIES],
      ['acceptance_criteria', ArtifactType.ACCEPTANCE_CRITERIA],
      ['acceptance', ArtifactType.ACCEPTANCE_CRITERIA],
      ['criteria', ArtifactType.ACCEPTANCE_CRITERIA],
    ])('maps "%s" correctly', (input, expected) => {
      expect(agent().resolveArtifactType(input)).toBe(expected);
    });

    it('returns null for unmapped type', () => {
      expect(agent().resolveArtifactType('unknown')).toBeNull();
    });
  });

  describe('resolveIssueSeverity', () => {
    it.each([
      ['info', IssueSeverity.INFO],
      ['low', IssueSeverity.LOW],
      ['medium', IssueSeverity.MEDIUM],
      ['high', IssueSeverity.HIGH],
      ['critical', IssueSeverity.CRITICAL],
    ])('maps "%s" correctly', (input, expected) => {
      expect(agent().resolveIssueSeverity(input)).toBe(expected);
    });

    it('defaults to MEDIUM for unknown', () => {
      expect(agent().resolveIssueSeverity('banana')).toBe(IssueSeverity.MEDIUM);
    });
  });

  describe('resolveIssueType', () => {
    it.each([
      ['bug', IssueType.BUG],
      ['security', IssueType.SECURITY_VULNERABILITY],
      ['documentation', IssueType.DOCUMENTATION_GAP],
      ['architecture', IssueType.ARCHITECTURE_CONCERN],
    ])('maps "%s" correctly', (input, expected) => {
      expect(agent().resolveIssueType(input)).toBe(expected);
    });

    it('defaults to DESIGN_FLAW for unknown', () => {
      expect(agent().resolveIssueType('zzzzzz')).toBe(IssueType.DESIGN_FLAW);
    });
  });
});

// ─── CodeReviewerAgent ──────────────────────────────────────────────────────

describe('CodeReviewerAgent branch coverage', () => {
  const agent = () => registry.getAgent(AgentRole.CODE_REVIEWER) as any;

  describe('parseClaudeOutput (private)', () => {
    it('parses well-formed artifact blocks', () => {
      const output = [
        '---ARTIFACT_START---',
        'Type: code_review_report',
        'Name: Review',
        'Description: Full review',
        'Content:',
        'Review body',
        '---ARTIFACT_END---',
      ].join('\n');
      const result = agent().parseClaudeOutput(output);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].type).toBe('code_review_report');
    });

    it('defaults missing fields', () => {
      const output = [
        '---ARTIFACT_START---',
        '---ARTIFACT_END---',
      ].join('\n');
      const result = agent().parseClaudeOutput(output);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].name).toBe('Unnamed Artifact');
    });

    it('parses issue blocks with defaults', () => {
      const output = [
        '---ISSUE_START---',
        '---ISSUE_END---',
      ].join('\n');
      const result = agent().parseClaudeOutput(output);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].title).toBe('Untitled Issue');
    });

    it('returns empty for no markers', () => {
      const result = agent().parseClaudeOutput('just text');
      expect(result.artifacts).toHaveLength(0);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('produceArtifacts', () => {
    it('generates default code review report when no artifacts parsed', async () => {
      const task = makeTask(AgentRole.CODE_REVIEWER, {
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content: 'const x = 1;', filePath: 'src/index.ts', name: 'index.ts' }),
        ],
      });
      const result = await agent().execute(task);
      expect(result.artifacts.length).toBeGreaterThan(0);
      const types = result.artifacts.map((a: Artifact) => a.type);
      expect(types).toContain(ArtifactType.CODE_REVIEW_REPORT);
    });
  });

  describe('identifyIssues / detectIssuesFromSource', () => {
    it('flags file >50 lines with no error handling', async () => {
      const lines = Array(60).fill('const x = 1;');
      const task = makeTask(AgentRole.CODE_REVIEWER, {
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content: lines.join('\n'), filePath: 'src/big.ts', name: 'big.ts' }),
        ],
      });
      const result = await agent().execute(task);
      const errorHandling = result.issues.find((i: any) => i.title.includes('No error handling'));
      expect(errorHandling).toBeDefined();
    });

    it('does not flag files with catch/throw', async () => {
      const content = 'try { doThing() } catch(e) { throw e; }\n'.repeat(55);
      const task = makeTask(AgentRole.CODE_REVIEWER, {
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content, filePath: 'src/safe.ts', name: 'safe.ts' }),
        ],
      });
      const result = await agent().execute(task);
      const errorHandling = result.issues.find((i: any) => i.title.includes('No error handling'));
      expect(errorHandling).toBeUndefined();
    });

    it('detects eval() as security concern', async () => {
      const task = makeTask(AgentRole.CODE_REVIEWER, {
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content: 'eval("bad")', filePath: 'src/vuln.ts', name: 'vuln.ts' }),
        ],
      });
      const result = await agent().execute(task);
      const output = result.output;
      expect(output).toContain('eval()');
    });

    it('detects innerHTML as XSS risk', async () => {
      const task = makeTask(AgentRole.CODE_REVIEWER, {
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content: 'el.innerHTML = userInput;', filePath: 'src/xss.ts', name: 'xss.ts' }),
        ],
      });
      const result = await agent().execute(task);
      expect(result.output).toContain('innerHTML');
    });

    it('detects excessive TODOs', async () => {
      const content = '// TODO fix\n// TODO fix2\n// TODO fix3\n// FIXME later\n'.repeat(2) + 'const x = 1;';
      const task = makeTask(AgentRole.CODE_REVIEWER, {
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content, filePath: 'src/todos.ts', name: 'todos.ts' }),
        ],
      });
      const result = await agent().execute(task);
      const todoIssue = result.issues.find((i: any) => i.title.includes('TODO'));
      expect(todoIssue).toBeDefined();
    });

    it('detects `any` type usage', async () => {
      const content = 'const x: any = 1;';
      const task = makeTask(AgentRole.CODE_REVIEWER, {
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content, filePath: 'src/any.ts', name: 'any.ts' }),
        ],
      });
      const result = await agent().execute(task);
      const anyIssue = result.issues.find((i: any) => i.title.includes('any'));
      expect(anyIssue).toBeDefined();
    });
  });

  describe('resolveArtifactType', () => {
    it('maps code_review_report', () => {
      expect(agent().resolveArtifactType('code_review_report')).toBe(ArtifactType.CODE_REVIEW_REPORT);
    });
    it('defaults unknown to CODE_REVIEW_REPORT', () => {
      expect(agent().resolveArtifactType('bogus')).toBe(ArtifactType.CODE_REVIEW_REPORT);
    });
  });

  describe('resolveIssueSeverity', () => {
    it.each(['critical', 'high', 'medium', 'low', 'info'] as const)('maps "%s"', (sev) => {
      const result = agent().resolveIssueSeverity(sev);
      expect(result).toBe(sev);
    });
    it('defaults unknown to medium', () => {
      expect(agent().resolveIssueSeverity('banana')).toBe(IssueSeverity.MEDIUM);
    });
  });

  describe('resolveIssueType', () => {
    it.each([
      ['bug', IssueType.BUG],
      ['code_quality', IssueType.CODE_QUALITY],
      ['performance', IssueType.PERFORMANCE],
      ['security_vulnerability', IssueType.SECURITY_VULNERABILITY],
    ])('maps "%s"', (input, expected) => {
      expect(agent().resolveIssueType(input)).toBe(expected);
    });
    it('defaults unknown to CODE_QUALITY', () => {
      expect(agent().resolveIssueType('zzz')).toBe(IssueType.CODE_QUALITY);
    });
  });

  describe('extractField / extractContent', () => {
    it('returns empty for missing field', () => {
      expect(agent().extractField('no match here', 'Type')).toBe('');
    });
    it('returns full block when Content: marker is missing', () => {
      const result = agent().extractContent('no content marker\njust text');
      expect(result).toBe('no content marker\njust text');
    });
  });

  describe('architectural alignment checks', () => {
    it('flags layered architecture violation', async () => {
      const source = makeArtifact({
        type: ArtifactType.SOURCE_CODE,
        content: "import something from '../database/client';",
        filePath: 'src/controller/userController.ts',
        name: 'userController.ts',
      });
      const arch = makeArtifact({
        type: ArtifactType.ARCHITECTURE_DOC,
        content: 'We use a layered architecture...',
      });
      const task = makeTask(AgentRole.CODE_REVIEWER, {
        inputArtifacts: [source, arch],
      });
      const result = await agent().execute(task);
      expect(result.output).toContain('layered architecture');
    });
  });
});

// ─── DocumentationWriterAgent ───────────────────────────────────────────────

describe('DocumentationWriterAgent branch coverage', () => {
  const agent = () => registry.getAgent(AgentRole.DOCUMENTATION_WRITER) as any;

  describe('parseClaudeOutput', () => {
    it('parses artifact with all fields', () => {
      const output = [
        '---ARTIFACT_START---',
        'Type: api_documentation',
        'Name: API Ref',
        'Description: API docs',
        'Content:',
        'Some API content',
        '---ARTIFACT_END---',
      ].join('\n');
      const result = agent().parseClaudeOutput(output);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].name).toBe('API Ref');
    });

    it('parses issue blocks', () => {
      const output = [
        '---ISSUE_START---',
        'Type: documentation_gap',
        'Severity: low',
        'Title: Missing docs',
        'Description: Need more docs',
        '---ISSUE_END---',
      ].join('\n');
      const result = agent().parseClaudeOutput(output);
      expect(result.issues).toHaveLength(1);
    });

    it('returns empty for empty string', () => {
      const result = agent().parseClaudeOutput('');
      expect(result.artifacts).toHaveLength(0);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('identifyIssues', () => {
    it('flags missing API spec', async () => {
      const task = makeTask(AgentRole.DOCUMENTATION_WRITER, {
        stage: PipelineStage.DOCUMENTATION,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC }),
        ],
      });
      const result = await agent().execute(task);
      const apiIssue = result.issues.find((i: any) => i.title === 'Missing API specification');
      expect(apiIssue).toBeDefined();
    });

    it('flags missing architecture doc', async () => {
      const task = makeTask(AgentRole.DOCUMENTATION_WRITER, {
        stage: PipelineStage.DOCUMENTATION,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.API_SPEC, content: 'spec content' }),
        ],
      });
      const result = await agent().execute(task);
      const archIssue = result.issues.find((i: any) => i.title === 'Missing architecture document');
      expect(archIssue).toBeDefined();
    });

    it('flags source code without inline docs', async () => {
      const task = makeTask(AgentRole.DOCUMENTATION_WRITER, {
        stage: PipelineStage.DOCUMENTATION,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content: 'const x = 1;', name: 'nodoc.ts' }),
          makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC }),
          makeArtifact({ type: ArtifactType.API_SPEC }),
        ],
      });
      const result = await agent().execute(task);
      const inlineIssue = result.issues.find((i: any) => i.title.includes('Missing inline documentation'));
      expect(inlineIssue).toBeDefined();
    });

    it('does not flag source with JSDoc', async () => {
      const task = makeTask(AgentRole.DOCUMENTATION_WRITER, {
        stage: PipelineStage.DOCUMENTATION,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content: '/** docs */ const x = 1;', name: 'docs.ts' }),
          makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC }),
          makeArtifact({ type: ArtifactType.API_SPEC }),
        ],
      });
      const result = await agent().execute(task);
      const inlineIssue = result.issues.find((i: any) => i.title.includes('Missing inline documentation'));
      expect(inlineIssue).toBeUndefined();
    });
  });

  describe('resolveArtifactType', () => {
    it.each([
      ['api_documentation', ArtifactType.API_DOCUMENTATION],
      ['user_documentation', ArtifactType.USER_DOCUMENTATION],
      ['developer_documentation', ArtifactType.DEVELOPER_DOCUMENTATION],
      ['changelog', ArtifactType.CHANGELOG],
    ])('maps "%s"', (input, expected) => {
      expect(agent().resolveArtifactType(input)).toBe(expected);
    });
    it('returns null for unknown', () => {
      expect(agent().resolveArtifactType('zzz')).toBeNull();
    });
  });

  describe('resolveIssueSeverity', () => {
    it('maps all known severities', () => {
      expect(agent().resolveIssueSeverity('critical')).toBe(IssueSeverity.CRITICAL);
      expect(agent().resolveIssueSeverity('info')).toBe(IssueSeverity.INFO);
    });
    it('defaults to MEDIUM', () => {
      expect(agent().resolveIssueSeverity('banana')).toBe(IssueSeverity.MEDIUM);
    });
  });

  describe('performWork branches', () => {
    it('includes API docs when apiSpec present', async () => {
      const task = makeTask(AgentRole.DOCUMENTATION_WRITER, {
        stage: PipelineStage.DOCUMENTATION,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.API_SPEC, content: 'GET /api/users' }),
        ],
      });
      const result = await agent().execute(task);
      expect(result.output).toContain('API Documentation');
    });

    it('includes user docs when reqDoc present', async () => {
      const task = makeTask(AgentRole.DOCUMENTATION_WRITER, {
        stage: PipelineStage.DOCUMENTATION,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.REQUIREMENTS_DOC, content: 'Some req' }),
        ],
      });
      const result = await agent().execute(task);
      expect(result.output).toContain('User Documentation');
    });

    it('skips user docs when no reqDoc or userStories', async () => {
      const task = makeTask(AgentRole.DOCUMENTATION_WRITER, {
        stage: PipelineStage.DOCUMENTATION,
        inputArtifacts: [],
      });
      const result = await agent().execute(task);
      expect(result.output).not.toContain('User Documentation');
    });
  });
});

// ─── SecurityEngineerAgent ──────────────────────────────────────────────────

describe('SecurityEngineerAgent branch coverage', () => {
  const agent = () => registry.getAgent(AgentRole.SECURITY_ENGINEER) as any;

  describe('identifyIssues — code pattern detection', () => {
    it('detects hardcoded password', async () => {
      const task = makeTask(AgentRole.SECURITY_ENGINEER, {
        stage: PipelineStage.SECURITY_REVIEW,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content: "password = 'mysecret123'", name: 'creds.ts' }),
        ],
      });
      const result = await agent().execute(task);
      const issue = result.issues.find((i: any) => i.title.includes('Hardcoded credentials'));
      expect(issue).toBeDefined();
    });

    it('detects eval()', async () => {
      const task = makeTask(AgentRole.SECURITY_ENGINEER, {
        stage: PipelineStage.SECURITY_REVIEW,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content: "eval('something')", name: 'evil.ts' }),
        ],
      });
      const result = await agent().execute(task);
      const issue = result.issues.find((i: any) => i.title.includes('Dangerous code execution'));
      expect(issue).toBeDefined();
    });

    it('does not detect innerHTML via identifyIssues (lowercased content vs mixed-case regex)', async () => {
      const task = makeTask(AgentRole.SECURITY_ENGINEER, {
        stage: PipelineStage.SECURITY_REVIEW,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content: "el.innerHTML = data;", name: 'xss.ts' }),
        ],
      });
      const result = await agent().execute(task);
      const issue = result.issues.find((i: any) => i.title.includes('XSS'));
      expect(issue).toBeUndefined();
    });

    it('detects http:// in performWork output via analyzeCodeSecurity', async () => {
      const task = makeTask(AgentRole.SECURITY_ENGINEER, {
        stage: PipelineStage.SECURITY_REVIEW,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content: 'fetch("http://api.example.com/data")', name: 'http.ts' }),
        ],
      });
      const result = await agent().execute(task);
      expect(result.output).toContain('HTTP');
    });

    it('detects missing security headers (express without helmet)', async () => {
      const task = makeTask(AgentRole.SECURITY_ENGINEER, {
        stage: PipelineStage.SECURITY_REVIEW,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content: "import express from 'express'; const app = express();", name: 'app.ts' }),
        ],
      });
      const result = await agent().execute(task);
      const issue = result.issues.find((i: any) => i.title.includes('Missing security headers'));
      expect(issue).toBeDefined();
    });

    it('does not flag express with helmet', async () => {
      const task = makeTask(AgentRole.SECURITY_ENGINEER, {
        stage: PipelineStage.SECURITY_REVIEW,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content: "import express from 'express'; import helmet from 'helmet';", name: 'safe-app.ts' }),
        ],
      });
      const result = await agent().execute(task);
      const issue = result.issues.find((i: any) => i.title.includes('Missing security headers'));
      expect(issue).toBeUndefined();
    });

    it('detects overly permissive CORS', async () => {
      const task = makeTask(AgentRole.SECURITY_ENGINEER, {
        stage: PipelineStage.SECURITY_REVIEW,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content: "import cors from 'cors'; app.use(cors());", name: 'cors.ts' }),
        ],
      });
      const result = await agent().execute(task);
      const issue = result.issues.find((i: any) => i.title.includes('CORS'));
      expect(issue).toBeDefined();
    });

    it('no issues for clean code', async () => {
      const task = makeTask(AgentRole.SECURITY_ENGINEER, {
        stage: PipelineStage.SECURITY_REVIEW,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SOURCE_CODE, content: 'const x = 1;\nconst y = 2;', name: 'clean.ts' }),
        ],
      });
      const result = await agent().execute(task);
      const secIssues = result.issues.filter((i: any) => i.title.includes('Hardcoded') || i.title.includes('XSS') || i.title.includes('eval'));
      expect(secIssues).toHaveLength(0);
    });
  });

  describe('analyzeArchitectureSecurity', () => {
    it('flags missing auth', () => {
      const findings = agent().analyzeArchitectureSecurity('some content about the system');
      expect(findings).toContain('authentication');
    });
    it('returns clean message when all concerns addressed', () => {
      const content = 'authentication authorization rbac encryption tls rate limit logging input validation sanitization';
      const findings = agent().analyzeArchitectureSecurity(content);
      expect(findings).toContain('appears to address');
    });
  });

  describe('analyzeApiSecurity', () => {
    it('flags missing API auth', () => {
      const findings = agent().analyzeApiSecurity('GET /api/users returns 200');
      expect(findings).toContain('authentication');
    });
    it('clean when bearer + rate + validation + error', () => {
      const findings = agent().analyzeApiSecurity('bearer rate validation schema error');
      expect(findings).toContain('addresses basic security');
    });
  });

  describe('analyzeCodeSecurity patterns', () => {
    it('detects Math.random()', () => {
      const findings = agent().analyzeCodeSecurity('let token = Math.random().toString(36);');
      expect(findings).toContain('Math.random');
    });
    it('detects http://', () => {
      const findings = agent().analyzeCodeSecurity('fetch("http://api.example.com")');
      expect(findings).toContain('HTTP');
    });
    it('returns clean for safe code', () => {
      const findings = agent().analyzeCodeSecurity('const x = 1;');
      expect(findings).toContain('No immediate');
    });
  });

  describe('resolveArtifactType', () => {
    it('maps security_report', () => {
      expect(agent().resolveArtifactType('security_report')).toBe(ArtifactType.SECURITY_REPORT);
    });
    it('returns null for unknown', () => {
      expect(agent().resolveArtifactType('bogus')).toBeNull();
    });
  });

  describe('resolveIssueSeverity', () => {
    it.each(['critical', 'high', 'medium', 'low', 'info'])('maps "%s"', (s) => {
      expect(agent().resolveIssueSeverity(s)).toBe(s);
    });
    it('defaults to MEDIUM', () => {
      expect(agent().resolveIssueSeverity('x')).toBe(IssueSeverity.MEDIUM);
    });
  });
});

// ─── QAEngineerAgent ────────────────────────────────────────────────────────

describe('QAEngineerAgent branch coverage', () => {
  const agent = () => registry.getAgent(AgentRole.QA_ENGINEER) as any;

  describe('parseClaudeOutput', () => {
    it('parses multiple artifacts and issues', () => {
      const output = [
        '---ARTIFACT_START---',
        'Type: test_plan',
        'Name: Plan',
        'Description: A plan',
        'Content:',
        'Plan content',
        '---ARTIFACT_END---',
        '---ISSUE_START---',
        'Type: missing_test',
        'Severity: high',
        'Title: No tests',
        'Description: Missing tests',
        '---ISSUE_END---',
      ].join('\n');
      const result = agent().parseClaudeOutput(output);
      expect(result.artifacts).toHaveLength(1);
      expect(result.issues).toHaveLength(1);
    });

    it('defaults missing fields', () => {
      const output = '---ARTIFACT_START---\n---ARTIFACT_END---';
      const result = agent().parseClaudeOutput(output);
      expect(result.artifacts[0].name).toBe('Unnamed Artifact');
    });

    it('empty output returns empty results', () => {
      const result = agent().parseClaudeOutput('');
      expect(result.artifacts).toHaveLength(0);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('resolveArtifactType', () => {
    it.each([
      ['test_plan', ArtifactType.TEST_PLAN],
      ['unit_tests', ArtifactType.UNIT_TESTS],
      ['integration_tests', ArtifactType.INTEGRATION_TESTS],
      ['test_report', ArtifactType.TEST_REPORT],
    ])('maps "%s"', (input, expected) => {
      expect(agent().resolveArtifactType(input)).toBe(expected);
    });
    it('e2e_tests falls through to default (regex strips digits)', () => {
      expect(agent().resolveArtifactType('e2e_tests')).toBe(ArtifactType.TEST_REPORT);
    });
    it('defaults unknown to TEST_REPORT', () => {
      expect(agent().resolveArtifactType('bogus')).toBe(ArtifactType.TEST_REPORT);
    });
  });

  describe('resolveIssueType', () => {
    it.each([
      ['bug', IssueType.BUG],
      ['missing_test', IssueType.MISSING_TEST],
      ['code_quality', IssueType.CODE_QUALITY],
    ])('maps "%s"', (input, expected) => {
      expect(agent().resolveIssueType(input)).toBe(expected);
    });
    it('defaults unknown to MISSING_TEST', () => {
      expect(agent().resolveIssueType('zzz')).toBe(IssueType.MISSING_TEST);
    });
  });

  describe('resolveIssueSeverity', () => {
    it.each(['critical', 'high', 'medium', 'low', 'info'])('maps "%s"', (s) => {
      expect(agent().resolveIssueSeverity(s)).toBe(s);
    });
    it('defaults unknown to MEDIUM', () => {
      expect(agent().resolveIssueSeverity('x')).toBe(IssueSeverity.MEDIUM);
    });
  });

  describe('detectTestabilityIssues', () => {
    it('flags no exported symbols on large file', () => {
      const lines = Array(30).fill('const x = 1;');
      const source = makeArtifact({ type: ArtifactType.SOURCE_CODE, content: lines.join('\n'), filePath: 'src/noexport.ts' });
      const issues = agent().detectTestabilityIssues([source], undefined);
      const noExports = issues.find((i: any) => i.title.includes('No exported symbols'));
      expect(noExports).toBeDefined();
    });

    it('flags direct DB calls without DI', () => {
      const source = makeArtifact({
        type: ArtifactType.SOURCE_CODE,
        content: 'export function getData() { return query("SELECT *"); }',
        filePath: 'src/db.ts',
      });
      const issues = agent().detectTestabilityIssues([source], undefined);
      const dbIssue = issues.find((i: any) => i.title.includes('database coupling'));
      expect(dbIssue).toBeDefined();
    });

    it('flags global state mutation', () => {
      const source = makeArtifact({
        type: ArtifactType.SOURCE_CODE,
        content: 'export const x = 1;\nglobal.myVar = 42;',
        filePath: 'src/globals.ts',
      });
      const issues = agent().detectTestabilityIssues([source], undefined);
      const globalIssue = issues.find((i: any) => i.title.includes('Global state'));
      expect(globalIssue).toBeDefined();
    });

    it('flags vague acceptance criteria', () => {
      const criteria = makeArtifact({
        type: ArtifactType.ACCEPTANCE_CRITERIA,
        content: '- The feature should work properly\n- The feature should be fast',
      });
      const issues = agent().detectTestabilityIssues([], criteria);
      const vagueIssue = issues.find((i: any) => i.title.includes('Vague acceptance criteria'));
      expect(vagueIssue).toBeDefined();
    });

    it('no vague criteria issue when criteria are measurable', () => {
      const criteria = makeArtifact({
        type: ArtifactType.ACCEPTANCE_CRITERIA,
        content: '- Response time must be < 200ms\n- Error rate must be < 0.1%',
      });
      const issues = agent().detectTestabilityIssues([], criteria);
      const vagueIssue = issues.find((i: any) => i.title.includes('Vague acceptance criteria'));
      expect(vagueIssue).toBeUndefined();
    });
  });

  describe('produceArtifacts — default fallback', () => {
    it('generates default TEST_REPORT when no parseable artifacts', async () => {
      const a = agent();
      const task = makeTask(AgentRole.QA_ENGINEER, {
        stage: PipelineStage.TESTING,
        inputArtifacts: [],
      });
      const artifacts = await a.produceArtifacts(task, 'plain text with no markers');
      expect(artifacts.length).toBeGreaterThan(0);
      expect(artifacts[0].type).toBe(ArtifactType.TEST_REPORT);
    });
  });
});

// ─── DevOpsEngineerAgent ────────────────────────────────────────────────────

describe('DevOpsEngineerAgent branch coverage', () => {
  const agent = () => registry.getAgent(AgentRole.DEVOPS_ENGINEER) as any;

  describe('identifyIssues — architecture gaps', () => {
    it('flags missing health check', async () => {
      const task = makeTask(AgentRole.DEVOPS_ENGINEER, {
        stage: PipelineStage.DEPLOYMENT,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC, content: 'microservices with scaling and monitoring and backup and cost and sla' }),
        ],
      });
      const result = await agent().execute(task);
      const issue = result.issues.find((i: any) => i.title.includes('health check'));
      expect(issue).toBeDefined();
    });

    it('does not flag health check when present', async () => {
      const task = makeTask(AgentRole.DEVOPS_ENGINEER, {
        stage: PipelineStage.DEPLOYMENT,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC, content: 'health check endpoint /health scaling monitoring backup cost sla' }),
        ],
      });
      const result = await agent().execute(task);
      const issue = result.issues.find((i: any) => i.title.includes('health check'));
      expect(issue).toBeUndefined();
    });

    it('flags no disaster recovery', async () => {
      const task = makeTask(AgentRole.DEVOPS_ENGINEER, {
        stage: PipelineStage.DEPLOYMENT,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC, content: 'health check scaling monitoring cost sla' }),
        ],
      });
      const result = await agent().execute(task);
      const issue = result.issues.find((i: any) => i.title.includes('disaster recovery'));
      expect(issue).toBeDefined();
    });

    it('flags no scaling strategy', async () => {
      const task = makeTask(AgentRole.DEVOPS_ENGINEER, {
        stage: PipelineStage.DEPLOYMENT,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC, content: 'health check backup monitoring cost sla' }),
        ],
      });
      const result = await agent().execute(task);
      const issue = result.issues.find((i: any) => i.title.includes('scaling'));
      expect(issue).toBeDefined();
    });

    it('flags no monitoring', async () => {
      const task = makeTask(AgentRole.DEVOPS_ENGINEER, {
        stage: PipelineStage.DEPLOYMENT,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC, content: 'health check backup scaling cost sla' }),
        ],
      });
      const result = await agent().execute(task);
      const issue = result.issues.find((i: any) => i.title.includes('monitoring'));
      expect(issue).toBeDefined();
    });

    it('flags no cost analysis', async () => {
      const task = makeTask(AgentRole.DEVOPS_ENGINEER, {
        stage: PipelineStage.DEPLOYMENT,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC, content: 'health check backup scaling monitoring sla' }),
        ],
      });
      const result = await agent().execute(task);
      const issue = result.issues.find((i: any) => i.title.includes('cost'));
      expect(issue).toBeDefined();
    });

    it('flags no SLA/SLO', async () => {
      const task = makeTask(AgentRole.DEVOPS_ENGINEER, {
        stage: PipelineStage.DEPLOYMENT,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.ARCHITECTURE_DOC, content: 'health check backup scaling monitoring cost' }),
        ],
      });
      const result = await agent().execute(task);
      const issue = result.issues.find((i: any) => i.title.includes('SLA'));
      expect(issue).toBeDefined();
    });

    it('no arch-related issues when all concerns present', async () => {
      const task = makeTask(AgentRole.DEVOPS_ENGINEER, {
        stage: PipelineStage.DEPLOYMENT,
        inputArtifacts: [
          makeArtifact({
            type: ArtifactType.ARCHITECTURE_DOC,
            content: 'health check backup disaster recovery scaling autoscaling monitoring observability alert cost budget sla slo uptime',
          }),
        ],
      });
      const result = await agent().execute(task);
      const archIssues = result.issues.filter((i: any) =>
        ['health check', 'disaster recovery', 'scaling', 'monitoring', 'cost', 'SLA'].some(t => i.title.toLowerCase().includes(t.toLowerCase())),
      );
      expect(archIssues).toHaveLength(0);
    });
  });

  describe('resolveArtifactType', () => {
    it.each([
      ['deployment_plan', ArtifactType.DEPLOYMENT_PLAN],
      ['infrastructure_config', ArtifactType.INFRASTRUCTURE_CONFIG],
      ['ci_cd_config', ArtifactType.CI_CD_CONFIG],
      ['monitoring_config', ArtifactType.MONITORING_CONFIG],
      ['alerting_rules', ArtifactType.ALERTING_RULES],
      ['scaling_policy', ArtifactType.SCALING_POLICY],
      ['cost_analysis', ArtifactType.COST_ANALYSIS],
      ['sla_definition', ArtifactType.SLA_DEFINITION],
      ['disaster_recovery_plan', ArtifactType.DISASTER_RECOVERY_PLAN],
      ['performance_benchmark', ArtifactType.PERFORMANCE_BENCHMARK],
      ['runbook', ArtifactType.RUNBOOK],
    ])('maps "%s"', (input, expected) => {
      expect(agent().resolveArtifactType(input)).toBe(expected);
    });
    it('returns null for unknown', () => {
      expect(agent().resolveArtifactType('bogus')).toBeNull();
    });
  });

  describe('resolveIssueSeverity', () => {
    it.each(['critical', 'high', 'medium', 'low', 'info'])('maps "%s"', (s) => {
      expect(agent().resolveIssueSeverity(s)).toBe(s);
    });
    it('defaults to MEDIUM', () => {
      expect(agent().resolveIssueSeverity('x')).toBe(IssueSeverity.MEDIUM);
    });
  });

  describe('secReport branch in performWork', () => {
    it('includes security hardening section when secReport present', async () => {
      const task = makeTask(AgentRole.DEVOPS_ENGINEER, {
        stage: PipelineStage.DEPLOYMENT,
        inputArtifacts: [
          makeArtifact({ type: ArtifactType.SECURITY_REPORT, content: 'findings here' }),
        ],
      });
      const result = await agent().execute(task);
      expect(result.output).toContain('Security Hardening');
    });

    it('omits security hardening when no secReport', async () => {
      const task = makeTask(AgentRole.DEVOPS_ENGINEER, {
        stage: PipelineStage.DEPLOYMENT,
        inputArtifacts: [],
      });
      const result = await agent().execute(task);
      expect(result.output).not.toContain('Security Hardening');
    });
  });
});
