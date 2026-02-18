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

const COMPLIANCE_OFFICER_SYSTEM_PROMPT = `You are a Chief Compliance Officer with 15+ years of experience across highly
regulated industries including healthcare, financial services, and government contracting.
You hold CIPP/US, CIPP/E, CISA, and CRISC certifications and have led compliance programs
through multiple successful regulatory audits.

## GDPR Compliance

### Lawful Basis for Processing
- Verify that every data processing activity has a documented lawful basis (consent,
  contract, legal obligation, vital interests, public task, or legitimate interests).
- Consent must be freely given, specific, informed, and unambiguous. Pre-ticked boxes
  and bundled consent are non-compliant.
- Legitimate interest assessments (LIA) must be documented with balancing tests.

### Data Subject Rights Implementation
- Right to access (Article 15): Verify mechanism for data export within 30 days.
- Right to rectification (Article 16): Ability to correct inaccurate personal data.
- Right to erasure (Article 17): "Right to be forgotten" with cascading deletion across
  all systems, backups, and third-party processors.
- Right to restriction of processing (Article 18): Ability to halt processing while
  maintaining storage.
- Right to data portability (Article 20): Machine-readable export format (JSON, CSV).
- Right to object (Article 21): Opt-out mechanism for profiling and direct marketing.
- Automated decision-making (Article 22): Human review option for significant decisions.

### Data Protection Officer (DPO)
- Verify DPO appointment requirement based on processing activities.
- DPO independence and reporting structure. DPO must report to highest management level.
- DPO contact information publicly accessible.

### Cross-Border Data Transfers
- Standard Contractual Clauses (SCCs) for transfers outside EEA.
- Transfer Impact Assessments (TIAs) for each destination country.
- Binding Corporate Rules (BCRs) for intra-group transfers.
- Adequacy decisions and their current status.
- Schrems II compliance: supplementary measures where required.

## HIPAA Compliance

### Protected Health Information (PHI)
- Identify all PHI data elements (18 identifiers under Safe Harbor).
- PHI at rest must use AES-256 encryption or equivalent.
- PHI in transit must use TLS 1.2+ with strong cipher suites.
- Access to PHI must follow minimum necessary rule — only data needed for the task.
- PHI in logs must be redacted or pseudonymized.

### Business Associate Agreements (BAA)
- Every third party handling PHI must have a signed BAA.
- BAAs must specify permitted uses, safeguards, breach notification obligations,
  and subcontractor requirements.
- Annual BAA review and renewal process.

### Administrative, Physical, and Technical Safeguards
- Risk analysis and risk management (§164.308(a)(1)).
- Workforce training on PHI handling (§164.308(a)(5)).
- Access controls: unique user identification, emergency access, automatic logoff,
  encryption and decryption (§164.312(a)).
- Audit controls: hardware, software, and procedural mechanisms (§164.312(b)).
- Integrity controls: mechanisms to authenticate ePHI (§164.312(c)).
- Transmission security: integrity controls and encryption (§164.312(e)).

## SOC 2 Trust Service Criteria

### Security (Common Criteria)
- CC1: Control environment — management commitment, board oversight.
- CC2: Communication and information — internal and external communication of policies.
- CC3: Risk assessment — identification and analysis of risks.
- CC4: Monitoring activities — ongoing and separate evaluations.
- CC5: Control activities — policies and procedures, technology controls.
- CC6: Logical and physical access — authentication, authorization, physical security.
- CC7: System operations — incident detection, response, and recovery.
- CC8: Change management — change authorization, testing, approval.
- CC9: Risk mitigation — vendor management, business continuity.

### Availability
- System uptime commitments and SLA compliance.
- Disaster recovery and business continuity plans.
- Capacity planning and performance monitoring.

### Processing Integrity
- Data processing accuracy, completeness, and timeliness.
- Input validation and output reconciliation.
- Error handling and exception reporting.

### Confidentiality
- Data classification schemes and handling procedures.
- Encryption requirements by data classification level.
- Data destruction and sanitization procedures.

### Privacy
- Notice and consent practices.
- Choice and consent mechanisms.
- Collection limitation and data minimization.
- Use, retention, and disposal policies.

## PCI-DSS Compliance

- Requirement 1: Install and maintain network security controls.
- Requirement 2: Apply secure configurations to all system components.
- Requirement 3: Protect stored cardholder data (PAN masking, encryption, key management).
- Requirement 4: Protect cardholder data with strong cryptography during transmission.
- Requirement 5: Protect all systems against malware.
- Requirement 6: Develop and maintain secure systems and software (SDLC requirements).
- Requirement 7: Restrict access to system components by business need to know.
- Requirement 8: Identify users and authenticate access (MFA for admin access).
- Requirement 9: Restrict physical access to cardholder data.
- Requirement 10: Log and monitor all access to system components and cardholder data.
- Requirement 11: Test security of systems and networks regularly.
- Requirement 12: Support information security with organizational policies and programs.

## CCPA/CPRA Compliance

- Consumer right to know: categories and specific pieces of personal information collected.
- Consumer right to delete: deletion across all systems with verification.
- Consumer right to opt-out of sale/sharing of personal information.
- Consumer right to non-discrimination for exercising rights.
- Consumer right to correct inaccurate personal information (CPRA).
- Consumer right to limit use of sensitive personal information (CPRA).
- Privacy policy requirements: categories collected, purposes, third parties, rights.
- "Do Not Sell or Share My Personal Information" link requirement.
- Service provider and contractor agreements with data processing restrictions.
- Data minimization and purpose limitation principles (CPRA).

## Data Governance

### Data Retention and Destruction
- Retention schedules by data category and regulatory requirement.
- Automated enforcement of retention policies.
- Secure destruction methods (cryptographic erasure, media sanitization).
- Retention hold procedures for litigation and regulatory holds.

### Audit Trail Requirements
- Immutable audit logs for all data access and modifications.
- Minimum retention period for audit logs (varies by regulation).
- Log integrity verification (hashing, write-once storage).
- Regular audit log review and anomaly detection.

### Breach Notification
- GDPR: 72-hour notification to supervisory authority, undue delay to data subjects.
- HIPAA: 60-day notification to HHS, individuals, and media (500+ records).
- State laws: varying timelines (24 hours to 90 days depending on jurisdiction).
- Breach assessment criteria: risk of harm analysis, encryption safe harbor.
- Incident response plan with defined roles, communication templates, and escalation paths.

### Privacy by Design
- Data minimization at collection point.
- Purpose limitation enforcement in processing logic.
- Privacy-enhancing technologies (anonymization, pseudonymization, differential privacy).
- Default privacy settings (privacy by default).
- End-to-end security across the data lifecycle.

### Vendor Compliance and Third-Party Risk
- Vendor security questionnaires and assessment frameworks (SIG, CAIQ).
- Ongoing monitoring of vendor compliance posture.
- Right to audit clauses in vendor contracts.
- Data processing agreements (DPAs) with all processors.
- Sub-processor notification and approval workflows.

## Output Requirements

For each compliance finding, provide:
1. Regulation and specific section/article reference
2. Current compliance status (Compliant / Non-Compliant / Partially Compliant / Not Applicable)
3. Gap description and risk assessment
4. Remediation steps with priority and timeline
5. Evidence requirements for demonstrating compliance

Always produce a comprehensive Compliance Report and Privacy Impact Assessment.`;

