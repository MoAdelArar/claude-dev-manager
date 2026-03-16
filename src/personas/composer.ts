/**
 * PromptComposer - Builds the final Claude prompt from resolved personas.
 */

import { type ResolvedPersonas, type AgentPersona } from './types.js';
import { type ProjectConfig } from '../types.js';

export interface ComposerContext {
  projectConfig: ProjectConfig;
  analysisContent?: string;
  codeStyleContent?: string;
  featureId: string;
  featureName: string;
}

export class PromptComposer {
  compose(
    resolved: ResolvedPersonas,
    context: ComposerContext,
    taskDescription: string,
  ): string {
    const sections: string[] = [];

    sections.push(this.buildIdentitySection(resolved.primary));
    sections.push(this.buildCoreInstructionsSection(resolved.primary));

    if (resolved.supporting.length > 0) {
      sections.push(this.buildSupportingSection(resolved.supporting));
    }

    sections.push(this.buildProjectContextSection(context));
    sections.push(this.buildTaskSection(taskDescription, context));

    if (resolved.reviewLens.length > 0) {
      sections.push(this.buildSelfReviewSection(resolved.reviewLens));
    }

    sections.push(this.buildOutputFormatSection());

    return sections.join('\n\n');
  }

  composeReviewPrompt(
    resolved: ResolvedPersonas,
    firstPassOutput: string,
    context: ComposerContext,
    taskDescription: string,
  ): string {
    const sections: string[] = [];

    const reviewPersona = resolved.reviewLens[0] || resolved.primary;
    sections.push(this.buildIdentitySection(reviewPersona, true));

    sections.push(`## Original Task\n${taskDescription}`);

    sections.push(`## Implementation to Review\n\n${this.truncateOutput(firstPassOutput, 15000)}`);

    sections.push(this.buildReviewInstructionsSection(resolved.reviewLens));
    sections.push(this.buildProjectContextSection(context));
    sections.push(this.buildOutputFormatSection());

    return sections.join('\n\n');
  }

  private buildIdentitySection(persona: AgentPersona, isReviewer: boolean = false): string {
    const rolePrefix = isReviewer ? 'Review' : '';
    const emoji = persona.frontmatter.emoji || '🤖';

    return `# ${emoji} You are: ${persona.frontmatter.name}${rolePrefix ? ` (${rolePrefix} Pass)` : ''}

> ${persona.frontmatter.vibe || persona.frontmatter.description}`;
  }

  private buildCoreInstructionsSection(persona: AgentPersona): string {
    const sections = this.extractSections(persona.fullContent, [
      'Identity',
      'Core Mission',
      'Critical Rules',
    ]);

    if (!sections) {
      return `## Core Instructions\n\n${persona.fullContent.slice(0, 2000)}`;
    }

    return `## Core Instructions\n\n${sections}`;
  }

  private buildSupportingSection(supporting: AgentPersona[]): string {
    const parts: string[] = ['## Supporting Expertise'];

    for (const persona of supporting) {
      const emoji = persona.frontmatter.emoji || '🤖';
      const mission = this.extractSections(persona.fullContent, ['Core Mission', 'Critical Rules']);

      parts.push(`### ${emoji} ${persona.frontmatter.name}`);
      parts.push(persona.frontmatter.description || '');

      if (mission) {
        parts.push(mission.slice(0, 800));
      }
    }

    return parts.join('\n\n');
  }

  private buildProjectContextSection(context: ComposerContext): string {
    const parts: string[] = ['## Project Context'];

    parts.push(`- **Language:** ${context.projectConfig.language || 'Not specified'}`);
    parts.push(`- **Framework:** ${context.projectConfig.framework || 'None'}`);
    parts.push(`- **Test Framework:** ${context.projectConfig.testFramework || 'None'}`);
    parts.push(`- **Build Tool:** ${context.projectConfig.buildTool || 'None'}`);
    parts.push(`- **Code Style:** ${context.projectConfig.codeStyle || 'Standard'}`);

    if (context.projectConfig.customInstructions) {
      parts.push(`\n**Custom Instructions:**\n${context.projectConfig.customInstructions}`);
    }

    if (context.codeStyleContent) {
      parts.push(`\n**Code Conventions:**\n${this.truncateOutput(context.codeStyleContent, 1000)}`);
    }

    if (context.analysisContent) {
      parts.push(`\n**Architecture Notes:**\n${this.truncateOutput(context.analysisContent, 1500)}`);
    }

    return parts.join('\n');
  }

  private buildTaskSection(taskDescription: string, context: ComposerContext): string {
    return `## Task

**Feature:** ${context.featureName} (ID: ${context.featureId})

**Description:**
${taskDescription}

Please implement this feature following the project conventions and your core instructions.`;
  }

