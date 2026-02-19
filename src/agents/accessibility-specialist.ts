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

const ACCESSIBILITY_SPECIALIST_SYSTEM_PROMPT = `Accessibility Specialist. Audits and ensures WCAG 2.1/2.2 Level AA compliance.

Perceivable: meaningful alt on all images (alt="" for decorative), captions on video (speaker ID+sound cues), audio descriptions, semantic HTML (h1-h6 order, lists, th+scope, landmark regions), color not sole conveyor of info, 4.5:1 text contrast / 3:1 large text, text resizable to 200%, content reflows at 400% zoom, autocomplete attributes on personal data inputs, tooltips dismissible+hoverable+persistent.
Operable: all functionality keyboard-operable (no traps, Tab/Shift-Tab/Escape), visible focus indicators (2px outline, 3:1 contrast, never outline:none without replacement), skip links, no 3+ flashes/sec, timing adjustable (10×), descriptive link text, unique page titles, logical focus order (no positive tabindex), focus not obscured by sticky headers, touch targets ≥24×24px (44×44 recommended).
Understandable: lang on <html>, consistent nav+identification, error identification in text (not color only), visible labels (placeholder not a label, use for/id or wrapping), error suggestions, confirmation for legal/financial submissions.
Robust: valid HTML, ARIA only when semantic HTML insufficient, all custom components expose name+role+state, status messages via aria-live without focus.
ARIA patterns: modal (role=dialog, aria-modal, focus trap), tabs (tablist/tab/tabpanel, aria-selected, arrow keys), combobox (aria-expanded, aria-activedescendant), live regions (polite for updates, assertive for critical alerts).
Testing: automated (axe-core in CI, Lighthouse ≥90, zero critical violations) + manual (keyboard-only workflows, screen reader NVDA/JAWS/VoiceOver, 200%+400% zoom, high contrast, prefers-reduced-motion).
Output per finding: WCAG criterion (number+name+level) + affected users + pass/fail + code location + before/after remediation code + priority (critical/major/minor/enhancement). Produce Accessibility Report and Test Suite.`;

