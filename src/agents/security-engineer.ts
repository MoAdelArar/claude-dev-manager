import {
  type AgentConfig,
  AgentRole,
  type AgentTask,
  type Artifact,
  ArtifactType,
  type Issue,
  IssueType,
  IssueSeverity,
  PipelineStage,
} from '../types';
import { BaseAgent } from './base-agent';
import { type ArtifactStore } from '../workspace/artifact-store';
import { agentLog } from '../utils/logger';

interface ParsedArtifact {
  type: string;
  name: string;
  description: string;
  content: string;
}

interface ParsedIssue {
  type: string;
  severity: string;
  title: string;
  description: string;
}

interface ParsedOutput {
  summary: string;
  artifacts: ParsedArtifact[];
  issues: ParsedIssue[];
  recommendations: string;
}

const SECURITY_ENGINEER_SYSTEM_PROMPT = `Security Engineer. Identifies vulnerabilities and designs mitigations across the full stack.

OWASP Top 10: broken access control (IDOR/CORS/traversal), cryptographic failures (weak algos/hardcoded keys/missing TLS), injection (SQL/NoSQL/OS/XSS/template), insecure design (missing rate limiting/business logic flaws), misconfiguration (default creds/verbose errors/missing security headers), vulnerable components (CVEs/SCA), auth failures (weak passwords/missing MFA/session fixation), integrity failures (unsigned updates/insecure deserialization), logging gaps (missing audit trails/PII in logs), SSRF.
Auth/AuthZ: JWT (algorithm confusion, expiry, rotation), sessions (SameSite, secure flags, expiry), OAuth2/OIDC (PKCE, state param), RBAC/ABAC completeness.
Data: encryption at rest+in transit, PII classification, secrets management (no hardcoded values, vault usage), data retention/deletion, GDPR/CCPA.
Infrastructure: minimal container images, non-root execution, network segmentation, least-privilege IAM.
API: input validation on all endpoints, rate limiting, request size limits; GraphQL: depth limiting, no introspection in production.
Output per finding: title + CWE + CVSS v3.1 score + affected file/line + PoC/attack scenario + remediation steps with code. Severity: CRITICAL/HIGH/MEDIUM/LOW/INFO. Produce a Security Report artifact.`;

export const SECURITY_ENGINEER_CONFIG: AgentConfig = {
  role: AgentRole.SECURITY_ENGINEER,
  name: 'security-engineer',
  title: 'Security Engineer',
  description: 'Performs comprehensive security audits, vulnerability assessments, and threat modeling',
  systemPrompt: SECURITY_ENGINEER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'security_audit',
      description: 'Comprehensive security review of source code and architecture',
      allowedTools: ['Read', 'Grep', 'Glob', 'Shell'],
      filePatterns: ['**/*'],
    },
    {
      name: 'vulnerability_assessment',
      description: 'Identifies and classifies security vulnerabilities',
      allowedTools: ['Read', 'Grep', 'Shell'],
      filePatterns: ['**/*'],
    },
    {
      name: 'threat_modeling',
      description: 'Analyzes attack surfaces and threat vectors',
      allowedTools: ['Read', 'Grep'],
      filePatterns: ['**/*.md', '**/*.yaml', '**/*.json'],
    },
  ],
  maxTokenBudget: 30000,
  allowedFilePatterns: ['**/*'],
  blockedFilePatterns: [],
  reportsTo: AgentRole.ENGINEERING_MANAGER,
  directReports: [],
  requiredInputArtifacts: [
    ArtifactType.SOURCE_CODE,
    ArtifactType.ARCHITECTURE_DOC,
    ArtifactType.API_SPEC,
  ],
  outputArtifacts: [ArtifactType.SECURITY_REPORT],
};

