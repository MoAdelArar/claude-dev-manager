import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  AgentRole,
  PipelineStage,
  ArtifactType,
  IssueType,
  IssueSeverity,
  type AgentTask,
} from '../../src/types';
import { AgentRegistry } from '../../src/agents/index';
import { ArtifactStore } from '../../src/workspace/artifact-store';
import { ClaudeCodeBridge, type ExecutionMode } from '../../src/orchestrator/claude-code-bridge';

let tempDir: string;
let artifactStore: ArtifactStore;
let registry: AgentRegistry;

function makeTask(role: AgentRole = AgentRole.PRODUCT_MANAGER, overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    featureId: 'feat-1',
    stage: PipelineStage.REQUIREMENTS_GATHERING,
    assignedTo: role,
    title: 'Test Task',
    description: 'A test task',
    instructions: 'Do things',
    inputArtifacts: [],
    expectedOutputs: [],
    constraints: [],
    priority: 'high' as any,
    status: 'idle' as any,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-bridge-test-'));
  artifactStore = new ArtifactStore(tempDir);
  registry = new AgentRegistry(artifactStore);
});

afterEach(() => {
  registry.reset();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('ClaudeCodeBridge branch coverage', () => {
  describe('isClaudeAvailable()', () => {
    it('returns false with nonexistent path', () => {
      const bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        claudePath: '/nonexistent/path/to/claude-binary-xyz',
      });
      expect(bridge.isClaudeAvailable()).toBe(false);
    });

    it('caches the result on subsequent calls', () => {
      const bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        claudePath: '/nonexistent/path/to/claude-binary-xyz',
      });
      const first = bridge.isClaudeAvailable();
      const second = bridge.isClaudeAvailable();
      expect(first).toBe(second);
      expect(first).toBe(false);
    });
  });

  describe('getExecutionMode()', () => {
    it('returns simulation when configured', () => {
      const bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        executionMode: 'simulation',
      });
      expect(bridge.getExecutionMode()).toBe('simulation');
    });

    it('returns claude-cli when configured', () => {
      const bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        executionMode: 'claude-cli',
      });
      expect(bridge.getExecutionMode()).toBe('claude-cli');
    });

    it('defaults to claude-cli when no executionMode set', () => {
      const bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
      });
      expect(bridge.getExecutionMode()).toBe('claude-cli');
    });
  });

  describe('executeAgentTask() in simulation mode', () => {
    it('returns valid result', async () => {
      const bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        executionMode: 'simulation',
      });
      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const result = await bridge.executeAgentTask(task);

      expect(result.agentRole).toBe(AgentRole.PRODUCT_MANAGER);
      expect(result.status).toBe('success');
      expect(result.output.length).toBeGreaterThan(0);
      expect(result.tokensUsed).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata).toHaveProperty('executionMode', 'simulation');
    });

    it('returns failure result when agent throws', async () => {
      const bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        executionMode: 'simulation',
      });

      const origGetAgent = registry.getAgent.bind(registry);
      registry.getAgent = (role) => {
        const agent = origGetAgent(role);
        agent.execute = async () => { throw new Error('Agent boom'); };
        return agent;
      };

      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const result = await bridge.executeAgentTask(task);

      expect(result.status).toBe('failure');
      expect(result.output).toContain('Agent boom');
      registry.getAgent = origGetAgent;
    });
  });

  describe('parseArtifacts()', () => {
    let bridge: ClaudeCodeBridge;
    const task = makeTask();

    beforeEach(() => {
      bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        executionMode: 'simulation',
      });
    });

    it('parses well-formed artifacts', () => {
      const output = [
        '---ARTIFACT_START---',
        'Type: requirements_doc',
        'Name: Req Doc',
        'Description: Full requirements',
        'Content:',
        'Requirements content here',
        '---ARTIFACT_END---',
      ].join('\n');
      const artifacts = bridge.parseArtifacts(output, task);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].type).toBe(ArtifactType.REQUIREMENTS_DOC);
      expect(artifacts[0].name).toBe('Req Doc');
      expect(artifacts[0].description).toBe('Full requirements');
      expect(artifacts[0].content).toBe('Requirements content here');
    });

    it('parses artifacts without Description', () => {
      const output = [
        '---ARTIFACT_START---',
        'Type: user_stories',
        'Name: Stories',
        'Content:',
        'Story body',
        '---ARTIFACT_END---',
      ].join('\n');
      const artifacts = bridge.parseArtifacts(output, task);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].description).toBe('');
    });

    it('skips artifacts with missing Type', () => {
      const output = [
        '---ARTIFACT_START---',
        'Name: No Type',
        'Content:',
        'stuff',
        '---ARTIFACT_END---',
      ].join('\n');
      const artifacts = bridge.parseArtifacts(output, task);
      expect(artifacts).toHaveLength(0);
    });

    it('skips artifacts with missing Content', () => {
      const output = [
        '---ARTIFACT_START---',
        'Type: requirements_doc',
        'Name: No Content',
        '---ARTIFACT_END---',
      ].join('\n');
      const artifacts = bridge.parseArtifacts(output, task);
      expect(artifacts).toHaveLength(0);
    });

    it('skips artifacts with unknown type', () => {
      const output = [
        '---ARTIFACT_START---',
        'Type: totally_made_up_type_xyz',
        'Name: Unknown',
        'Content:',
        'stuff',
        '---ARTIFACT_END---',
      ].join('\n');
      const artifacts = bridge.parseArtifacts(output, task);
      expect(artifacts).toHaveLength(0);
    });

    it('returns empty for empty output', () => {
      expect(bridge.parseArtifacts('', task)).toHaveLength(0);
    });

    it('returns empty for output without markers', () => {
      expect(bridge.parseArtifacts('just plain text', task)).toHaveLength(0);
    });

    it('parses multiple artifacts', () => {
      const output = [
        '---ARTIFACT_START---',
        'Type: requirements_doc',
        'Name: Req',
        'Content:',
        'req content',
        '---ARTIFACT_END---',
        '---ARTIFACT_START---',
        'Type: user_stories',
        'Name: Stories',
        'Content:',
        'story content',
        '---ARTIFACT_END---',
      ].join('\n');
      const artifacts = bridge.parseArtifacts(output, task);
      expect(artifacts).toHaveLength(2);
    });
  });

  describe('parseIssues()', () => {
    let bridge: ClaudeCodeBridge;
    const task = makeTask();

    beforeEach(() => {
      bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        executionMode: 'simulation',
      });
    });

    it('parses well-formed issues', () => {
      const output = [
        '---ISSUE_START---',
        'Type: bug',
        'Severity: high',
        'Title: Something broke',
        'Description: It is broken',
        '---ISSUE_END---',
      ].join('\n');
      const issues = bridge.parseIssues(output, task);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe(IssueType.BUG);
      expect(issues[0].severity).toBe(IssueSeverity.HIGH);
      expect(issues[0].title).toBe('Something broke');
    });

    it('defaults severity to medium when missing', () => {
      const output = [
        '---ISSUE_START---',
        'Type: code_quality',
        'Title: No sev',
        '---ISSUE_END---',
      ].join('\n');
      const issues = bridge.parseIssues(output, task);
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe(IssueSeverity.MEDIUM);
    });

    it('skips issue blocks missing Title', () => {
      const output = [
        '---ISSUE_START---',
        'Type: bug',
        'Description: orphaned',
        '---ISSUE_END---',
      ].join('\n');
      const issues = bridge.parseIssues(output, task);
      expect(issues).toHaveLength(0);
    });

    it('returns empty for empty output', () => {
      expect(bridge.parseIssues('', task)).toHaveLength(0);
    });

    it('returns empty for no markers', () => {
      expect(bridge.parseIssues('just text', task)).toHaveLength(0);
    });
  });

  describe('resolveArtifactType() — ALL mapped types', () => {
    let bridge: ClaudeCodeBridge;

    beforeEach(() => {
      bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        executionMode: 'simulation',
      });
    });

    const mappings: [string, ArtifactType][] = [
      ['requirements_doc', ArtifactType.REQUIREMENTS_DOC],
      ['requirements_document', ArtifactType.REQUIREMENTS_DOC],
      ['requirements', ArtifactType.REQUIREMENTS_DOC],
      ['user_stories', ArtifactType.USER_STORIES],
      ['user_story', ArtifactType.USER_STORIES],
      ['acceptance_criteria', ArtifactType.ACCEPTANCE_CRITERIA],
      ['architecture_doc', ArtifactType.ARCHITECTURE_DOC],
      ['architecture_document', ArtifactType.ARCHITECTURE_DOC],
      ['architecture', ArtifactType.ARCHITECTURE_DOC],
      ['system_diagram', ArtifactType.SYSTEM_DIAGRAM],
      ['api_spec', ArtifactType.API_SPEC],
      ['api_specification', ArtifactType.API_SPEC],
      ['data_model', ArtifactType.DATA_MODEL],
      ['ui_spec', ArtifactType.UI_SPEC],
      ['wireframe', ArtifactType.WIREFRAME],
      ['component_spec', ArtifactType.COMPONENT_SPEC],
      ['task_list', ArtifactType.TASK_LIST],
      ['sprint_plan', ArtifactType.SPRINT_PLAN],
      ['source_code', ArtifactType.SOURCE_CODE],
      ['code', ArtifactType.SOURCE_CODE],
      ['unit_tests', ArtifactType.UNIT_TESTS],
      ['integration_tests', ArtifactType.INTEGRATION_TESTS],
      ['e2e_tests', ArtifactType.E2E_TESTS],
      ['test_plan', ArtifactType.TEST_PLAN],
      ['test_report', ArtifactType.TEST_REPORT],
      ['code_review_report', ArtifactType.CODE_REVIEW_REPORT],
      ['code_review', ArtifactType.CODE_REVIEW_REPORT],
      ['security_report', ArtifactType.SECURITY_REPORT],
      ['deployment_plan', ArtifactType.DEPLOYMENT_PLAN],
      ['infrastructure_config', ArtifactType.INFRASTRUCTURE_CONFIG],
      ['ci_cd_config', ArtifactType.CI_CD_CONFIG],
      ['api_documentation', ArtifactType.API_DOCUMENTATION],
      ['user_documentation', ArtifactType.USER_DOCUMENTATION],
      ['developer_documentation', ArtifactType.DEVELOPER_DOCUMENTATION],
      ['changelog', ArtifactType.CHANGELOG],
      ['monitoring_config', ArtifactType.MONITORING_CONFIG],
      ['monitoring', ArtifactType.MONITORING_CONFIG],
      ['alerting_rules', ArtifactType.ALERTING_RULES],
      ['alerting', ArtifactType.ALERTING_RULES],
      ['scaling_policy', ArtifactType.SCALING_POLICY],
      ['scaling', ArtifactType.SCALING_POLICY],
      ['cost_analysis', ArtifactType.COST_ANALYSIS],
      ['cost', ArtifactType.COST_ANALYSIS],
      ['sla_definition', ArtifactType.SLA_DEFINITION],
      ['sla', ArtifactType.SLA_DEFINITION],
      ['disaster_recovery_plan', ArtifactType.DISASTER_RECOVERY_PLAN],
      ['disaster_recovery', ArtifactType.DISASTER_RECOVERY_PLAN],
      ['performance_benchmark', ArtifactType.PERFORMANCE_BENCHMARK],
      ['benchmark', ArtifactType.PERFORMANCE_BENCHMARK],
      ['runbook', ArtifactType.RUNBOOK],
      ['technology_decision_record', ArtifactType.TECHNOLOGY_DECISION_RECORD],
      ['tdr', ArtifactType.TECHNOLOGY_DECISION_RECORD],
      ['integration_plan', ArtifactType.INTEGRATION_PLAN],
      ['migration_strategy', ArtifactType.MIGRATION_STRATEGY],
      ['database_schema', ArtifactType.DATABASE_SCHEMA],
      ['schema', ArtifactType.DATABASE_SCHEMA],
      ['migration_script', ArtifactType.MIGRATION_SCRIPT],
      ['query_optimization_report', ArtifactType.QUERY_OPTIMIZATION_REPORT],
      ['load_test_plan', ArtifactType.LOAD_TEST_PLAN],
      ['performance_report', ArtifactType.PERFORMANCE_REPORT],
      ['compliance_report', ArtifactType.COMPLIANCE_REPORT],
      ['privacy_impact_assessment', ArtifactType.PRIVACY_IMPACT_ASSESSMENT],
      ['accessibility_report', ArtifactType.ACCESSIBILITY_REPORT],
      ['accessibility_test_suite', ArtifactType.ACCESSIBILITY_TEST_SUITE],
      ['business_case', ArtifactType.BUSINESS_CASE],
      ['roi_analysis', ArtifactType.ROI_ANALYSIS],
      ['incident_response_plan', ArtifactType.INCIDENT_RESPONSE_PLAN],
      ['capacity_plan', ArtifactType.CAPACITY_PLAN],
      ['chaos_test_plan', ArtifactType.CHAOS_TEST_PLAN],
    ];

    it.each(mappings)('resolves "%s" → %s', (input, expected) => {
      const output = [
        '---ARTIFACT_START---',
        `Type: ${input}`,
        'Name: Test',
        'Content:',
        'body',
        '---ARTIFACT_END---',
      ].join('\n');
      const artifacts = bridge.parseArtifacts(output, makeTask());
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].type).toBe(expected);
    });

    it('returns null for unknown type', () => {
      const output = [
        '---ARTIFACT_START---',
        'Type: made_up_nonexistent_thing',
        'Name: Test',
        'Content:',
        'body',
        '---ARTIFACT_END---',
      ].join('\n');
      const artifacts = bridge.parseArtifacts(output, makeTask());
      expect(artifacts).toHaveLength(0);
    });
  });

  describe('resolveIssueType() — ALL mapped types', () => {
    let bridge: ClaudeCodeBridge;

    beforeEach(() => {
      bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        executionMode: 'simulation',
      });
    });

    const issueMappings: [string, IssueType][] = [
      ['bug', IssueType.BUG],
      ['design_flaw', IssueType.DESIGN_FLAW],
      ['security_vulnerability', IssueType.SECURITY_VULNERABILITY],
      ['security', IssueType.SECURITY_VULNERABILITY],
      ['performance', IssueType.PERFORMANCE],
      ['code_quality', IssueType.CODE_QUALITY],
      ['missing_test', IssueType.MISSING_TEST],
      ['documentation_gap', IssueType.DOCUMENTATION_GAP],
      ['dependency_issue', IssueType.DEPENDENCY_ISSUE],
      ['architecture_concern', IssueType.ARCHITECTURE_CONCERN],
      ['scalability', IssueType.SCALABILITY],
      ['observability', IssueType.OBSERVABILITY],
      ['cost_optimization', IssueType.COST_OPTIMIZATION],
      ['reliability', IssueType.RELIABILITY],
      ['compliance_violation', IssueType.COMPLIANCE_VIOLATION],
      ['compliance', IssueType.COMPLIANCE_VIOLATION],
      ['accessibility_violation', IssueType.ACCESSIBILITY_VIOLATION],
      ['accessibility', IssueType.ACCESSIBILITY_VIOLATION],
      ['data_privacy_concern', IssueType.DATA_PRIVACY_CONCERN],
      ['data_privacy', IssueType.DATA_PRIVACY_CONCERN],
    ];

    it.each(issueMappings)('resolves "%s" → %s', (input, expected) => {
      const output = [
        '---ISSUE_START---',
        `Type: ${input}`,
        'Severity: medium',
        'Title: Test Issue',
        'Description: test',
        '---ISSUE_END---',
      ].join('\n');
      const issues = bridge.parseIssues(output, makeTask());
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe(expected);
    });

    it('defaults unknown to BUG', () => {
      const output = [
        '---ISSUE_START---',
        'Type: totally_unknown_issue_type_xyz',
        'Title: Unknown type',
        '---ISSUE_END---',
      ].join('\n');
      const issues = bridge.parseIssues(output, makeTask());
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe(IssueType.BUG);
    });
  });

  describe('resolveIssueSeverity() — ALL mapped severities', () => {
    let bridge: ClaudeCodeBridge;

    beforeEach(() => {
      bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        executionMode: 'simulation',
      });
    });

    it.each([
      ['critical', IssueSeverity.CRITICAL],
      ['high', IssueSeverity.HIGH],
      ['medium', IssueSeverity.MEDIUM],
      ['low', IssueSeverity.LOW],
      ['info', IssueSeverity.INFO],
    ])('resolves "%s" → %s', (input, expected) => {
      const output = [
        '---ISSUE_START---',
        'Type: bug',
        `Severity: ${input}`,
        'Title: Sev test',
        '---ISSUE_END---',
      ].join('\n');
      const issues = bridge.parseIssues(output, makeTask());
      expect(issues[0].severity).toBe(expected);
    });

    it('defaults unknown severity to MEDIUM', () => {
      const output = [
        '---ISSUE_START---',
        'Type: bug',
        'Severity: banana',
        'Title: Bad sev',
        '---ISSUE_END---',
      ].join('\n');
      const issues = bridge.parseIssues(output, makeTask());
      expect(issues[0].severity).toBe(IssueSeverity.MEDIUM);
    });
  });

  describe('writeAgentInstructionFiles()', () => {
    it('creates instruction files for all agents', () => {
      const bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        executionMode: 'simulation',
      });
      bridge.writeAgentInstructionFiles();

      const agentsDir = path.join(tempDir, 'agents');
      expect(fs.existsSync(agentsDir)).toBe(true);

      const files = fs.readdirSync(agentsDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files.some(f => f.endsWith('.md'))).toBe(true);

      const firstFile = fs.readFileSync(path.join(agentsDir, files[0]), 'utf-8');
      expect(firstFile).toContain('Role:');
      expect(firstFile).toContain('System Prompt');
    });
  });

  describe('generateMainClaudeMd()', () => {
    it('includes team structure', () => {
      const bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        executionMode: 'simulation',
      });
      const content = bridge.generateMainClaudeMd();

      expect(content).toContain('Team Structure');
      expect(content).toContain('Product Manager');
      expect(content).toContain('Engineering Manager');
      expect(content).toContain('ARTIFACT_START');
      expect(content).toContain('ISSUE_START');
      expect(content).toContain('Development Pipeline');
      expect(content).toContain('Agent Delegation Protocol');
    });
  });

  describe('generateSubagentPrompt()', () => {
    it('generates a prompt for the given task', () => {
      const bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        executionMode: 'simulation',
      });
      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const prompt = bridge.generateSubagentPrompt(task);

      expect(prompt).toContain('Agent Role');
      expect(prompt).toContain('Current Task');
      expect(prompt.length).toBeGreaterThan(100);
    });
  });

  describe('resolveExecutionMode (internal)', () => {
    it('falls back to simulation when claude-cli is set but claude not available', async () => {
      const bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        executionMode: 'claude-cli',
        claudePath: '/nonexistent/claude',
      });

      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const result = await bridge.executeAgentTask(task);

      expect(result.metadata.executionMode).toBe('simulation');
    });

    it('uses simulation directly when configured', async () => {
      const bridge = new ClaudeCodeBridge(registry, artifactStore, {
        projectPath: tempDir,
        executionMode: 'simulation',
      });

      const task = makeTask(AgentRole.PRODUCT_MANAGER);
      const result = await bridge.executeAgentTask(task);
      expect(result.metadata.executionMode).toBe('simulation');
    });
  });
});
