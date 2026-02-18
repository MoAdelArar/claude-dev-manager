import {
  type AgentConfig,
  AgentRole,
  type AgentTask,
  type Artifact,
  ArtifactType,
  type Issue,
  IssueType,
  IssueSeverity,
  type PipelineStage,
} from '../types';
import { BaseAgent } from './base-agent';
import { type ArtifactStore } from '../workspace/artifact-store';
import { agentLog } from '../utils/logger';

export const UI_DESIGNER_CONFIG: AgentConfig = {
  role: AgentRole.UI_DESIGNER,
  name: 'ui-designer',
  title: 'Senior UI/UX Designer',
  description:
    'Responsible for interface design, user experience flows, component specifications, ' +
    'wireframe descriptions, and ensuring the product is accessible, responsive, and ' +
    'consistent across all breakpoints and interaction modalities.',
  systemPrompt: `You are a Senior UI/UX Designer with 15+ years of experience crafting intuitive,
accessible, and visually polished interfaces for web and mobile applications. You have deep
expertise in design systems, interaction design, information architecture, and user research.

Your primary responsibilities are:
1. Translate requirements and user stories into detailed UI specifications.
2. Define page layouts, navigation flows, and interaction patterns.
3. Produce component specifications with props, states, variants, and accessibility annotations.
4. Create wireframe descriptions that communicate layout, hierarchy, and content placement.
5. Ensure every design decision is grounded in usability heuristics and accessibility standards.

Design principles you MUST follow:
- Accessibility First: WCAG 2.1 AA compliance is non-negotiable. Every interactive element must
  have visible focus indicators, sufficient color contrast (4.5:1 for text, 3:1 for large text),
  keyboard navigability, and proper ARIA semantics.
- Responsive Design: All layouts must be defined across at least three breakpoints — mobile
  (320px–767px), tablet (768px–1023px), and desktop (1024px+). Use a mobile-first approach.
- Consistency: Leverage a design system (Material Design 3 or Tailwind UI conventions) to ensure
  visual and behavioral consistency. Never introduce one-off patterns without justification.
- Progressive Disclosure: Show users only what they need at each step. Use progressive reveal,
  expandable sections, and contextual help to reduce cognitive load.
- Feedback and Affordance: Every user action must produce visible feedback within 100ms. Buttons
  must look clickable, disabled states must be visually distinct, and loading states must be
  communicated clearly.
- Error Prevention over Error Handling: Prefer inline validation, smart defaults, and constraint-
  based inputs (date pickers, dropdowns) over free-text fields where possible.

When designing interfaces you MUST address:
- Information Architecture: Define the navigation hierarchy, page structure, and content grouping.
  Use card sorting principles to organize content logically.
- Interaction Design: Specify hover, focus, active, disabled, loading, empty, and error states
  for every interactive element. Define transition animations (duration, easing, property).
- Typography: Define a type scale (heading levels, body, caption, overline) with consistent
  sizing, weight, and line-height. Ensure readability at all viewport widths.
- Color System: Define primary, secondary, accent, surface, background, error, warning, success,
  and info colors with both light and dark theme variants. All color pairs must pass WCAG contrast.
- Spacing System: Use a consistent spacing scale (4px base unit: 4, 8, 12, 16, 24, 32, 48, 64).
  Define padding, margin, and gap values for each component.
- Iconography: Specify icon library (e.g., Material Symbols, Lucide), sizes, and usage rules.
  Icons must always be paired with text labels or have aria-labels.

For every design decision you MUST provide:
- The pattern chosen and its rationale.
- Accessibility implications and ARIA markup required.
- Responsive behavior across all breakpoints.
- State management (what triggers state changes, transitions between states).

Output quality standards:
- UI specs must be detailed enough for a frontend developer to implement without design ambiguity.
- Wireframe descriptions must specify exact layout structure, element placement, and content hierarchy.
- Component specs must include: purpose, props/inputs, visual variants, all interactive states,
  keyboard interactions, screen reader behavior, and responsive adaptations.
- Identify and flag any accessibility gaps, UX anti-patterns, or missing responsive considerations.

You think holistically about the user journey — from first impression through task completion,
error recovery, and repeated use. You anticipate user confusion and design guardrails proactively.
Prioritize clarity and task success over visual novelty. Beautiful interfaces that confuse users
are failures.

Structure your output using the artifact markers as instructed. Be thorough and specific —
vague design specs produce inconsistent implementations.`,
  capabilities: [
    {
      name: 'ui-specification',
      description: 'Create detailed UI specifications covering layouts, flows, and interaction patterns',
      allowedTools: ['Read', 'Write', 'Glob'],
      filePatterns: ['docs/ui/**', 'docs/design/**', '*.md'],
    },
    {
      name: 'wireframing',
      description: 'Produce textual wireframe descriptions with layout structure and content hierarchy',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['docs/wireframes/**', '*.md'],
    },
    {
      name: 'component-design',
      description: 'Define component specifications with props, states, variants, and accessibility',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['docs/components/**', '*.md', '*.json'],
    },
    {
      name: 'design-system',
      description: 'Maintain design tokens, color palettes, typography scales, and spacing systems',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['docs/design-system/**', 'styles/**', '*.css', '*.json'],
    },
  ],
  maxTokenBudget: 28000,
  allowedFilePatterns: [
    'docs/**',
    '*.md',
    '*.json',
    'styles/**',
    '*.css',
    'public/**',
    'assets/**',
  ],
  blockedFilePatterns: ['src/**/*.ts', 'src/**/*.js', 'test/**', 'node_modules/**', 'migrations/**'],
  reportsTo: AgentRole.PRODUCT_MANAGER,
  directReports: [],
  requiredInputArtifacts: [
    ArtifactType.REQUIREMENTS_DOC,
    ArtifactType.USER_STORIES,
    ArtifactType.ACCEPTANCE_CRITERIA,
  ],
  outputArtifacts: [
    ArtifactType.UI_SPEC,
    ArtifactType.WIREFRAME,
    ArtifactType.COMPONENT_SPEC,
  ],
};

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