export const ACCESSIBILITY_SPECIALIST_CONFIG: AgentConfig = {
  role: AgentRole.ACCESSIBILITY_SPECIALIST,
  name: 'accessibility-specialist',
  title: 'Accessibility Specialist',
  description: 'Ensures WCAG 2.1/2.2 compliance, conducts accessibility audits, designs inclusive user experiences, and creates accessibility test suites',
  systemPrompt: ACCESSIBILITY_SPECIALIST_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'a11y_audit',
      description: 'Conducts WCAG 2.1/2.2 accessibility audits of UI components and pages',
      allowedTools: ['Read', 'Grep', 'Glob'],
      filePatterns: ['src/**/*.tsx', 'src/**/*.jsx', 'src/**/*.html', '**/*.css'],
    },
    {
      name: 'a11y_testing',
      description: 'Creates and maintains accessibility test suites and configurations',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/tests/a11y/**'],
    },
    {
      name: 'remediation_planning',
      description: 'Creates prioritized remediation plans with code examples for accessibility fixes',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/accessibility/**'],
    },
  ],
  maxTokenBudget: 20000,
  allowedFilePatterns: ['src/**', 'tests/**', '**/*.css', '**/*.html'],
  blockedFilePatterns: ['**/*.key', '**/*.pem'],
  reportsTo: AgentRole.UI_DESIGNER,
  directReports: [],
  requiredInputArtifacts: [
    ArtifactType.UI_SPEC,
    ArtifactType.SOURCE_CODE,
  ],
  outputArtifacts: [ArtifactType.ACCESSIBILITY_REPORT, ArtifactType.ACCESSIBILITY_TEST_SUITE],
};

export default class AccessibilitySpecialistAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(ACCESSIBILITY_SPECIALIST_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Beginning accessibility audit and test suite generation', task.stage);

    const sections: string[] = [];
    sections.push('# Accessibility Audit Report\n');

    const uiSpec = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.UI_SPEC,
    );
    const sourceArtifacts = task.inputArtifacts.filter(
      (a) => a.type === ArtifactType.SOURCE_CODE,
    );

    sections.push('## Audit Scope\n');
    sections.push(`- UI specification: ${uiSpec ? 'Available' : 'Not provided'}`);
    sections.push(`- Source code artifacts reviewed: ${sourceArtifacts.length}`);
    sections.push('- Standard: WCAG 2.1/2.2 Level AA');

    sections.push('\n## WCAG Compliance Results\n');

    sections.push('### Principle 1: Perceivable\n');
    sections.push(this.auditPerceivable(sourceArtifacts, uiSpec));

    sections.push('\n### Principle 2: Operable\n');
    sections.push(this.auditOperable(sourceArtifacts, uiSpec));

    sections.push('\n### Principle 3: Understandable\n');
    sections.push(this.auditUnderstandable(sourceArtifacts, uiSpec));

    sections.push('\n### Principle 4: Robust\n');
    sections.push(this.auditRobust(sourceArtifacts));

    sections.push('\n## Remediation Plan\n');
    sections.push(this.generateRemediationPlan(sourceArtifacts));

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: accessibility_test_suite');
    sections.push('Name: Accessibility Test Suite');
    sections.push('Description: Automated and manual accessibility test configuration including axe-core setup and manual test checklist');
    sections.push('Content:');
    sections.push(this.generateTestSuite());
    sections.push('---ARTIFACT_END---\n');

    sections.push('\n## Recommendations Summary\n');
    sections.push(this.generateRecommendations());

    const output = sections.join('\n');

    agentLog(this.role, 'Accessibility audit complete', task.stage);
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
            `.cdm/accessibility/${pa.name.toLowerCase().replace(/\s+/g, '-')}.md`,
          );
          this.artifactStore.store(artifact);
          artifacts.push(artifact);
        }
      }
    }

    if (!artifacts.some((a) => a.type === ArtifactType.ACCESSIBILITY_REPORT)) {
      const report = this.createArtifact(
        ArtifactType.ACCESSIBILITY_REPORT,
        'Accessibility Audit Report',
        'Comprehensive WCAG 2.1/2.2 Level AA accessibility audit with per-criteria results',
        output,
        '.cdm/accessibility/accessibility-audit-report.md',
      );
      this.artifactStore.store(report);
      artifacts.push(report);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.ACCESSIBILITY_TEST_SUITE)) {
      const testSuite = this.createArtifact(
        ArtifactType.ACCESSIBILITY_TEST_SUITE,
        'Accessibility Test Suite',
        'Automated axe-core configuration and manual accessibility test checklist',
        this.generateTestSuite(),
        '.cdm/accessibility/accessibility-test-suite.md',
      );
      this.artifactStore.store(testSuite);
      artifacts.push(testSuite);
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
          IssueType.ACCESSIBILITY_VIOLATION,
          severity,
          pi.title,
          pi.description,
          task.stage,
        ),
      );
    }

    for (const source of task.inputArtifacts.filter((a) => a.type === ArtifactType.SOURCE_CODE)) {
      const content = source.content;
      const lower = content.toLowerCase();

      if (/<img\s[^>]*(?!alt=)[^>]*>/i.test(content) || /<img\s[^>]*alt\s*=\s*(?!["'])/i.test(content)) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ACCESSIBILITY_VIOLATION, IssueSeverity.CRITICAL,
          'Missing alt text on images',
          `Images without alt attributes detected in ${source.name}. WCAG 1.1.1 (Level A) requires text alternatives for all non-text content. Add descriptive alt text or alt="" for decorative images.`,
          task.stage,
        ));
      }

      if (
        (lower.includes('role="button"') || lower.includes('role="link"') || lower.includes('role="tab"')) &&
        !lower.includes('aria-label')
      ) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ACCESSIBILITY_VIOLATION, IssueSeverity.HIGH,
          'ARIA roles without accessible labels',
          `Custom ARIA role elements found in ${source.name} without corresponding aria-label or aria-labelledby. WCAG 4.1.2 (Level A) requires all interactive elements to have accessible names.`,
          task.stage,
        ));
      }

      if (
        lower.includes('color:') &&
        !lower.includes('contrast') &&
        !lower.includes('4.5') &&
        !lower.includes('accessible')
      ) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ACCESSIBILITY_VIOLATION, IssueSeverity.HIGH,
          'Potential insufficient color contrast',
          `Color declarations found in ${source.name} without documented contrast verification. WCAG 1.4.3 (Level AA) requires 4.5:1 minimum contrast for normal text and 3:1 for large text. Verify all color combinations meet minimum ratios.`,
          task.stage,
        ));
      }

      if (
        !lower.includes('skip') &&
        !lower.includes('bypass') &&
        (lower.includes('<nav') || lower.includes('role="navigation"'))
      ) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ACCESSIBILITY_VIOLATION, IssueSeverity.MEDIUM,
          'No skip navigation mechanism',
          `Navigation elements found in ${source.name} without skip navigation links. WCAG 2.4.1 (Level A) requires mechanisms to bypass blocks of content repeated across pages.`,
          task.stage,
        ));
      }

      if (
        (lower.includes('<input') || lower.includes('<select') || lower.includes('<textarea')) &&
        !lower.includes('<label') && !lower.includes('aria-label') && !lower.includes('aria-labelledby')
      ) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ACCESSIBILITY_VIOLATION, IssueSeverity.CRITICAL,
          'Missing form labels',
          `Form controls found in ${source.name} without associated labels. WCAG 3.3.2 (Level A) and 1.3.1 (Level A) require all form inputs to have programmatically associated labels. Use <label for="id"> or aria-label/aria-labelledby.`,
          task.stage,
        ));
      }

      if (
        (lower.includes('onclick') || lower.includes('onkeydown') || lower.includes('onkeyup')) &&
        lower.includes('<div') &&
        !lower.includes('tabindex') && !lower.includes('role="button"')
      ) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ACCESSIBILITY_VIOLATION, IssueSeverity.HIGH,
          'No keyboard handling for interactive elements',
          `Click handlers on non-interactive elements (div, span) in ${source.name} without keyboard support. WCAG 2.1.1 (Level A) requires all functionality to be operable via keyboard. Use <button> or add role="button", tabindex="0", and keyboard event handlers.`,
          task.stage,
        ));
      }
    }

    return issues;
  }

  private auditPerceivable(sources: Artifact[], uiSpec?: Artifact): string {
    const findings: string[] = [];

    for (const source of sources) {
      const lower = source.content.toLowerCase();

      if (lower.includes('<img') && !lower.includes('alt=')) {
        findings.push(`- **FAIL** 1.1.1 Non-text Content: Images without alt attributes in ${source.name}`);
      }
      if (lower.includes('<video') && !lower.includes('track') && !lower.includes('caption')) {
        findings.push(`- **FAIL** 1.2.2 Captions: Video elements without caption tracks in ${source.name}`);
      }
      if (!lower.includes('<h1') && !lower.includes('<h2') && lower.includes('<div')) {
        findings.push(`- **FAIL** 1.3.1 Info and Relationships: Content uses divs without semantic heading structure in ${source.name}`);
      }
      if (lower.includes('outline: none') || lower.includes('outline:none') || lower.includes('outline: 0')) {
        findings.push(`- **FAIL** 1.4.11 Non-text Contrast: Focus outline removed without visible replacement in ${source.name}`);
      }
    }

    return findings.length > 0
      ? findings.join('\n')
      : 'Perceivable criteria appear to be met based on static analysis. Manual verification recommended.';
  }

  private auditOperable(sources: Artifact[], uiSpec?: Artifact): string {
    const findings: string[] = [];

    for (const source of sources) {
      const lower = source.content.toLowerCase();

      if (lower.includes('onclick') && !lower.includes('onkeydown') && !lower.includes('onkeypress') && !lower.includes('onkeyup')) {
        findings.push(`- **FAIL** 2.1.1 Keyboard: Click handlers without keyboard equivalents in ${source.name}`);
      }
      if (lower.includes('tabindex') && /tabindex\s*=\s*["'][1-9]/.test(source.content)) {
        findings.push(`- **FAIL** 2.4.3 Focus Order: Positive tabindex values found in ${source.name} — use tabindex="0" instead`);
      }
      if (lower.includes('autofocus')) {
        findings.push(`- **REVIEW** 2.4.3 Focus Order: autofocus attribute used in ${source.name} — verify it does not cause unexpected context changes`);
      }
      if ((lower.includes('>click here<') || lower.includes('>read more<') || lower.includes('>learn more<'))) {
        findings.push(`- **FAIL** 2.4.4 Link Purpose: Non-descriptive link text found in ${source.name}`);
      }
    }

    return findings.length > 0
      ? findings.join('\n')
      : 'Operable criteria appear to be met based on static analysis. Keyboard testing recommended.';
  }

  private auditUnderstandable(sources: Artifact[], uiSpec?: Artifact): string {
    const findings: string[] = [];

    for (const source of sources) {
      const lower = source.content.toLowerCase();

      if (lower.includes('<html') && !lower.includes('lang=')) {
        findings.push(`- **FAIL** 3.1.1 Language of Page: Missing lang attribute on html element in ${source.name}`);
      }
      if (lower.includes('placeholder=') && !lower.includes('<label')) {
        findings.push(`- **FAIL** 3.3.2 Labels: Placeholder used as only label for form inputs in ${source.name}`);
      }
      if (lower.includes('required') && !lower.includes('aria-required') && !lower.includes('error')) {
        findings.push(`- **REVIEW** 3.3.1 Error Identification: Required fields may lack accessible error identification in ${source.name}`);
      }
    }

    return findings.length > 0
      ? findings.join('\n')
      : 'Understandable criteria appear to be met based on static analysis.';
  }

  private auditRobust(sources: Artifact[]): string {
    const findings: string[] = [];

    for (const source of sources) {
      const lower = source.content.toLowerCase();

      if (lower.includes('role=') && lower.includes('aria-') && !lower.includes('aria-label') && !lower.includes('aria-labelledby')) {
        findings.push(`- **FAIL** 4.1.2 Name, Role, Value: ARIA roles without accessible names in ${source.name}`);
      }
      if ((lower.includes('toast') || lower.includes('notification') || lower.includes('snackbar')) && !lower.includes('aria-live') && !lower.includes('role="alert"') && !lower.includes('role="status"')) {
        findings.push(`- **FAIL** 4.1.3 Status Messages: Dynamic notifications without live region announcements in ${source.name}`);
      }
    }

    return findings.length > 0
      ? findings.join('\n')
      : 'Robust criteria appear to be met based on static analysis.';
  }

  private generateRemediationPlan(sources: Artifact[]): string {
    const plan: string[] = [
      '### Priority 1: Critical (Prevents Access)',
      '1. Add alt text to all images — impacts blind and low-vision users',
      '2. Add labels to all form controls — impacts screen reader users',
      '3. Ensure all interactive elements are keyboard accessible',
      '',
      '### Priority 2: Major (Significant Barrier)',
      '4. Verify and fix color contrast ratios to meet 4.5:1 minimum',
      '5. Add ARIA labels to custom interactive components',
      '6. Implement visible focus indicators on all interactive elements',
      '7. Add skip navigation link as first focusable element',
      '',
      '### Priority 3: Minor (Inconvenience)',
      '8. Add lang attribute to html element and any foreign language content',
      '9. Improve link text to be descriptive and unique',
      '10. Add aria-live regions for dynamic content updates',
      '',
      '### Priority 4: Enhancement (Beyond AA)',
      '11. Add prefers-reduced-motion support for all animations',
      '12. Implement prefers-color-scheme for dark mode accessibility',
      '13. Increase touch targets to 44×44px minimum',
    ];
    return plan.join('\n');
  }

  private generateTestSuite(): string {
    const suite: string[] = [];
    suite.push('# Accessibility Test Suite\n');

    suite.push('## 1. Automated Testing Configuration (axe-core)\n');
    suite.push('```javascript');
    suite.push('// axe-core configuration');
    suite.push('const axeConfig = {');
    suite.push('  rules: {');
    suite.push("    'color-contrast': { enabled: true },");
    suite.push("    'image-alt': { enabled: true },");
    suite.push("    'label': { enabled: true },");
    suite.push("    'link-name': { enabled: true },");
    suite.push("    'button-name': { enabled: true },");
    suite.push("    'html-has-lang': { enabled: true },");
    suite.push("    'landmark-one-main': { enabled: true },");
    suite.push("    'page-has-heading-one': { enabled: true },");
    suite.push("    'bypass': { enabled: true },");
    suite.push("    'aria-allowed-attr': { enabled: true },");
    suite.push("    'aria-required-attr': { enabled: true },");
    suite.push("    'aria-valid-attr-value': { enabled: true },");
    suite.push("    'focus-order-semantics': { enabled: true },");
    suite.push('  },');
    suite.push("  tags: ['wcag2a', 'wcag2aa', 'wcag21aa'],");
    suite.push('  resultTypes: [');
    suite.push("    'violations',");
    suite.push("    'incomplete',");
    suite.push('  ],');
    suite.push('};');
    suite.push('```\n');

    suite.push('## 2. Manual Test Checklist\n');
    suite.push('| # | Test | Method | Pass/Fail |');
    suite.push('|---|------|--------|-----------|');
    suite.push('| 1 | Complete all workflows using keyboard only | Tab, Enter, Space, Arrow keys, Escape | |');
    suite.push('| 2 | Verify all images have meaningful alt text | Screen reader + visual inspection | |');
    suite.push('| 3 | Verify form labels are programmatically associated | Screen reader testing | |');
    suite.push('| 4 | Check color contrast ratios (4.5:1 text, 3:1 UI) | Colour Contrast Analyser | |');
    suite.push('| 5 | Test at 200% text zoom — no content loss | Browser zoom | |');
    suite.push('| 6 | Test at 400% page zoom — no horizontal scroll | Browser zoom (320px viewport) | |');
    suite.push('| 7 | Verify skip navigation link works | Keyboard navigation | |');
    suite.push('| 8 | Test focus visibility on all interactive elements | Keyboard navigation | |');
    suite.push('| 9 | Verify error messages are announced by screen reader | NVDA/JAWS/VoiceOver | |');
    suite.push('| 10 | Check heading hierarchy (h1→h2→h3, no skips) | HeadingsMap browser extension | |');
    suite.push('| 11 | Test in Windows High Contrast Mode | Windows accessibility settings | |');
    suite.push('| 12 | Verify prefers-reduced-motion is respected | OS accessibility settings | |');
    suite.push('| 13 | Test touch targets are ≥44×44px on mobile | Device testing or DevTools | |');
    suite.push('| 14 | Verify aria-live regions announce updates | Screen reader testing | |');
    suite.push('| 15 | Test modal focus trap and return focus | Keyboard + screen reader | |');

    return suite.join('\n');
  }

  private generateRecommendations(): string {
    const recs: string[] = [
      '1. Integrate axe-core into CI/CD pipeline — fail builds on critical violations',
      '2. Require Lighthouse accessibility score ≥ 90 for all pages',
      '3. Add accessibility linting (eslint-plugin-jsx-a11y) to development workflow',
      '4. Conduct quarterly manual accessibility audits with assistive technology users',
      '5. Train development team on WCAG 2.1/2.2 fundamentals',
      '6. Establish accessibility acceptance criteria for every user story',
      '7. Create a component library with pre-built accessible patterns (modals, tabs, menus)',
      '8. Implement automated regression testing for keyboard navigation flows',
      '9. Add prefers-reduced-motion and prefers-color-scheme media query support globally',
      '10. Document accessibility patterns and anti-patterns in team style guide',
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
      accessibility_report: ArtifactType.ACCESSIBILITY_REPORT,
      accessibility_test_suite: ArtifactType.ACCESSIBILITY_TEST_SUITE,
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
