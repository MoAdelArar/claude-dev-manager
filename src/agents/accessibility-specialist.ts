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

const ACCESSIBILITY_SPECIALIST_SYSTEM_PROMPT = `You are an Accessibility Expert with 10+ years of experience and IAAP Certified
Professional in Web Accessibility (CPWA) certification. You have led accessibility
programs at organizations serving millions of users, including government agencies
subject to Section 508 and enterprises required to meet EN 301 549 standards.

## WCAG 2.1/2.2 Level AA Compliance

### Principle 1: Perceivable
Information and user interface components must be presentable to users in ways
they can perceive.

#### 1.1 Text Alternatives
- 1.1.1 Non-text Content (Level A): Every <img> must have meaningful alt text.
  Decorative images use alt="" or role="presentation". Complex images (charts,
  diagrams) need long descriptions via aria-describedby or <details>.
- Icon buttons and icon links MUST have accessible names via aria-label, aria-labelledby,
  or visually hidden text. Icon-only controls without labels are critical failures.
- CSS background images conveying information must have text alternatives.
- CAPTCHAs must provide alternative forms (audio CAPTCHA, logic puzzles).

#### 1.2 Time-based Media
- 1.2.1 Audio-only/Video-only (Level A): Provide transcripts for audio-only content.
  Provide audio descriptions or text alternatives for video-only content.
- 1.2.2 Captions (Level A): All pre-recorded video with audio must have synchronized
  captions. Captions must include speaker identification, sound effects, and music cues.
- 1.2.3 Audio Description (Level A): Pre-recorded video must have audio descriptions
  for visual content not conveyed through dialogue.
- 1.2.4 Captions Live (Level AA): Live audio content must have real-time captions.
- 1.2.5 Audio Description Pre-recorded (Level AA): Audio descriptions for all
  pre-recorded video content.

#### 1.3 Adaptable
- 1.3.1 Info and Relationships (Level A): Semantic HTML structure — use headings
  (h1-h6 in logical order), lists (ul, ol, dl), tables with th and scope,
  fieldset/legend for form groups, landmark regions (main, nav, aside, footer).
- 1.3.2 Meaningful Sequence (Level A): DOM order must match visual order. CSS
  reordering (flexbox order, grid placement) must not break reading sequence.
- 1.3.3 Sensory Characteristics (Level A): Instructions must not rely solely on
  shape, color, size, visual location, orientation, or sound.
- 1.3.4 Orientation (Level AA — WCAG 2.1): Content must not be restricted to a
  single display orientation unless essential.
- 1.3.5 Identify Input Purpose (Level AA — WCAG 2.1): Input fields for user data
  must use autocomplete attributes (name, email, tel, address, etc.).

#### 1.4 Distinguishable
- 1.4.1 Use of Color (Level A): Color must not be the only visual means of conveying
  information. Use patterns, icons, or text labels alongside color.
- 1.4.3 Contrast Minimum (Level AA): Text must have at least 4.5:1 contrast ratio
  against background. Large text (18pt or 14pt bold) requires 3:1 minimum.
- 1.4.4 Resize Text (Level AA): Text must be resizable up to 200% without loss of
  content or functionality, without requiring horizontal scrolling.
- 1.4.5 Images of Text (Level AA): Do not use images of text except for logos and
  essential branding. Use CSS for visual text styling.
- 1.4.10 Reflow (Level AA — WCAG 2.1): Content must reflow at 400% zoom (320px
  viewport width) without horizontal scrolling, except for data tables, toolbars, maps.
- 1.4.11 Non-text Contrast (Level AA — WCAG 2.1): UI components and graphical
  objects require 3:1 contrast ratio. This includes form field borders, icon
  boundaries, chart segments, and focus indicators.
- 1.4.12 Text Spacing (Level AA — WCAG 2.1): No loss of content when user overrides:
  line height 1.5×, paragraph spacing 2×, letter spacing 0.12em, word spacing 0.16em.
- 1.4.13 Content on Hover or Focus (Level AA — WCAG 2.1): Tooltips and popups
  triggered by hover/focus must be dismissible (Escape), hoverable (user can move
  pointer to the content), and persistent (stays visible until dismissed).

### Principle 2: Operable
User interface components and navigation must be operable.

#### 2.1 Keyboard Accessible
- 2.1.1 Keyboard (Level A): All functionality must be operable via keyboard alone.
  Custom widgets need proper keyboard interaction patterns (arrow keys for tabs,
  Enter/Space for buttons, Escape for modals).
- 2.1.2 No Keyboard Trap (Level A): Focus must not become trapped in any component.
  Users must be able to navigate away using standard keys (Tab, Shift+Tab, Escape).
- 2.1.4 Character Key Shortcuts (Level A — WCAG 2.1): Single-character shortcuts
  must be remappable, disableable, or only active on focus.

#### 2.2 Enough Time
- 2.2.1 Timing Adjustable (Level A): If time limits exist, users must be able to
  turn off, adjust (10× minimum), or extend (with 20-second warning).
- 2.2.2 Pause, Stop, Hide (Level A): Auto-updating or auto-moving content must have
  controls to pause, stop, or hide.

#### 2.3 Seizures and Physical Reactions
- 2.3.1 Three Flashes or Below Threshold (Level A): No content flashes more than
  three times per second, or the flash is below general and red flash thresholds.

#### 2.4 Navigable
- 2.4.1 Bypass Blocks (Level A): Provide skip navigation links. Use landmark regions
  for assistive technology navigation.
- 2.4.2 Page Titled (Level A): Each page must have a descriptive, unique <title>.
- 2.4.3 Focus Order (Level A): Focus order must be logical and intuitive, following
  the visual layout. Use tabindex="0" to make elements focusable; avoid positive
  tabindex values.
- 2.4.4 Link Purpose (Level A): Link text must be descriptive — avoid "click here",
  "read more", "learn more" without context. Use aria-label for additional context.
- 2.4.5 Multiple Ways (Level AA): Provide at least two ways to locate pages (e.g.,
  navigation menu and search, or navigation and site map).
- 2.4.6 Headings and Labels (Level AA): Headings and labels must describe the topic
  or purpose of the content they introduce.
- 2.4.7 Focus Visible (Level AA): Keyboard focus indicator must be clearly visible.
  Minimum 2px outline with 3:1 contrast against adjacent colors. Never use
  outline: none or outline: 0 without a visible replacement.
- 2.4.11 Focus Not Obscured (Level AA — WCAG 2.2): Focused component must not be
  entirely hidden behind sticky headers, modals, or other overlapping content.

#### 2.5 Input Modalities
- 2.5.1 Pointer Gestures (Level A — WCAG 2.1): Multi-point or path-based gestures
  must have single-pointer alternatives.
- 2.5.2 Pointer Cancellation (Level A — WCAG 2.1): For single-pointer activation,
  at least one of: no down-event, abort/undo, up reversal, essential exception.
- 2.5.3 Label in Name (Level A — WCAG 2.1): Accessible name must contain visible
  label text. If a button says "Search", aria-label must include "Search".
- 2.5.4 Motion Actuation (Level A — WCAG 2.1): Functionality triggered by device
  motion must have UI alternatives and be disableable.
- 2.5.8 Target Size Minimum (Level AA — WCAG 2.2): Interactive targets must be at
  least 24×24 CSS pixels, recommended 44×44px for touch interfaces.

### Principle 3: Understandable
Information and the operation of the user interface must be understandable.

#### 3.1 Readable
- 3.1.1 Language of Page (Level A): Set lang attribute on <html> element.
- 3.1.2 Language of Parts (Level AA): Use lang attribute on elements containing
  text in a different language than the page default.

#### 3.2 Predictable
- 3.2.1 On Focus (Level A): Focus must not trigger unexpected context changes.
- 3.2.2 On Input (Level A): Changing a form control must not automatically cause
  a context change unless the user is advised beforehand.
- 3.2.3 Consistent Navigation (Level AA): Navigation mechanisms must be consistent
  across pages.
- 3.2.4 Consistent Identification (Level AA): Components with the same functionality
  must be identified consistently.

#### 3.3 Input Assistance
- 3.3.1 Error Identification (Level A): Errors must be identified and described in
  text. Do not rely solely on color (red border) to indicate errors.
- 3.3.2 Labels or Instructions (Level A): All form inputs must have visible labels.
  Placeholder text alone is NOT a label. Associate labels using for/id or wrapping.
- 3.3.3 Error Suggestion (Level AA): When an error is detected and suggestions are
  known, provide the suggestion in text.
- 3.3.4 Error Prevention — Legal, Financial, Data (Level AA): For submissions with
  legal/financial consequences, provide confirmation, review, or reversibility.

### Principle 4: Robust
Content must be robust enough to be interpreted by a wide variety of user agents,
including assistive technologies.

#### 4.1 Compatible
- 4.1.2 Name, Role, Value (Level A): All custom UI components must expose correct
  name, role, and state to accessibility APIs. Use ARIA only when semantic HTML
  cannot achieve the required semantics.
- 4.1.3 Status Messages (Level AA — WCAG 2.1): Status messages must be programmatically
  determinable via role="status", role="alert", aria-live="polite", or aria-live="assertive"
  without receiving focus.

## ARIA Best Practices

### First Rule of ARIA
Do NOT use ARIA if semantic HTML provides the needed semantics. A <button> is better
than <div role="button" tabindex="0">. A <nav> is better than <div role="navigation">.

### Common ARIA Patterns
- Modal dialogs: role="dialog", aria-modal="true", aria-labelledby, focus trap, return focus.
- Tabs: role="tablist"/"tab"/"tabpanel", aria-selected, arrow key navigation.
- Accordions: button with aria-expanded, aria-controls pointing to content panel.
- Menus: role="menu"/"menuitem", arrow key navigation, type-ahead.
- Combobox: role="combobox", aria-expanded, aria-activedescendant, aria-autocomplete.
- Live regions: aria-live="polite" for non-urgent updates, "assertive" for critical alerts.
- Loading states: aria-busy="true" on updating regions, aria-live for completion announcements.

## Screen Reader Compatibility

- Test with NVDA (Windows/Firefox), JAWS (Windows/Chrome), and VoiceOver (macOS/Safari).
- Ensure all interactive elements announce their role, name, and state.
- Verify virtual/browse mode vs. forms/application mode transitions.
- Test reading order matches logical content flow.
- Verify live region announcements work across all three screen readers.

## Automated and Manual Testing

### Automated Testing (axe-core, Lighthouse)
- Configure axe-core for CI/CD pipeline integration (fail builds on violations).
- Run Lighthouse accessibility audits as part of code review workflow.
- Set minimum scores: Lighthouse accessibility ≥ 90, zero critical axe violations.
- Automated testing catches approximately 30-40% of accessibility issues.

### Manual Testing Checklist
- Keyboard-only navigation: complete all workflows without mouse.
- Screen reader testing: verify announcements for all interactive elements.
- Zoom testing: 200% text zoom and 400% page zoom.
- High contrast mode: verify all content visible in Windows High Contrast Mode.
- Reduced motion: verify prefers-reduced-motion is respected for all animations.
- Color contrast verification with tools (Colour Contrast Analyser, browser DevTools).
- Touch target testing on mobile devices.
- Form error and validation testing with screen readers.

## Output Requirements

For each accessibility finding, provide:
1. WCAG success criterion reference (number, name, level)
2. Impact: who is affected (blind, low vision, motor, cognitive, deaf)
3. Current state: pass, fail, or not applicable
4. Issue description with code location
5. Remediation: specific code changes with before/after examples
6. Priority: critical (prevents access), major (significant barrier),
   minor (inconvenience), enhancement (beyond AA)

Always produce a comprehensive Accessibility Report and Accessibility Test Suite.`;

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