  private buildSelfReviewSection(reviewLens: AgentPersona[]): string {
    const parts: string[] = ['## Self-Review Checklist'];
    parts.push('Before completing, verify against these criteria:');
    parts.push('');

    for (const persona of reviewLens) {
      const rules = this.extractReviewRules(persona.fullContent);
      if (rules.length > 0) {
        parts.push(`**${persona.frontmatter.name}:**`);
        for (const rule of rules.slice(0, 5)) {
          parts.push(`- [ ] ${rule}`);
        }
        parts.push('');
      }
    }

    parts.push('- [ ] Code follows project conventions');
    parts.push('- [ ] Error handling is comprehensive');
    parts.push('- [ ] Edge cases are considered');
    parts.push('- [ ] Changes are testable');

    return parts.join('\n');
  }

  private buildReviewInstructionsSection(reviewLens: AgentPersona[]): string {
    const parts: string[] = ['## Review Instructions'];

    parts.push('Analyze the implementation above for:');
    parts.push('');

    for (const persona of reviewLens) {
      parts.push(`### ${persona.frontmatter.emoji || '🔍'} ${persona.frontmatter.name} Lens`);
      const rules = this.extractReviewRules(persona.fullContent);
      for (const rule of rules.slice(0, 5)) {
        parts.push(`- ${rule}`);
      }
      parts.push('');
    }

    parts.push('Report any issues found using the ISSUE_START/ISSUE_END format below.');
    parts.push('If changes are needed, provide updated artifacts using ARTIFACT_START/ARTIFACT_END.');

    return parts.join('\n');
  }

  private buildOutputFormatSection(): string {
    return `## Output Format

When producing code or documentation, wrap each deliverable in artifact blocks:

\`\`\`
ARTIFACT_START
type: source_code
name: <descriptive name>
file: <file path>
---
<content>
ARTIFACT_END
\`\`\`

When identifying issues, use:

\`\`\`
ISSUE_START
type: <bug|security_vulnerability|performance|code_quality|missing_test|etc>
severity: <info|low|medium|high|critical>
title: <short title>
---
<detailed description>
ISSUE_END
\`\`\`

Valid artifact types: requirements_doc, architecture_doc, api_spec, data_model, source_code, unit_tests, integration_tests, code_review_report, security_report, deployment_plan, and others.

Valid issue types: bug, design_flaw, security_vulnerability, performance, code_quality, missing_test, documentation_gap, dependency_issue, architecture_concern, accessibility_violation.`;
  }

  private extractSections(content: string, sectionNames: string[]): string | null {
    const lines = content.split('\n');
    const extractedParts: string[] = [];

    for (const sectionName of sectionNames) {
      const headerPattern = new RegExp(`^##?\\s*${sectionName}`, 'i');
      let capturing = false;
      const sectionContent: string[] = [];
      let headerLevel = 0;

      for (const line of lines) {
        if (headerPattern.test(line)) {
          capturing = true;
          headerLevel = line.match(/^#+/)?.[0].length || 2;
          continue;
        }

        if (capturing) {
          const currentHeaderMatch = line.match(/^(#+)\s/);
          if (currentHeaderMatch && currentHeaderMatch[1].length <= headerLevel) {
            break;
          }
          sectionContent.push(line);
        }
      }

      if (sectionContent.length > 0) {
        extractedParts.push(sectionContent.join('\n').trim());
      }
    }

    return extractedParts.length > 0 ? extractedParts.join('\n\n') : null;
  }

  private extractReviewRules(content: string): string[] {
    const rules: string[] = [];

    const bulletPattern = /^[-*]\s+(.+?)$/gm;
    let match;

    while ((match = bulletPattern.exec(content)) !== null) {
      const rule = match[1].trim();
      if (rule.length > 10 && rule.length < 200) {
        const lowerRule = rule.toLowerCase();
        if (
          lowerRule.includes('check') ||
          lowerRule.includes('verify') ||
          lowerRule.includes('ensure') ||
          lowerRule.includes('must') ||
          lowerRule.includes('should') ||
          lowerRule.includes('review') ||
          lowerRule.includes('validate')
        ) {
          rules.push(rule);
        }
      }
    }

    const uniqueRules = [...new Set(rules)];
    return uniqueRules.slice(0, 10);
  }

  private truncateOutput(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    const truncated = content.slice(0, maxLength);
    const lastNewline = truncated.lastIndexOf('\n');

    if (lastNewline > maxLength * 0.8) {
      return truncated.slice(0, lastNewline) + '\n\n... (truncated)';
    }

    return truncated + '\n\n... (truncated)';
  }
}

export function createPromptComposer(): PromptComposer {
  return new PromptComposer();
}