export default class SecurityEngineerAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(SECURITY_ENGINEER_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Beginning comprehensive security audit', task.stage);

    const sections: string[] = [];
    sections.push('# Security Audit Report\n');

    const sourceArtifacts = task.inputArtifacts.filter(
      (a) => a.type === ArtifactType.SOURCE_CODE,
    );
    const archDoc = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.ARCHITECTURE_DOC,
    );
    const apiSpec = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.API_SPEC,
    );
    const infraConfig = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.INFRASTRUCTURE_CONFIG,
    );

    sections.push('## Scope of Audit\n');
    sections.push(`- Source code artifacts reviewed: ${sourceArtifacts.length}`);
    sections.push(`- Architecture document: ${archDoc ? 'Available' : 'Not provided'}`);
    sections.push(`- API specification: ${apiSpec ? 'Available' : 'Not provided'}`);
    sections.push(`- Infrastructure config: ${infraConfig ? 'Available' : 'Not provided'}`);

    if (archDoc) {
      sections.push('\n## Architecture Security Analysis\n');
      sections.push('Analyzing architecture for security concerns...\n');
      sections.push(this.analyzeArchitectureSecurity(archDoc.content));
    }

    if (apiSpec) {
      sections.push('\n## API Security Analysis\n');
      sections.push(this.analyzeApiSecurity(apiSpec.content));
    }

    for (const source of sourceArtifacts) {
      sections.push(`\n## Code Security Review: ${source.name}\n`);
      sections.push(this.analyzeCodeSecurity(source.content));
    }

    sections.push('\n## Dependency Security\n');
    sections.push(this.analyzeDependencySecurity(sourceArtifacts));

    sections.push('\n## Security Recommendations Summary\n');
    sections.push(this.generateRecommendations(sourceArtifacts, archDoc, apiSpec));

    const output = sections.join('\n');

    agentLog(this.role, 'Security audit complete', task.stage);
    return output;
  }

  protected async produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]> {
    const parsed = this.parseClaudeOutput(output);
    const artifacts: Artifact[] = [];

    if (parsed.artifacts.length > 0) {
      for (const pa of parsed.artifacts) {
        const artifactType = this.resolveArtifactType(pa.type);
        if (artifactType) {
          const artifact = this.createArtifact(
            artifactType,
            pa.name,
            pa.description,
            pa.content,
            `.cdm/security/${pa.name.toLowerCase().replace(/\s+/g, '-')}.md`,
          );
          this.artifactStore.store(artifact);
          artifacts.push(artifact);
        }
      }
    }

    if (!artifacts.some((a) => a.type === ArtifactType.SECURITY_REPORT)) {
      const report = this.createArtifact(
        ArtifactType.SECURITY_REPORT,
        'Security Audit Report',
        'Comprehensive security audit covering OWASP Top 10, authentication, data protection, and infrastructure security',
        output,
        '.cdm/security/security-audit-report.md',
      );
      this.artifactStore.store(report);
      artifacts.push(report);
    }

    return artifacts;
  }

  protected async identifyIssues(task: AgentTask, output: string): Promise<Issue[]> {
    const parsed = this.parseClaudeOutput(output);
    const issues: Issue[] = [];

    for (const pi of parsed.issues) {
      const severity = this.resolveIssueSeverity(pi.severity);
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.SECURITY_VULNERABILITY,
          severity,
          pi.title,
          pi.description,
          task.stage,
        ),
      );
    }

    for (const source of task.inputArtifacts.filter((a) => a.type === ArtifactType.SOURCE_CODE)) {
      const content = source.content.toLowerCase();

      if (/password\s*=\s*['"][^'"]+['"]/.test(content) || /api[_-]?key\s*=\s*['"][^'"]+['"]/.test(content)) {
        issues.push(this.createIssue(
          task.featureId, IssueType.SECURITY_VULNERABILITY, IssueSeverity.CRITICAL,
          'Hardcoded credentials detected',
          `Potential hardcoded secrets found in ${source.name}. Use environment variables or a secrets vault.`,
          task.stage,
        ));
      }

      if (/eval\s*\(/.test(content) || /new\s+Function\s*\(/.test(content)) {
        issues.push(this.createIssue(
          task.featureId, IssueType.SECURITY_VULNERABILITY, IssueSeverity.HIGH,
          'Dangerous code execution pattern',
          `Use of eval() or new Function() detected in ${source.name}. This creates injection attack vectors.`,
          task.stage,
        ));
      }

      if (/innerHTML\s*=/.test(content) || /dangerouslySetInnerHTML/.test(content)) {
        issues.push(this.createIssue(
          task.featureId, IssueType.SECURITY_VULNERABILITY, IssueSeverity.HIGH,
          'Potential XSS vulnerability',
          `Direct HTML injection via innerHTML or dangerouslySetInnerHTML in ${source.name}. Sanitize input or use safe alternatives.`,
          task.stage,
        ));
      }

      if (/SELECT\s+.*\s+FROM\s+.*\+/.test(source.content) || /`SELECT\s+.*\$\{/.test(source.content)) {
        issues.push(this.createIssue(
          task.featureId, IssueType.SECURITY_VULNERABILITY, IssueSeverity.CRITICAL,
          'Potential SQL injection',
          `String concatenation in SQL queries detected in ${source.name}. Use parameterized queries.`,
          task.stage,
        ));
      }

      if (!content.includes('helmet') && !content.includes('security-headers') && content.includes('express')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.SECURITY_VULNERABILITY, IssueSeverity.MEDIUM,
          'Missing security headers middleware',
          `Express app in ${source.name} does not appear to use helmet or equivalent security headers middleware.`,
          task.stage,
        ));
      }

      if (content.includes('cors') && /cors\(\s*\)/.test(content)) {
        issues.push(this.createIssue(
          task.featureId, IssueType.SECURITY_VULNERABILITY, IssueSeverity.MEDIUM,
          'Overly permissive CORS configuration',
          `CORS is configured with defaults (allow all origins) in ${source.name}. Restrict to specific origins.`,
          task.stage,
        ));
      }
    }

    return issues;
  }

  private analyzeArchitectureSecurity(archContent: string): string {
    const findings: string[] = [];
    const lower = archContent.toLowerCase();

    if (!lower.includes('authentication') && !lower.includes('auth')) {
      findings.push('- **CRITICAL**: No authentication mechanism described in architecture');
    }
    if (!lower.includes('authorization') && !lower.includes('rbac') && !lower.includes('acl')) {
      findings.push('- **HIGH**: No authorization model defined');
    }
    if (!lower.includes('encryption') && !lower.includes('tls') && !lower.includes('https')) {
      findings.push('- **HIGH**: No encryption strategy described');
    }
    if (!lower.includes('rate limit') && !lower.includes('throttl')) {
      findings.push('- **MEDIUM**: No rate limiting strategy described');
    }
    if (!lower.includes('logging') && !lower.includes('audit')) {
      findings.push('- **MEDIUM**: No security logging or audit trail described');
    }
    if (!lower.includes('input validation') && !lower.includes('sanitiz')) {
      findings.push('- **HIGH**: No input validation strategy described');
    }

    return findings.length > 0
      ? findings.join('\n')
      : 'Architecture appears to address key security concerns.';
  }

  private analyzeApiSecurity(apiContent: string): string {
    const findings: string[] = [];
    const lower = apiContent.toLowerCase();

    if (!lower.includes('bearer') && !lower.includes('api-key') && !lower.includes('oauth')) {
      findings.push('- **HIGH**: No authentication mechanism defined for API endpoints');
    }
    if (!lower.includes('rate') && !lower.includes('throttle')) {
      findings.push('- **MEDIUM**: No rate limiting specified for API');
    }
    if (!lower.includes('validation') && !lower.includes('schema')) {
      findings.push('- **HIGH**: No request validation or schema enforcement specified');
    }
    if (!lower.includes('error') || lower.includes('stack trace')) {
      findings.push('- **MEDIUM**: Verify error responses do not leak implementation details');
    }

    return findings.length > 0
      ? findings.join('\n')
      : 'API specification addresses basic security concerns.';
  }

  private analyzeCodeSecurity(code: string): string {
    const findings: string[] = [];

    const patterns = [
      { pattern: /process\.env\.\w+/, finding: 'Environment variable usage detected — verify no sensitive defaults' },
      { pattern: /\.catch\s*\(\s*\)/, finding: 'Empty catch block — errors may be silently swallowed' },
      { pattern: /Math\.random\(\)/, finding: 'Math.random() is not cryptographically secure — use crypto.randomBytes for security-sensitive operations' },
      { pattern: /http:\/\//, finding: 'HTTP (non-TLS) URL found — ensure all production traffic uses HTTPS' },
      { pattern: /disabled?\s*:\s*true/, finding: 'Security feature appears to be disabled — verify this is intentional' },
    ];

    for (const { pattern, finding } of patterns) {
      if (pattern.test(code)) {
        findings.push(`- ${finding}`);
      }
    }

    return findings.length > 0
      ? findings.join('\n')
      : 'No immediate code-level security concerns identified in static analysis.';
  }

  private analyzeDependencySecurity(sources: Artifact[]): string {
    return 'Recommendation: Run `npm audit` or equivalent dependency scanning tool as part of CI/CD pipeline. Integrate Snyk, Dependabot, or similar SCA tool for continuous monitoring.';
  }

  private generateRecommendations(
    sources: Artifact[],
    archDoc?: Artifact,
    apiSpec?: Artifact,
  ): string {
    const recs: string[] = [
      '1. Implement Content Security Policy (CSP) headers',
      '2. Enable HSTS with a minimum max-age of 31536000',
      '3. Use parameterized queries for all database operations',
      '4. Implement request rate limiting on all public endpoints',
      '5. Add input validation middleware for all API routes',
      '6. Set up automated dependency vulnerability scanning in CI/CD',
      '7. Implement structured security logging with audit trails',
      '8. Configure CORS with explicit allowed origins',
      '9. Implement secrets rotation policy',
      '10. Add security-focused integration tests',
    ];
    return recs.join('\n');
  }

  private parseClaudeOutput(raw: string): ParsedOutput {
    const artifacts: ParsedArtifact[] = [];
    const issues: ParsedIssue[] = [];

    const artifactRegex = /---ARTIFACT_START---([\s\S]*?)---ARTIFACT_END---/g;
    let match: RegExpExecArray | null;
    while ((match = artifactRegex.exec(raw)) !== null) {
      const block = match[1].trim();
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const nameMatch = block.match(/^Name:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*(.+)$/m);
      const contentMatch = block.match(/Content:\s*([\s\S]*)$/m);
      if (typeMatch && nameMatch) {
        artifacts.push({
          type: typeMatch[1].trim(),
          name: nameMatch[1].trim(),
          description: descMatch?.[1]?.trim() ?? '',
          content: contentMatch?.[1]?.trim() ?? '',
        });
      }
    }

    const issueRegex = /---ISSUE_START---([\s\S]*?)---ISSUE_END---/g;
    while ((match = issueRegex.exec(raw)) !== null) {
      const block = match[1].trim();
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const sevMatch = block.match(/^Severity:\s*(.+)$/m);
      const titleMatch = block.match(/^Title:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*([\s\S]*)$/m);
      if (typeMatch && titleMatch) {
        issues.push({
          type: typeMatch[1].trim(),
          severity: sevMatch?.[1]?.trim() ?? 'medium',
          title: titleMatch[1].trim(),
          description: descMatch?.[1]?.trim() ?? '',
        });
      }
    }

    const summaryMatch = raw.match(/### Summary\s*([\s\S]*?)(?=###|---ARTIFACT_START|$)/);
    const recsMatch = raw.match(/### Recommendations\s*([\s\S]*?)$/);

    return {
      summary: summaryMatch?.[1]?.trim() ?? '',
      artifacts,
      issues,
      recommendations: recsMatch?.[1]?.trim() ?? '',
    };
  }

  private resolveArtifactType(typeStr: string): ArtifactType | null {
    const normalized = typeStr.toLowerCase().replace(/[\s_-]+/g, '_');
    const mapping: Record<string, ArtifactType> = {
      security_report: ArtifactType.SECURITY_REPORT,
    };
    return mapping[normalized] ?? null;
  }

  private resolveIssueSeverity(sevStr: string): IssueSeverity {
    const mapping: Record<string, IssueSeverity> = {
      critical: IssueSeverity.CRITICAL,
      high: IssueSeverity.HIGH,
      medium: IssueSeverity.MEDIUM,
      low: IssueSeverity.LOW,
      info: IssueSeverity.INFO,
    };
    return mapping[sevStr.toLowerCase()] ?? IssueSeverity.MEDIUM;
  }
}
