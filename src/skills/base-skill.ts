import { z } from 'zod';
import {
  type Skill,
  type SkillCategory,
  type SkillProjectFilter,
  type AgentRole,
  type ArtifactType,
  type ProjectConfig,
} from '../types';

// ─── Skill Validation Schema ─────────────────────────────────────────────────

const SkillProjectFilterSchema = z.object({
  languages: z.array(z.string()).optional(),
  hasUI: z.boolean().optional(),
  hasAPI: z.boolean().optional(),
  cloudProvider: z.array(z.string()).optional(),
});

const SkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(['planning', 'design', 'build', 'review', 'operations']),
  compatibleAgents: z.array(z.string()),
  promptTemplate: z.string().min(1),
  expectedArtifacts: z.array(z.string()),
  requiredInputArtifacts: z.array(z.string()).optional(),
  projectFilter: SkillProjectFilterSchema.optional(),
});

// ─── Project Context for Prompt Interpolation ────────────────────────────────

export interface ProjectContext {
  language: string;
  framework: string;
  testFramework: string;
  buildTool: string;
  cloudProvider: string;
  projectName?: string;
  customInstructions?: string;
}

// ─── Skill Registry ──────────────────────────────────────────────────────────

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  constructor() {
    // Skills are loaded lazily via registerSkill() or loadBuiltInSkills()
  }

  registerSkill(skill: Skill): void {
    const result = SkillSchema.safeParse(skill);
    if (!result.success) {
      const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`Invalid skill "${skill.id}": ${errors.join(', ')}`);
    }
    this.skills.set(skill.id, skill);
  }

  registerSkills(skills: Skill[]): void {
    for (const skill of skills) {
      this.registerSkill(skill);
    }
  }

  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  getSkillOrThrow(id: string): Skill {
    const skill = this.skills.get(id);
    if (!skill) {
      throw new Error(`Skill not found: ${id}`);
    }
    return skill;
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  getSkillsForAgent(role: AgentRole): Skill[] {
    return this.getAllSkills().filter((skill) =>
      skill.compatibleAgents.includes(role),
    );
  }

  getSkillsByCategory(category: SkillCategory): Skill[] {
    return this.getAllSkills().filter((skill) => skill.category === category);
  }

  getSkillIds(): string[] {
    return Array.from(this.skills.keys());
  }

  hasSkill(id: string): boolean {
    return this.skills.has(id);
  }

  /**
   * Compose a prompt from multiple skills by concatenating their promptTemplates
   * and interpolating project context placeholders.
   */
  composePrompt(skillIds: string[], projectContext: ProjectContext): string {
    const sections: string[] = [];

    for (const id of skillIds) {
      const skill = this.getSkill(id);
      if (!skill) {
        continue;
      }
      const interpolated = this.interpolateTemplate(skill.promptTemplate, projectContext);
      sections.push(`## ${skill.name}\n\n${interpolated}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Get the union of expected artifacts from multiple skills.
   */
  getExpectedArtifacts(skillIds: string[]): ArtifactType[] {
    const artifacts = new Set<ArtifactType>();

    for (const id of skillIds) {
      const skill = this.getSkill(id);
      if (skill) {
        for (const artifact of skill.expectedArtifacts) {
          artifacts.add(artifact as ArtifactType);
        }
      }
    }

    return Array.from(artifacts);
  }

  /**
   * Get the union of required input artifacts from multiple skills.
   */
  getRequiredInputArtifacts(skillIds: string[]): ArtifactType[] {
    const artifacts = new Set<ArtifactType>();

    for (const id of skillIds) {
      const skill = this.getSkill(id);
      if (skill?.requiredInputArtifacts) {
        for (const artifact of skill.requiredInputArtifacts) {
          artifacts.add(artifact as ArtifactType);
        }
      }
    }

    return Array.from(artifacts);
  }

  /**
   * Filter skills based on project characteristics.
   */
  filterSkillsForProject(
    skills: Skill[],
    projectConfig: ProjectConfig,
  ): Skill[] {
    return skills.filter((skill) => {
      if (!skill.projectFilter) {
        return true;
      }

      const filter = skill.projectFilter;

      if (filter.languages && filter.languages.length > 0) {
        if (!filter.languages.includes(projectConfig.language)) {
          return false;
        }
      }

      if (filter.cloudProvider && filter.cloudProvider.length > 0) {
        if (!filter.cloudProvider.includes(projectConfig.cloudProvider)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Interpolate placeholders in a template with project context values.
   * Supported placeholders: {language}, {framework}, {testFramework}, {buildTool},
   * {cloudProvider}, {projectName}, {customInstructions}
   */
  private interpolateTemplate(template: string, context: ProjectContext): string {
    return template
      .replace(/\{language\}/g, context.language || 'unknown')
      .replace(/\{framework\}/g, context.framework || 'none')
      .replace(/\{testFramework\}/g, context.testFramework || 'unknown')
      .replace(/\{buildTool\}/g, context.buildTool || 'unknown')
      .replace(/\{cloudProvider\}/g, context.cloudProvider || 'none')
      .replace(/\{projectName\}/g, context.projectName || 'project')
      .replace(/\{customInstructions\}/g, context.customInstructions || '');
  }

  /**
   * Validate that all skill IDs exist in the registry.
   */
  validateSkillIds(skillIds: string[]): { valid: boolean; missing: string[] } {
    const missing = skillIds.filter((id) => !this.hasSkill(id));
    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Get a summary of all registered skills for display.
   */
  getSummary(): Array<{ id: string; name: string; category: SkillCategory; agents: string[] }> {
    return this.getAllSkills().map((skill) => ({
      id: skill.id,
      name: skill.name,
      category: skill.category,
      agents: skill.compatibleAgents as string[],
    }));
  }

  /**
   * Clear all registered skills (useful for testing).
   */
  clear(): void {
    this.skills.clear();
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

let defaultRegistry: SkillRegistry | null = null;

export function getDefaultSkillRegistry(): SkillRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new SkillRegistry();
  }
  return defaultRegistry;
}

export function resetDefaultSkillRegistry(): void {
  defaultRegistry = null;
}