export const COMPLIANCE_OFFICER_CONFIG: AgentConfig = {
  role: AgentRole.COMPLIANCE_OFFICER,
  name: 'compliance-officer',
  title: 'Compliance Officer',
  description: 'Ensures regulatory compliance (GDPR, HIPAA, SOC2, PCI-DSS, CCPA), conducts privacy impact assessments, defines data handling policies, and audits for compliance violations',
  systemPrompt: COMPLIANCE_OFFICER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'regulatory_audit',
      description: 'Audits codebase and documentation for regulatory compliance gaps',
      allowedTools: ['Read', 'Grep', 'Glob'],
      filePatterns: ['**/*'],
    },
    {
      name: 'privacy_assessment',
      description: 'Conducts privacy impact assessments on data flows and processing activities',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/compliance/**', '**/privacy/**'],
    },
    {
      name: 'policy_writing',
      description: 'Creates and maintains compliance and data handling policies',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/policies/**'],
    },
  ],
  maxTokenBudget: 25000,
  allowedFilePatterns: ['docs/**', '**/*.md', 'src/**'],
  blockedFilePatterns: ['**/*.key', '**/*.pem', '**/.env'],
  reportsTo: AgentRole.SECURITY_ENGINEER,
  directReports: [],
  requiredInputArtifacts: [
    ArtifactType.REQUIREMENTS_DOC,
    ArtifactType.ARCHITECTURE_DOC,
    ArtifactType.SECURITY_REPORT,
  ],
  outputArtifacts: [ArtifactType.COMPLIANCE_REPORT, ArtifactType.PRIVACY_IMPACT_ASSESSMENT],
};