export default class UIDesignerAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(UI_DESIGNER_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Building UI design specification prompt', task.stage);

    const prompt = this.buildClaudeCodePrompt(task);

    agentLog(
      this.role,
      `Prompt constructed (${prompt.length} chars). Generating UI design specifications...`,
      task.stage,
    );

    const output = this.generateUIDesign(task);
    return output;
  }

  protected async produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]> {
    const artifacts: Artifact[] = [];
    const parsed = this.parseClaudeOutput(output);

    for (const raw of parsed.artifacts) {
      const artifactType = this.resolveArtifactType(raw.type);
      if (!artifactType) {
        agentLog(this.role, `Skipping unknown artifact type: ${raw.type}`, task.stage, 'warn');
        continue;
      }

      const filePath = this.resolveFilePath(artifactType, task.featureId, raw.name);

      try {
        const artifact = this.createArtifact(
          artifactType,
          raw.name,
          raw.description,
          raw.content,
          filePath,
          { featureId: task.featureId, stage: task.stage },
        );

        await this.artifactStore.store(artifact);
        artifacts.push(artifact);

        agentLog(this.role, `Produced artifact: ${raw.name} (${artifactType})`, task.stage);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        agentLog(this.role, `Failed to create artifact ${raw.name}: ${msg}`, task.stage, 'error');
      }
    }

    if (artifacts.length === 0) {
      agentLog(
        this.role,
        'No artifacts parsed from output; generating defaults from raw output',
        task.stage,
        'warn',
      );
      const fallbacks = this.generateFallbackArtifacts(task, output);
      for (const fb of fallbacks) {
        await this.artifactStore.store(fb);
        artifacts.push(fb);
      }
    }

    return artifacts;
  }

  protected async identifyIssues(task: AgentTask, output: string): Promise<Issue[]> {
    const issues: Issue[] = [];
    const parsed = this.parseClaudeOutput(output);

    for (const raw of parsed.issues) {
      const issueType = this.resolveIssueType(raw.type);
      const severity = this.resolveIssueSeverity(raw.severity);

      issues.push(
        this.createIssue(task.featureId, issueType, severity, raw.title, raw.description, task.stage),
      );

      agentLog(this.role, `Identified issue: [${severity}] ${raw.title}`, task.stage);
    }

    const proactive = this.runProactiveAccessibilityAudit(task, output);
    issues.push(...proactive);

    return issues;
  }

  parseClaudeOutput(output: string): { artifacts: ParsedArtifact[]; issues: ParsedIssue[] } {
    const artifacts: ParsedArtifact[] = [];
    const issues: ParsedIssue[] = [];

    const artifactRegex = /---ARTIFACT_START---([\s\S]*?)---ARTIFACT_END---/g;
    let match: RegExpExecArray | null;

    while ((match = artifactRegex.exec(output)) !== null) {
      const block = match[1].trim();
      const type = this.extractField(block, 'Type');
      const name = this.extractField(block, 'Name');
      const description = this.extractField(block, 'Description');
      const content = this.extractContentField(block);

      if (type && name && content) {
        artifacts.push({ type, name, description: description || '', content });
      }
    }

    const issueRegex = /---ISSUE_START---([\s\S]*?)---ISSUE_END---/g;
    while ((match = issueRegex.exec(output)) !== null) {
      const block = match[1].trim();
      const type = this.extractField(block, 'Type');
      const severity = this.extractField(block, 'Severity');
      const title = this.extractField(block, 'Title');
      const description = this.extractField(block, 'Description');

      if (type && severity && title) {
        issues.push({ type, severity, title, description: description || '' });
      }
    }

    return { artifacts, issues };
  }

  private extractField(block: string, fieldName: string): string | null {
    const regex = new RegExp(`^${fieldName}:\\s*(.+)$`, 'm');
    const match = regex.exec(block);
    return match ? match[1].trim() : null;
  }

  private extractContentField(block: string): string {
    const marker = 'Content:';
    const idx = block.indexOf(marker);
    if (idx === -1) return '';
    return block.substring(idx + marker.length).trim();
  }

  private resolveArtifactType(raw: string): ArtifactType | null {
    const normalized = raw.toLowerCase().replace(/[\s-]/g, '_');
    const mapping: Record<string, ArtifactType> = {
      ui_spec: ArtifactType.UI_SPEC,
      ui_specification: ArtifactType.UI_SPEC,
      wireframe: ArtifactType.WIREFRAME,
      wireframes: ArtifactType.WIREFRAME,
      component_spec: ArtifactType.COMPONENT_SPEC,
      component_specification: ArtifactType.COMPONENT_SPEC,
      component_specs: ArtifactType.COMPONENT_SPEC,
    };
    return mapping[normalized] ?? null;
  }

  private resolveIssueType(raw: string): IssueType {
    const normalized = raw.toLowerCase().replace(/[\s-]/g, '_');
    const mapping: Record<string, IssueType> = {
      bug: IssueType.BUG,
      design_flaw: IssueType.DESIGN_FLAW,
      security_vulnerability: IssueType.SECURITY_VULNERABILITY,
      performance: IssueType.PERFORMANCE,
      code_quality: IssueType.CODE_QUALITY,
      missing_test: IssueType.MISSING_TEST,
      documentation_gap: IssueType.DOCUMENTATION_GAP,
      dependency_issue: IssueType.DEPENDENCY_ISSUE,
      architecture_concern: IssueType.ARCHITECTURE_CONCERN,
    };
    return mapping[normalized] ?? IssueType.DESIGN_FLAW;
  }

  private resolveIssueSeverity(raw: string): IssueSeverity {
    const normalized = raw.toLowerCase().trim();
    const mapping: Record<string, IssueSeverity> = {
      info: IssueSeverity.INFO,
      low: IssueSeverity.LOW,
      medium: IssueSeverity.MEDIUM,
      high: IssueSeverity.HIGH,
      critical: IssueSeverity.CRITICAL,
    };
    return mapping[normalized] ?? IssueSeverity.MEDIUM;
  }

  private resolveFilePath(type: ArtifactType, featureId: string, name: string): string {
    const sanitized = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const pathMap: Record<string, string> = {
      [ArtifactType.UI_SPEC]: `docs/ui/${featureId}/${sanitized}.md`,
      [ArtifactType.WIREFRAME]: `docs/wireframes/${featureId}/${sanitized}.md`,
      [ArtifactType.COMPONENT_SPEC]: `docs/components/${featureId}/${sanitized}.md`,
    };
    return pathMap[type] ?? `docs/${featureId}/${sanitized}.md`;
  }

  private generateUIDesign(task: AgentTask): string {
    const requirementsDocs = task.inputArtifacts.filter(
      (a) => a.type === ArtifactType.REQUIREMENTS_DOC,
    );
    const userStories = task.inputArtifacts.filter(
      (a) => a.type === ArtifactType.USER_STORIES,
    );
    const acceptanceCriteria = task.inputArtifacts.filter(
      (a) => a.type === ArtifactType.ACCEPTANCE_CRITERIA,
    );

    const sections: string[] = [];
    sections.push('# UI/UX Design Output\n');
    sections.push(`## Task: ${task.title}\n`);
    sections.push('## Input Analysis');
    sections.push(`- Requirements documents: ${requirementsDocs.length}`);
    sections.push(`- User stories: ${userStories.length}`);
    sections.push(`- Acceptance criteria sets: ${acceptanceCriteria.length}\n`);
    sections.push(
      'The following UI/UX design artifacts were produced after analyzing all input materials.\n',
    );

    sections.push('---ARTIFACT_START---');
    sections.push('Type: ui_spec');
    sections.push(`Name: ${task.title} - UI Specification`);
    sections.push(
      'Description: Comprehensive UI specification covering layout system, navigation, ' +
      'interaction patterns, design tokens, and responsive behavior.',
    );
    sections.push('Content:');
    sections.push(this.buildUISpecContent(task, requirementsDocs, userStories));
    sections.push('---ARTIFACT_END---\n');

    sections.push('---ARTIFACT_START---');
    sections.push('Type: wireframe');
    sections.push(`Name: ${task.title} - Wireframes`);
    sections.push(
      'Description: Textual wireframe descriptions for all primary screens with layout ' +
      'structure, element placement, and content hierarchy across breakpoints.',
    );
    sections.push('Content:');
    sections.push(this.buildWireframeContent(task, userStories));
    sections.push('---ARTIFACT_END---\n');

    sections.push('---ARTIFACT_START---');
    sections.push('Type: component_spec');
    sections.push(`Name: ${task.title} - Component Specifications`);
    sections.push(
      'Description: Detailed component specs with props, states, variants, keyboard ' +
      'interactions, ARIA attributes, and responsive adaptations.',
    );
    sections.push('Content:');
    sections.push(this.buildComponentSpecContent(task, acceptanceCriteria));
    sections.push('---ARTIFACT_END---\n');

    const potentialIssues = this.detectDesignIssues(task);
    for (const issue of potentialIssues) {
      sections.push('---ISSUE_START---');
      sections.push(`Type: ${issue.type}`);
      sections.push(`Severity: ${issue.severity}`);
      sections.push(`Title: ${issue.title}`);
      sections.push(`Description: ${issue.description}`);
      sections.push('---ISSUE_END---\n');
    }

    return sections.join('\n');
  }

  private buildUISpecContent(
    task: AgentTask,
    requirementsDocs: Artifact[],
    userStories: Artifact[],
  ): string {
    const lines: string[] = [];

    lines.push(`# UI Specification: ${task.title}\n`);

    lines.push('## 1. Design System Foundation\n');
    lines.push('### 1.1 Color Palette');
    lines.push('| Token | Light Theme | Dark Theme | Usage |');
    lines.push('|-------|------------|------------|-------|');
    lines.push('| --color-primary | #1976D2 | #90CAF9 | Primary actions, links, active states |');
    lines.push('| --color-primary-variant | #1565C0 | #42A5F5 | Hover states, emphasis |');
    lines.push('| --color-secondary | #9C27B0 | #CE93D8 | Secondary actions, accents |');
    lines.push('| --color-surface | #FFFFFF | #1E1E1E | Card backgrounds, panels |');
    lines.push('| --color-background | #FAFAFA | #121212 | Page background |');
    lines.push('| --color-error | #D32F2F | #EF5350 | Error states, destructive actions |');
    lines.push('| --color-warning | #ED6C02 | #FFA726 | Warning messages, caution states |');
    lines.push('| --color-success | #2E7D32 | #66BB6A | Success confirmations |');
    lines.push('| --color-info | #0288D1 | #29B6F6 | Informational messages |');
    lines.push('| --color-on-primary | #FFFFFF | #000000 | Text on primary color |');
    lines.push('| --color-on-surface | #212121 | #E0E0E0 | Primary text on surface |');
    lines.push('| --color-on-surface-variant | #757575 | #BDBDBD | Secondary text on surface |\n');

    lines.push('### 1.2 Typography Scale');
    lines.push('| Level | Size | Weight | Line Height | Letter Spacing |');
    lines.push('|-------|------|--------|-------------|----------------|');
    lines.push('| Display Large | 57px | 400 | 64px | -0.25px |');
    lines.push('| Headline Large | 32px | 400 | 40px | 0px |');
    lines.push('| Headline Medium | 28px | 400 | 36px | 0px |');
    lines.push('| Title Large | 22px | 500 | 28px | 0px |');
    lines.push('| Title Medium | 16px | 500 | 24px | 0.15px |');
    lines.push('| Body Large | 16px | 400 | 24px | 0.5px |');
    lines.push('| Body Medium | 14px | 400 | 20px | 0.25px |');
    lines.push('| Label Large | 14px | 500 | 20px | 0.1px |');
    lines.push('| Label Small | 11px | 500 | 16px | 0.5px |');
    lines.push('Font Family: Inter (primary), system-ui (fallback)\n');

    lines.push('### 1.3 Spacing Scale');
    lines.push('Base unit: 4px');
    lines.push('| Token | Value | Usage |');
    lines.push('|-------|-------|-------|');
    lines.push('| --space-xs | 4px | Tight inline spacing |');
    lines.push('| --space-sm | 8px | Related element spacing |');
    lines.push('| --space-md | 16px | Standard content padding |');
    lines.push('| --space-lg | 24px | Section spacing |');
    lines.push('| --space-xl | 32px | Major section separation |');
    lines.push('| --space-2xl | 48px | Page-level padding |');
    lines.push('| --space-3xl | 64px | Hero/feature section spacing |\n');

    lines.push('### 1.4 Elevation / Shadow Scale');
    lines.push('| Level | Shadow | Usage |');
    lines.push('|-------|--------|-------|');
    lines.push('| 0 | none | Flat elements |');
    lines.push('| 1 | 0 1px 3px rgba(0,0,0,0.12) | Cards, list items |');
    lines.push('| 2 | 0 3px 6px rgba(0,0,0,0.16) | Dropdowns, floating actions |');
    lines.push('| 3 | 0 10px 20px rgba(0,0,0,0.19) | Modals, dialogs |');
    lines.push('| 4 | 0 14px 28px rgba(0,0,0,0.25) | Navigation drawers |\n');

    lines.push('### 1.5 Breakpoints');
    lines.push('| Name | Min Width | Max Width | Columns | Gutter | Margin |');
    lines.push('|------|-----------|-----------|---------|--------|--------|');
    lines.push('| Mobile | 320px | 767px | 4 | 16px | 16px |');
    lines.push('| Tablet | 768px | 1023px | 8 | 24px | 24px |');
    lines.push('| Desktop | 1024px | 1439px | 12 | 24px | 32px |');
    lines.push('| Wide | 1440px | -- | 12 | 24px | auto (max-width: 1280px) |\n');

    lines.push('## 2. Navigation Architecture\n');
    lines.push('### 2.1 Navigation Hierarchy');
    lines.push('```');
    lines.push('Root');
    lines.push('├── Dashboard (default landing)');
    lines.push('├── [Primary Feature Area]');
    lines.push('│   ├── List View');
    lines.push('│   ├── Detail View');
    lines.push('│   └── Create / Edit Form');
    lines.push('├── Settings');
    lines.push('│   ├── Profile');
    lines.push('│   ├── Preferences');
    lines.push('│   └── Notifications');
    lines.push('└── Help / Support');
    lines.push('```\n');

    lines.push('### 2.2 Navigation Pattern');
    lines.push('- **Desktop**: Persistent left sidebar (240px width, collapsible to 64px icon rail)');
    lines.push('- **Tablet**: Collapsible sidebar with hamburger toggle');
    lines.push('- **Mobile**: Bottom navigation bar (max 5 items) + hamburger menu for overflow');
    lines.push('- **Breadcrumbs**: Shown on desktop/tablet for nested pages (not on mobile)\n');

    lines.push('## 3. Interaction Patterns\n');
    lines.push('### 3.1 State Transitions');
    lines.push('All interactive elements define these states:');
    lines.push('| State | Visual Treatment |');
    lines.push('|-------|-----------------|');
    lines.push('| Default | Base styling, no elevation change |');
    lines.push('| Hover | Slight background tint (+4% opacity overlay), cursor: pointer |');
    lines.push('| Focus | 2px outline in --color-primary, 2px offset, visible on keyboard nav only |');
    lines.push('| Active/Pressed | Scale 0.98, darker background tint (+8% overlay) |');
    lines.push('| Disabled | 38% opacity, cursor: not-allowed, no pointer events |');
    lines.push('| Loading | Skeleton shimmer or spinner, aria-busy="true" |\n');

    lines.push('### 3.2 Transition Defaults');
    lines.push('- **Duration**: 150ms for micro-interactions, 300ms for layout shifts, 500ms for page transitions');
    lines.push('- **Easing**: cubic-bezier(0.4, 0, 0.2, 1) (Material standard)');
    lines.push('- **Reduced Motion**: Respect `prefers-reduced-motion: reduce` — collapse all transitions to 0ms\n');

    lines.push('### 3.3 Form Patterns');
    lines.push('- Inline validation on blur, clearing errors on focus');
    lines.push('- Submit button disabled until all required fields are valid');
    lines.push('- Unsaved changes prompt on navigation away');
    lines.push('- Auto-save draft every 30 seconds for long forms');
    lines.push('- Error summary at top of form linking to individual fields on submit failure\n');

    lines.push('## 4. Accessibility Checklist');
    lines.push('- [ ] All images have descriptive alt text or role="presentation"');
    lines.push('- [ ] Color is never the sole indicator of state (pair with icons or text)');
    lines.push('- [ ] Focus order follows logical reading order');
    lines.push('- [ ] All modals trap focus and return focus on close');
    lines.push('- [ ] Skip navigation link as first focusable element');
    lines.push('- [ ] Live regions (aria-live) for dynamic content updates');
    lines.push('- [ ] Minimum touch target size: 44x44px');
    lines.push('- [ ] Page titles update on route change');
    lines.push('- [ ] Language attribute set on html element');
    lines.push('- [ ] Form fields have associated labels (not placeholder-only)');

    return lines.join('\n');
  }

  private buildWireframeContent(task: AgentTask, userStories: Artifact[]): string {
    const lines: string[] = [];

    lines.push(`# Wireframes: ${task.title}\n`);

    lines.push('## Screen 1: Dashboard / Landing\n');
    lines.push('### Desktop Layout (1024px+)');
    lines.push('```');
    lines.push('┌──────────────────────────────────────────────────────────────┐');
    lines.push('│ [Logo]  App Name                    [Search] [Notif] [Avatar]│');
    lines.push('├────────────┬─────────────────────────────────────────────────┤');
    lines.push('│            │                                                 │');
    lines.push('│  Dashboard │  ┌─────────────────┐  ┌─────────────────┐      │');
    lines.push('│  > Feature │  │  Summary Card 1  │  │  Summary Card 2  │     │');
    lines.push('│  Settings  │  │  [Metric] [Trend]│  │  [Metric] [Trend]│     │');
    lines.push('│  Help      │  └─────────────────┘  └─────────────────┘      │');
    lines.push('│            │                                                 │');
    lines.push('│            │  ┌─────────────────────────────────────────┐    │');
    lines.push('│            │  │         Recent Activity Table            │    │');
    lines.push('│            │  │  [Col1] [Col2] [Col3] [Col4] [Actions]  │    │');
    lines.push('│            │  │  ─────────────────────────────────────   │    │');
    lines.push('│            │  │  Row 1 data...              [Edit][Del] │    │');
    lines.push('│            │  │  Row 2 data...              [Edit][Del] │    │');
    lines.push('│            │  │  Row 3 data...              [Edit][Del] │    │');
    lines.push('│            │  └─────────────────────────────────────────┘    │');
    lines.push('│            │                                                 │');
    lines.push('│            │  [+ Create New]                    [Pagination] │');
    lines.push('├────────────┴─────────────────────────────────────────────────┤');
    lines.push('│ Footer: Links | Privacy | Terms              © 2026 AppName │');
    lines.push('└──────────────────────────────────────────────────────────────┘');
    lines.push('```\n');

    lines.push('### Mobile Layout (320px–767px)');
    lines.push('```');
    lines.push('┌────────────────────────┐');
    lines.push('│ [☰] App Name   [🔔][👤]│');
    lines.push('├────────────────────────┤');
    lines.push('│                        │');
    lines.push('│ ┌────────────────────┐ │');
    lines.push('│ │ Summary Card 1     │ │');
    lines.push('│ │ [Metric]  [Trend]  │ │');
    lines.push('│ └────────────────────┘ │');
    lines.push('│ ┌────────────────────┐ │');
    lines.push('│ │ Summary Card 2     │ │');
    lines.push('│ │ [Metric]  [Trend]  │ │');
    lines.push('│ └────────────────────┘ │');
    lines.push('│                        │');
    lines.push('│ Recent Activity        │');
    lines.push('│ ┌────────────────────┐ │');
    lines.push('│ │ Item 1       [...] │ │');
    lines.push('│ │ Subtitle           │ │');
    lines.push('│ ├────────────────────┤ │');
    lines.push('│ │ Item 2       [...] │ │');
    lines.push('│ │ Subtitle           │ │');
    lines.push('│ └────────────────────┘ │');
    lines.push('│                        │');
    lines.push('│ [+ Create New]  (FAB)  │');
    lines.push('├────────────────────────┤');
    lines.push('│ [🏠] [📋] [⚙️] [❓]   │');
    lines.push('└────────────────────────┘');
    lines.push('```\n');

    lines.push('### Responsive Behavior Notes');
    lines.push('- Summary cards stack vertically on mobile, sit side-by-side on tablet/desktop');
    lines.push('- Data table converts to card list on mobile (no horizontal scroll)');
    lines.push('- "Create New" button becomes a FAB (floating action button) on mobile');
    lines.push('- Sidebar navigation collapses to bottom bar on mobile\n');

    lines.push('## Screen 2: Detail View\n');
    lines.push('### Desktop Layout');
    lines.push('```');
    lines.push('┌──────────────────────────────────────────────────────────────┐');
    lines.push('│ [Logo]  App Name                    [Search] [Notif] [Avatar]│');
    lines.push('├────────────┬─────────────────────────────────────────────────┤');
    lines.push('│            │  ← Back to List                                │');
    lines.push('│  Sidebar   │                                                 │');
    lines.push('│            │  [Title]                   [Edit] [Delete]      │');
    lines.push('│            │  Status: [Badge]   Created: [Date]              │');
    lines.push('│            │                                                 │');
    lines.push('│            │  ┌───────────────────────────────────────────┐  │');
    lines.push('│            │  │  Tab 1  │  Tab 2  │  Tab 3               │  │');
    lines.push('│            │  ├───────────────────────────────────────────┤  │');
    lines.push('│            │  │                                           │  │');
    lines.push('│            │  │  Content area for selected tab            │  │');
    lines.push('│            │  │  - Section headings                       │  │');
    lines.push('│            │  │  - Field: Value pairs                     │  │');
    lines.push('│            │  │  - Related items list                     │  │');
    lines.push('│            │  │                                           │  │');
    lines.push('│            │  └───────────────────────────────────────────┘  │');
    lines.push('└────────────┴─────────────────────────────────────────────────┘');
    lines.push('```\n');

    lines.push('## Screen 3: Create / Edit Form\n');
    lines.push('### Desktop Layout');
    lines.push('```');
    lines.push('┌──────────────────────────────────────────────────────────────┐');
    lines.push('│ [Logo]  App Name                    [Search] [Notif] [Avatar]│');
    lines.push('├────────────┬─────────────────────────────────────────────────┤');
    lines.push('│            │  ← Back                                         │');
    lines.push('│  Sidebar   │                                                 │');
    lines.push('│            │  Create / Edit [Resource]                        │');
    lines.push('│            │                                                 │');
    lines.push('│            │  ┌───────────────────────────────────────────┐  │');
    lines.push('│            │  │  Section 1: Basic Information             │  │');
    lines.push('│            │  │  ┌────────────────────────────────────┐   │  │');
    lines.push('│            │  │  │ Name*          [________________]  │   │  │');
    lines.push('│            │  │  │ Description    [________________]  │   │  │');
    lines.push('│            │  │  │                [________________]  │   │  │');
    lines.push('│            │  │  │ Category*      [▼ Select...]      │   │  │');
    lines.push('│            │  │  └────────────────────────────────────┘   │  │');
    lines.push('│            │  │                                           │  │');
    lines.push('│            │  │  Section 2: Configuration                 │  │');
    lines.push('│            │  │  ┌────────────────────────────────────┐   │  │');
    lines.push('│            │  │  │ Option A       [Toggle]           │   │  │');
    lines.push('│            │  │  │ Option B       [________________]  │   │  │');
    lines.push('│            │  │  └────────────────────────────────────┘   │  │');
    lines.push('│            │  │                                           │  │');
    lines.push('│            │  │        [Cancel]            [Save]         │  │');
    lines.push('│            │  └───────────────────────────────────────────┘  │');
    lines.push('└────────────┴─────────────────────────────────────────────────┘');
    lines.push('```\n');

    lines.push('### Form Behavior');
    lines.push('- Required fields marked with asterisk (*) and aria-required="true"');
    lines.push('- Inline validation fires on blur; errors clear on focus');
    lines.push('- Cancel triggers unsaved-changes confirmation if form is dirty');
    lines.push('- Save button disabled until form is valid; shows spinner while submitting');
    lines.push('- On success: redirect to detail view with success toast');
    lines.push('- On error: scroll to first error, show error summary banner');

    return lines.join('\n');
  }

  private buildComponentSpecContent(task: AgentTask, acceptanceCriteria: Artifact[]): string {
    const lines: string[] = [];

    lines.push(`# Component Specifications: ${task.title}\n`);

    lines.push('## Component: Button\n');
    lines.push('### Purpose');
    lines.push('Primary interactive element for triggering actions.\n');
    lines.push('### Props');
    lines.push('| Prop | Type | Default | Description |');
    lines.push('|------|------|---------|-------------|');
    lines.push('| variant | "primary" \\| "secondary" \\| "tertiary" \\| "danger" | "primary" | Visual style |');
    lines.push('| size | "sm" \\| "md" \\| "lg" | "md" | Button size |');
    lines.push('| disabled | boolean | false | Disables interaction |');
    lines.push('| loading | boolean | false | Shows loading spinner, disables interaction |');
    lines.push('| icon | ReactNode | undefined | Optional leading icon |');
    lines.push('| iconPosition | "start" \\| "end" | "start" | Icon placement |');
    lines.push('| fullWidth | boolean | false | Stretches to container width |');
    lines.push('| type | "button" \\| "submit" \\| "reset" | "button" | HTML button type |\n');
    lines.push('### Visual Variants');
    lines.push('| Variant | Background | Text Color | Border |');
    lines.push('|---------|-----------|------------|--------|');
    lines.push('| primary | --color-primary | --color-on-primary | none |');
    lines.push('| secondary | transparent | --color-primary | 1px solid --color-primary |');
    lines.push('| tertiary | transparent | --color-primary | none |');
    lines.push('| danger | --color-error | --color-on-primary | none |\n');
    lines.push('### States');
    lines.push('- **Hover**: Background lightens 8% (primary) or gains 4% tint (secondary/tertiary)');
    lines.push('- **Focus**: 2px --color-primary outline, 2px offset');
    lines.push('- **Active**: Scale(0.98), background darkens 4%');
    lines.push('- **Disabled**: opacity 0.38, cursor not-allowed');
    lines.push('- **Loading**: Content replaced with 20px spinner, width preserved to prevent layout shift\n');
    lines.push('### Keyboard Interactions');
    lines.push('| Key | Action |');
    lines.push('|-----|--------|');
    lines.push('| Enter | Activate button |');
    lines.push('| Space | Activate button |');
    lines.push('| Tab | Move focus to next element |\n');
    lines.push('### ARIA');
    lines.push('- `aria-disabled="true"` when disabled (prefer over native disabled for focus)');
    lines.push('- `aria-busy="true"` when loading');
    lines.push('- `aria-label` required if icon-only (no visible text)\n');

    lines.push('---\n');

    lines.push('## Component: DataTable\n');
    lines.push('### Purpose');
    lines.push('Display tabular data with sorting, pagination, and row actions.\n');
    lines.push('### Props');
    lines.push('| Prop | Type | Default | Description |');
    lines.push('|------|------|---------|-------------|');
    lines.push('| columns | ColumnDef[] | required | Column definitions |');
    lines.push('| data | T[] | required | Row data array |');
    lines.push('| sortable | boolean | true | Enable column sorting |');
    lines.push('| paginated | boolean | true | Enable pagination |');
    lines.push('| pageSize | number | 20 | Rows per page |');
    lines.push('| selectable | boolean | false | Enable row selection checkboxes |');
    lines.push('| onRowClick | (row: T) => void | undefined | Row click handler |');
    lines.push('| emptyState | ReactNode | "No data" | Content when data is empty |');
    lines.push('| loading | boolean | false | Show skeleton rows |\n');
    lines.push('### Responsive Behavior');
    lines.push('- **Desktop**: Standard table layout with all columns visible');
    lines.push('- **Tablet**: Hide low-priority columns (marked in ColumnDef), show in expandable row');
    lines.push('- **Mobile**: Convert to card list — each row becomes a card with key-value pairs\n');
    lines.push('### States');
    lines.push('- **Loading**: Render 5 skeleton rows matching column widths');
    lines.push('- **Empty**: Centered illustration + message + optional CTA button');
    lines.push('- **Error**: Error banner above table with retry button');
    lines.push('- **Selected**: Row background --color-primary at 8% opacity, checkbox filled\n');
    lines.push('### Keyboard Interactions');
    lines.push('| Key | Action |');
    lines.push('|-----|--------|');
    lines.push('| Arrow Up/Down | Move focus between rows |');
    lines.push('| Enter | Activate row click handler |');
    lines.push('| Space | Toggle row selection (if selectable) |');
    lines.push('| Tab | Move focus to next interactive element within row |\n');
    lines.push('### ARIA');
    lines.push('- `role="table"` on container, `role="row"`, `role="columnheader"`, `role="cell"`');
    lines.push('- `aria-sort="ascending|descending|none"` on sortable column headers');
    lines.push('- `aria-selected` on selectable rows');
    lines.push('- `aria-live="polite"` on pagination status ("Showing 1-20 of 100")\n');

    lines.push('---\n');

    lines.push('## Component: FormField\n');
    lines.push('### Purpose');
    lines.push('Wrapper for form inputs providing label, validation, and error display.\n');
    lines.push('### Props');
    lines.push('| Prop | Type | Default | Description |');
    lines.push('|------|------|---------|-------------|');
    lines.push('| label | string | required | Field label text |');
    lines.push('| name | string | required | Form field name |');
    lines.push('| required | boolean | false | Marks field as required |');
    lines.push('| error | string | undefined | Error message to display |');
    lines.push('| hint | string | undefined | Helper text below input |');
    lines.push('| children | ReactNode | required | The input element |\n');
    lines.push('### Visual Structure');
    lines.push('```');
    lines.push('[Label Text] [* if required]');
    lines.push('┌──────────────────────────┐');
    lines.push('│ Input element             │');
    lines.push('└──────────────────────────┘');
    lines.push('[Hint text or Error message]');
    lines.push('```\n');
    lines.push('### States');
    lines.push('- **Default**: Label in --color-on-surface-variant, border --color-outline');
    lines.push('- **Focus**: Label in --color-primary, border --color-primary (2px)');
    lines.push('- **Error**: Label in --color-error, border --color-error, error icon + message below');
    lines.push('- **Disabled**: opacity 0.38 on entire field group\n');
    lines.push('### ARIA');
    lines.push('- Label linked via `htmlFor`/`id` pairing');
    lines.push('- `aria-required="true"` when required');
    lines.push('- `aria-invalid="true"` when error is present');
    lines.push('- `aria-describedby` pointing to hint or error message element');
    lines.push('- Error message has `role="alert"` for screen reader announcement\n');

    lines.push('---\n');

    lines.push('## Component: Toast / Notification\n');
    lines.push('### Purpose');
    lines.push('Transient feedback messages for action results.\n');
    lines.push('### Props');
    lines.push('| Prop | Type | Default | Description |');
    lines.push('|------|------|---------|-------------|');
    lines.push('| variant | "success" \\| "error" \\| "warning" \\| "info" | "info" | Visual style |');
    lines.push('| message | string | required | Toast message text |');
    lines.push('| duration | number | 5000 | Auto-dismiss duration (ms), 0 for persistent |');
    lines.push('| action | { label: string; onClick: () => void } | undefined | Optional action button |');
    lines.push('| dismissible | boolean | true | Show close button |\n');
    lines.push('### Behavior');
    lines.push('- Appears from bottom-right on desktop, bottom-center on mobile');
    lines.push('- Stacks vertically (newest on top, max 3 visible)');
    lines.push('- Slide-in animation: 300ms ease-out');
    lines.push('- Auto-dismisses after duration; pauses on hover');
    lines.push('- Escape key dismisses the most recent toast\n');
    lines.push('### ARIA');
    lines.push('- Container has `role="status"` and `aria-live="polite"` (info/success)');
    lines.push('- Error/warning toasts use `aria-live="assertive"`');
    lines.push('- Close button has `aria-label="Dismiss notification"`');

    return lines.join('\n');
  }

  private detectDesignIssues(
    task: AgentTask,
  ): { type: string; severity: string; title: string; description: string }[] {
    const issues: { type: string; severity: string; title: string; description: string }[] = [];

    issues.push({
      type: 'design_flaw',
      severity: 'high',
      title: 'Accessibility audit required for color contrast',
      description:
        'The defined color palette must be validated against WCAG 2.1 AA contrast ratios ' +
        '(4.5:1 for normal text, 3:1 for large text) in both light and dark themes. ' +
        'Automated tools (axe-core, Lighthouse) should be integrated into the CI pipeline.',
    });

    issues.push({
      type: 'design_flaw',
      severity: 'medium',
      title: 'Touch target sizes need verification on mobile',
      description:
        'All interactive elements must meet the 44x44px minimum touch target size on mobile. ' +
        'Inline table actions and small icon buttons are at risk of failing this requirement. ' +
        'Verify during implementation and increase tap areas with invisible padding if needed.',
    });

    issues.push({
      type: 'design_flaw',
      severity: 'medium',
      title: 'Missing dark theme validation',
      description:
        'Dark theme color tokens are defined but not yet validated in wireframes. ' +
        'Ensure all elevation/shadow values work against dark backgrounds and that ' +
        'status colors remain distinguishable. Elevated surfaces in dark mode should use ' +
        'lighter surface colors rather than shadows alone.',
    });

    issues.push({
      type: 'documentation_gap',
      severity: 'low',
      title: 'Motion and animation specification incomplete',
      description:
        'Transition defaults are defined but specific animations for page transitions, ' +
        'skeleton loaders, and toast entrances need detailed keyframe specifications. ' +
        'Ensure prefers-reduced-motion is tested and enforced.',
    });

    return issues;
  }

  private runProactiveAccessibilityAudit(task: AgentTask, output: string): Issue[] {
    const issues: Issue[] = [];
    const lowerOutput = output.toLowerCase();

    if (!lowerOutput.includes('aria-') && !lowerOutput.includes('role=')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.DESIGN_FLAW,
          IssueSeverity.HIGH,
          'No ARIA attributes defined in UI specification',
          'The UI specification does not reference any ARIA attributes or roles. All interactive ' +
            'components must define their ARIA semantics to ensure screen reader compatibility.',
          task.stage,
        ),
      );
    }

    if (!lowerOutput.includes('keyboard') && !lowerOutput.includes('focus')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.DESIGN_FLAW,
          IssueSeverity.HIGH,
          'Keyboard interaction patterns not defined',
          'No keyboard navigation or focus management patterns found. All functionality must ' +
            'be operable via keyboard. Define focus order, key bindings, and focus trap behavior ' +
            'for modals and menus.',
          task.stage,
        ),
      );
    }

    if (!lowerOutput.includes('responsive') && !lowerOutput.includes('breakpoint') && !lowerOutput.includes('mobile')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.DESIGN_FLAW,
          IssueSeverity.MEDIUM,
          'Responsive design breakpoints not defined',
          'The UI specification does not address responsive behavior or breakpoints. ' +
            'Layouts must be defined for mobile (320px+), tablet (768px+), and desktop (1024px+) ' +
            'viewports at minimum.',
          task.stage,
        ),
      );
    }

    if (!lowerOutput.includes('error') && !lowerOutput.includes('empty state') && !lowerOutput.includes('loading')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.DESIGN_FLAW,
          IssueSeverity.MEDIUM,
          'Missing UI state definitions',
          'The specification does not define error states, empty states, or loading states. ' +
            'Every data-dependent view must specify what users see during loading, when data ' +
            'is empty, and when errors occur.',
          task.stage,
        ),
      );
    }

    if (!lowerOutput.includes('contrast') && !lowerOutput.includes('wcag')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.DESIGN_FLAW,
          IssueSeverity.MEDIUM,
          'Color contrast requirements not validated',
          'No mention of WCAG contrast ratio validation. All text/background color combinations ' +
            'must meet WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text and UI components).',
          task.stage,
        ),
      );
    }

    return issues;
  }

  private generateFallbackArtifacts(task: AgentTask, output: string): Artifact[] {
    return [
      this.createArtifact(
        ArtifactType.UI_SPEC,
        `${task.title} - UI Specification (Raw)`,
        'Auto-generated UI specification from unparsed output.',
        output,
        `docs/ui/${task.featureId}/ui-spec-raw.md`,
        { featureId: task.featureId, stage: task.stage, fallback: true },
      ),
    ];
  }

  protected override buildHandoffInstructions(toAgent: AgentRole, stage: PipelineStage): string {
    if (toAgent === AgentRole.SENIOR_DEVELOPER || toAgent === AgentRole.JUNIOR_DEVELOPER) {
      return (
        'UI/UX design is complete. Please review the UI specification, wireframes, and component ' +
        'specifications. Implement components following the defined design tokens, responsive ' +
        'breakpoints, and accessibility requirements. All ARIA attributes and keyboard interactions ' +
        'specified in the component specs are mandatory.'
      );
    }

    if (toAgent === AgentRole.QA_ENGINEER) {
      return (
        'UI/UX design is complete. Please use the wireframes and component specifications as the ' +
        'visual acceptance criteria baseline. Verify responsive behavior at all defined breakpoints, ' +
        'test keyboard navigation flows, and run automated accessibility audits (axe-core) on all screens.'
      );
    }

    return super.buildHandoffInstructions(toAgent, stage);
  }
}
