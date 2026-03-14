import { type Skill, AgentRole, ArtifactType } from '../types';

export const accessibilityAuditSkill: Skill = {
  id: 'accessibility-audit',
  name: 'Accessibility Audit',
  description: 'Audit UI for WCAG 2.1 AA compliance, screen reader support, and keyboard navigation',
  category: 'review',
  compatibleAgents: [AgentRole.REVIEWER],
  promptTemplate: `Audit the UI code for accessibility compliance.

Check against WCAG 2.1 AA:

1. **Perceivable**
   - Text alternatives for images (alt text)
   - Captions for multimedia
   - Color contrast (4.5:1 for text, 3:1 for large text)
   - Content readable without CSS
   - Text resizable to 200%

2. **Operable**
   - All functionality via keyboard
   - No keyboard traps
   - Skip navigation links
   - Focus indicators visible
   - Sufficient time for interactions
   - No seizure-inducing content

3. **Understandable**
   - Language declared
   - Consistent navigation
   - Error identification and suggestions
   - Labels for all inputs

4. **Robust**
   - Valid HTML
   - Proper ARIA usage
   - Compatible with assistive tech

Specific checks:
- Form labels and fieldsets
- Button and link text meaningful
- Heading hierarchy (h1 → h2 → h3)
- Landmark regions (main, nav, aside)
- Focus management in modals/dialogs
- Loading state announcements

For each issue:
- WCAG criterion violated (e.g., 1.1.1)
- Severity: critical / serious / moderate / minor
- Element/component affected
- How to fix

Test with screen reader mental model.
Provide code examples for fixes.`,
  expectedArtifacts: [ArtifactType.ACCESSIBILITY_REPORT],
  requiredInputArtifacts: [ArtifactType.SOURCE_CODE],
  projectFilter: {
    hasUI: true,
  },
};