export default class ComplianceOfficerAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(COMPLIANCE_OFFICER_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Beginning compliance audit and privacy impact assessment', task.stage);

    const sections: string[] = [];
    sections.push('# Compliance Audit Report\n');

    const requirementsDoc = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.REQUIREMENTS_DOC,
    );
    const archDoc = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.ARCHITECTURE_DOC,
    );
    const securityReport = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.SECURITY_REPORT,
    );

    sections.push('## Audit Scope\n');
    sections.push(`- Requirements document: ${requirementsDoc ? 'Available' : 'Not provided'}`);
    sections.push(`- Architecture document: ${archDoc ? 'Available' : 'Not provided'}`);
    sections.push(`- Security report: ${securityReport ? 'Available' : 'Not provided'}`);

    sections.push('\n## Regulatory Compliance Checklist\n');

    sections.push('### GDPR Compliance\n');
    sections.push(this.assessGdprCompliance(requirementsDoc, archDoc));

    sections.push('\n### HIPAA Compliance\n');
    sections.push(this.assessHipaaCompliance(requirementsDoc, archDoc));

    sections.push('\n### SOC 2 Compliance\n');
    sections.push(this.assessSoc2Compliance(archDoc, securityReport));

    sections.push('\n### PCI-DSS Compliance\n');
    sections.push(this.assessPciDssCompliance(archDoc, securityReport));

    sections.push('\n### CCPA/CPRA Compliance\n');
    sections.push(this.assessCcpaCompliance(requirementsDoc, archDoc));

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: privacy_impact_assessment');
    sections.push('Name: Privacy Impact Assessment');
    sections.push('Description: Assessment of data flows, privacy risks, and recommended mitigations');
    sections.push('Content:');
    sections.push(this.generatePrivacyImpactAssessment(requirementsDoc, archDoc));
    sections.push('---ARTIFACT_END---\n');

    sections.push('\n## Data Handling Policy\n');
    sections.push(this.generateDataHandlingPolicy(requirementsDoc, archDoc));

    sections.push('\n## Compliance Recommendations Summary\n');
    sections.push(this.generateRecommendations());

    const output = sections.join('\n');

    agentLog(this.role, 'Compliance audit complete', task.stage);
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
            `.cdm/compliance/${pa.name.toLowerCase().replace(/\s+/g, '-')}.md`,
          );
          this.artifactStore.store(artifact);
          artifacts.push(artifact);
        }
      }
    }

    if (!artifacts.some((a) => a.type === ArtifactType.COMPLIANCE_REPORT)) {
      const report = this.createArtifact(
        ArtifactType.COMPLIANCE_REPORT,
        'Compliance Audit Report',
        'Comprehensive regulatory compliance audit covering GDPR, HIPAA, SOC 2, PCI-DSS, and CCPA',
        output,
        '.cdm/compliance/compliance-audit-report.md',
      );
      this.artifactStore.store(report);
      artifacts.push(report);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.PRIVACY_IMPACT_ASSESSMENT)) {
      const pia = this.createArtifact(
        ArtifactType.PRIVACY_IMPACT_ASSESSMENT,
        'Privacy Impact Assessment',
        'Assessment of data flows, privacy risks, and mitigations across the system',
        output,
        '.cdm/compliance/privacy-impact-assessment.md',
      );
      this.artifactStore.store(pia);
      artifacts.push(pia);
    }

    return artifacts;
  }

  protected async identifyIssues(task: AgentTask, output: string): Promise<Issue[]> {
    const parsed = this.parseClaudeOutput(output);
    const issues: Issue[] = [];

    for (const pi of parsed.issues) {
      const severity = this.resolveIssueSeverity(pi.severity);
      const issueType = pi.type.toLowerCase().includes('privacy')
        ? IssueType.DATA_PRIVACY_CONCERN
        : IssueType.COMPLIANCE_VIOLATION;
      issues.push(
        this.createIssue(
          task.featureId,
          issueType,
          severity,
          pi.title,
          pi.description,
          task.stage,
        ),
      );
    }

    for (const artifact of task.inputArtifacts) {
      const content = artifact.content.toLowerCase();

      if (
        (content.includes('email') || content.includes('name') || content.includes('address') || content.includes('phone')) &&
        !content.includes('encrypt')
      ) {
        issues.push(this.createIssue(
          task.featureId, IssueType.DATA_PRIVACY_CONCERN, IssueSeverity.HIGH,
          'PII stored without encryption',
          `Personally identifiable information referenced in ${artifact.name} without mention of encryption. All PII must be encrypted at rest and in transit per GDPR Article 32 and HIPAA §164.312.`,
          task.stage,
        ));
      }

      if (
        (content.includes('personal data') || content.includes('user data') || content.includes('pii')) &&
        !content.includes('consent') && !content.includes('opt-in')
      ) {
        issues.push(this.createIssue(
          task.featureId, IssueType.COMPLIANCE_VIOLATION, IssueSeverity.HIGH,
          'Missing consent mechanisms for personal data processing',
          `Personal data processing described in ${artifact.name} without consent management. GDPR Article 6-7 requires documented lawful basis and consent mechanisms.`,
          task.stage,
        ));
      }

      if (!content.includes('retention') && !content.includes('deletion') && !content.includes('data lifecycle')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.COMPLIANCE_VIOLATION, IssueSeverity.MEDIUM,
          'No data retention policy defined',
          `No data retention or deletion policy found in ${artifact.name}. GDPR Article 5(1)(e) requires storage limitation. Define retention periods for each data category.`,
          task.stage,
        ));
      }

      if (!content.includes('audit log') && !content.includes('audit trail') && !content.includes('logging')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.COMPLIANCE_VIOLATION, IssueSeverity.MEDIUM,
          'Missing audit logging requirements',
          `No audit logging described in ${artifact.name}. SOC 2 CC7 and HIPAA §164.312(b) require audit controls for all data access and modifications.`,
          task.stage,
        ));
      }

      if (
        (content.includes('third-party') || content.includes('cloud') || content.includes('external')) &&
        (content.includes('data') || content.includes('transfer'))
      ) {
        if (!content.includes('dpa') && !content.includes('data processing agreement') && !content.includes('scc')) {
          issues.push(this.createIssue(
            task.featureId, IssueType.DATA_PRIVACY_CONCERN, IssueSeverity.HIGH,
            'Cross-border data transfer risks without safeguards',
            `Third-party or cross-border data transfers referenced in ${artifact.name} without mention of DPAs, SCCs, or adequacy decisions. GDPR Chapter V requires appropriate safeguards for international transfers.`,
            task.stage,
          ));
        }
      }
    }

    return issues;
  }

  private assessGdprCompliance(requirementsDoc?: Artifact, archDoc?: Artifact): string {
    const findings: string[] = [];
    const content = [requirementsDoc?.content, archDoc?.content].filter(Boolean).join(' ').toLowerCase();

    if (!content.includes('consent')) {
      findings.push('- **NON-COMPLIANT** (Art. 6-7): No consent management mechanism described');
    }
    if (!content.includes('data subject') && !content.includes('right to access') && !content.includes('right to erasure')) {
      findings.push('- **NON-COMPLIANT** (Art. 15-22): No data subject rights implementation described');
    }
    if (!content.includes('dpo') && !content.includes('data protection officer')) {
      findings.push('- **REVIEW NEEDED** (Art. 37-39): DPO appointment requirement not assessed');
    }
    if (!content.includes('cross-border') && !content.includes('international transfer') && !content.includes('scc')) {
      findings.push('- **REVIEW NEEDED** (Chapter V): Cross-border transfer safeguards not documented');
    }
    if (!content.includes('privacy by design') && !content.includes('data minimization')) {
      findings.push('- **NON-COMPLIANT** (Art. 25): Privacy by design and default not implemented');
    }

    return findings.length > 0
      ? findings.join('\n')
      : 'GDPR requirements appear to be addressed in scope documentation.';
  }

  private assessHipaaCompliance(requirementsDoc?: Artifact, archDoc?: Artifact): string {
    const findings: string[] = [];
    const content = [requirementsDoc?.content, archDoc?.content].filter(Boolean).join(' ').toLowerCase();

    if (content.includes('health') || content.includes('medical') || content.includes('patient')) {
      if (!content.includes('phi') && !content.includes('protected health information')) {
        findings.push('- **NON-COMPLIANT** (§164.502): Health-related data without PHI classification');
      }
      if (!content.includes('baa') && !content.includes('business associate')) {
        findings.push('- **NON-COMPLIANT** (§164.502(e)): No BAA requirements for third-party PHI handling');
      }
      if (!content.includes('minimum necessary')) {
        findings.push('- **NON-COMPLIANT** (§164.502(b)): Minimum necessary rule not addressed');
      }
    } else {
      findings.push('- **NOT APPLICABLE**: No health data processing identified in current scope');
    }

    return findings.length > 0
      ? findings.join('\n')
      : 'HIPAA requirements appear to be addressed.';
  }

  private assessSoc2Compliance(archDoc?: Artifact, securityReport?: Artifact): string {
    const findings: string[] = [];
    const content = [archDoc?.content, securityReport?.content].filter(Boolean).join(' ').toLowerCase();

    if (!content.includes('access control') && !content.includes('authentication')) {
      findings.push('- **GAP** (CC6): Logical access controls not documented');
    }
    if (!content.includes('incident') && !content.includes('monitoring')) {
      findings.push('- **GAP** (CC7): Incident detection and response not documented');
    }
    if (!content.includes('change management') && !content.includes('change control')) {
      findings.push('- **GAP** (CC8): Change management procedures not defined');
    }
    if (!content.includes('disaster recovery') && !content.includes('business continuity')) {
      findings.push('- **GAP** (Availability): No disaster recovery or BCP documented');
    }
    if (!content.includes('vendor') && !content.includes('third-party risk')) {
      findings.push('- **GAP** (CC9): Vendor risk management not addressed');
    }

    return findings.length > 0
      ? findings.join('\n')
      : 'SOC 2 Trust Service Criteria appear to be addressed.';
  }

  private assessPciDssCompliance(archDoc?: Artifact, securityReport?: Artifact): string {
    const findings: string[] = [];
    const content = [archDoc?.content, securityReport?.content].filter(Boolean).join(' ').toLowerCase();

    if (content.includes('payment') || content.includes('credit card') || content.includes('cardholder')) {
      if (!content.includes('pci') && !content.includes('network segmentation')) {
        findings.push('- **NON-COMPLIANT** (Req 1): Network segmentation for cardholder data not described');
      }
      if (!content.includes('pan') && !content.includes('mask') && !content.includes('truncat')) {
        findings.push('- **NON-COMPLIANT** (Req 3): PAN storage and masking requirements not addressed');
      }
      if (!content.includes('key management') && !content.includes('encryption key')) {
        findings.push('- **NON-COMPLIANT** (Req 3-4): Cryptographic key management not documented');
      }
    } else {
      findings.push('- **NOT APPLICABLE**: No payment card data processing identified in current scope');
    }

    return findings.length > 0
      ? findings.join('\n')
      : 'PCI-DSS requirements appear to be addressed.';
  }

  private assessCcpaCompliance(requirementsDoc?: Artifact, archDoc?: Artifact): string {
    const findings: string[] = [];
    const content = [requirementsDoc?.content, archDoc?.content].filter(Boolean).join(' ').toLowerCase();

    if (!content.includes('opt-out') && !content.includes('do not sell')) {
      findings.push('- **NON-COMPLIANT**: No opt-out mechanism for sale/sharing of personal information');
    }
    if (!content.includes('privacy policy') && !content.includes('privacy notice')) {
      findings.push('- **NON-COMPLIANT**: Privacy policy/notice requirements not addressed');
    }
    if (!content.includes('consumer right') && !content.includes('right to know') && !content.includes('right to delete')) {
      findings.push('- **NON-COMPLIANT**: Consumer rights implementation not described');
    }

    return findings.length > 0
      ? findings.join('\n')
      : 'CCPA/CPRA requirements appear to be addressed.';
  }

  private generatePrivacyImpactAssessment(requirementsDoc?: Artifact, archDoc?: Artifact): string {
    const sections: string[] = [];
    sections.push('# Privacy Impact Assessment\n');
    sections.push('## 1. Data Flow Analysis');
    sections.push('- Identify all personal data collection points');
    sections.push('- Map data flows between system components');
    sections.push('- Document third-party data sharing\n');
    sections.push('## 2. Privacy Risk Assessment');
    sections.push('- Risk: Unauthorized data access — Mitigation: Role-based access control, encryption');
    sections.push('- Risk: Data breach — Mitigation: Encryption at rest/in transit, breach notification procedures');
    sections.push('- Risk: Excessive data collection — Mitigation: Data minimization, purpose limitation');
    sections.push('- Risk: Inadequate retention — Mitigation: Automated retention policies, secure deletion\n');
    sections.push('## 3. Recommended Mitigations');
    sections.push('- Implement data classification framework');
    sections.push('- Deploy consent management platform');
    sections.push('- Establish data subject request workflow');
    sections.push('- Conduct annual privacy training');
    sections.push('- Implement privacy-enhancing technologies (pseudonymization, anonymization)');
    return sections.join('\n');
  }

  private generateDataHandlingPolicy(requirementsDoc?: Artifact, archDoc?: Artifact): string {
    const policies: string[] = [
      '1. **Data Classification**: All data must be classified as Public, Internal, Confidential, or Restricted',
      '2. **Collection Limitation**: Collect only data necessary for the stated purpose',
      '3. **Storage**: Confidential and Restricted data must be encrypted at rest (AES-256)',
      '4. **Transmission**: All data in transit must use TLS 1.2+',
      '5. **Access**: Follow least-privilege principle; access reviews quarterly',
      '6. **Retention**: Follow defined retention schedule; auto-delete after expiry',
      '7. **Disposal**: Cryptographic erasure for digital data; cross-cut shredding for physical media',
      '8. **Breach Response**: Follow incident response plan; notify within regulatory timeframes',
    ];
    return policies.join('\n');
  }

  private generateRecommendations(): string {
    const recs: string[] = [
      '1. Implement a centralized consent management platform',
      '2. Deploy automated data classification and DLP tools',
      '3. Establish a formal data subject request workflow with SLA tracking',
      '4. Conduct Privacy Impact Assessments for all new features processing personal data',
      '5. Implement immutable audit logging for all data access events',
      '6. Define and enforce data retention schedules per data category',
      '7. Establish vendor risk assessment program with annual reviews',
      '8. Conduct annual compliance training for all engineering staff',
      '9. Implement automated compliance monitoring dashboards',
      '10. Establish breach notification procedures with pre-approved communication templates',
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
      compliance_report: ArtifactType.COMPLIANCE_REPORT,
      privacy_impact_assessment: ArtifactType.PRIVACY_IMPACT_ASSESSMENT,
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
