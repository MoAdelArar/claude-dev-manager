import { describe, it, expect, beforeEach } from 'bun:test';
import { SkillRegistry } from '../../src/skills/base-skill';
import { loadBuiltInSkills, BUILT_IN_SKILLS } from '../../src/skills/index';
import { AgentRole, type Skill, SkillCategory, ArtifactType } from '../../src/types';

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  describe('registerSkill', () => {
    const validSkill: Skill = {
      id: 'test-skill',
      name: 'Test Skill',
      description: 'A test skill',
      category: 'planning' as SkillCategory,
      compatibleAgents: [AgentRole.PLANNER],
      promptTemplate: 'Do the thing: {{projectName}}',
      expectedArtifacts: [ArtifactType.REQUIREMENTS_DOC],
    };

    it('registers a valid skill', () => {
      registry.registerSkill(validSkill);
      expect(registry.getSkill('test-skill')).toEqual(validSkill);
    });

    it('logs warning on duplicate skill ID (does not throw)', () => {
      registry.registerSkill(validSkill);
      registry.registerSkill(validSkill);
      expect(registry.getSkill('test-skill')).toEqual(validSkill);
    });

    it('throws on invalid skill (missing required fields)', () => {
      const invalidSkill = { id: 'bad', name: '' } as Skill;
      expect(() => registry.registerSkill(invalidSkill)).toThrow();
    });
  });

  describe('getSkill', () => {
    it('returns undefined for non-existent skill', () => {
      expect(registry.getSkill('non-existent')).toBeUndefined();
    });
  });

  describe('getSkillsForAgent', () => {
    beforeEach(() => {
      loadBuiltInSkills(registry);
    });

    it('returns skills compatible with PLANNER', () => {
      const skills = registry.getSkillsForAgent(AgentRole.PLANNER);
      expect(skills.length).toBeGreaterThan(0);
      skills.forEach((skill) => {
        expect(skill.compatibleAgents).toContain(AgentRole.PLANNER);
      });
    });

    it('returns skills compatible with DEVELOPER', () => {
      const skills = registry.getSkillsForAgent(AgentRole.DEVELOPER);
      expect(skills.length).toBeGreaterThan(0);
      skills.forEach((skill) => {
        expect(skill.compatibleAgents).toContain(AgentRole.DEVELOPER);
      });
    });

    it('returns skills compatible with REVIEWER', () => {
      const skills = registry.getSkillsForAgent(AgentRole.REVIEWER);
      expect(skills.length).toBeGreaterThan(0);
      skills.forEach((skill) => {
        expect(skill.compatibleAgents).toContain(AgentRole.REVIEWER);
      });
    });
  });

  describe('getSkillsByCategory', () => {
    beforeEach(() => {
      loadBuiltInSkills(registry);
    });

    it('returns planning skills', () => {
      const skills = registry.getSkillsByCategory('planning');
      expect(skills.length).toBeGreaterThan(0);
      skills.forEach((skill) => {
        expect(skill.category).toBe('planning');
      });
    });

    it('returns build skills', () => {
      const skills = registry.getSkillsByCategory('build');
      expect(skills.length).toBeGreaterThan(0);
      skills.forEach((skill) => {
        expect(skill.category).toBe('build');
      });
    });

    it('returns review skills', () => {
      const skills = registry.getSkillsByCategory('review');
      expect(skills.length).toBeGreaterThan(0);
      skills.forEach((skill) => {
        expect(skill.category).toBe('review');
      });
    });
  });

  describe('composePrompt', () => {
    beforeEach(() => {
      loadBuiltInSkills(registry);
    });

    it('composes prompts from multiple skills', () => {
      const projectContext = {
        language: 'typescript',
        framework: 'nextjs',
        testFramework: 'jest',
        buildTool: 'npm',
        cloudProvider: 'aws',
        projectName: 'TestProject',
        customInstructions: 'Be concise',
      };

      const prompt = registry.composePrompt(
        ['requirements-analysis', 'task-decomposition'],
        projectContext,
      );

      expect(prompt).toContain('Requirements Analysis');
      expect(prompt).toContain('Task Decomposition');
    });

    it('handles empty skill list', () => {
      const projectContext = {
        language: 'typescript',
        framework: 'react',
        testFramework: 'jest',
        buildTool: 'npm',
        cloudProvider: 'none',
        projectName: 'Test',
        customInstructions: '',
      };

      const prompt = registry.composePrompt([], projectContext);
      expect(prompt).toBe('');
    });
  });

  describe('getExpectedArtifacts', () => {
    beforeEach(() => {
      loadBuiltInSkills(registry);
    });

    it('returns expected artifacts for skills', () => {
      const artifacts = registry.getExpectedArtifacts(['requirements-analysis']);
      expect(artifacts).toContain(ArtifactType.REQUIREMENTS_DOC);
      expect(artifacts).toContain(ArtifactType.USER_STORIES);
    });

    it('deduplicates artifacts from multiple skills', () => {
      const artifacts = registry.getExpectedArtifacts([
        'code-implementation',
        'test-writing',
      ]);
      const uniqueArtifacts = [...new Set(artifacts)];
      expect(artifacts.length).toBe(uniqueArtifacts.length);
    });
  });

  describe('getRequiredInputArtifacts', () => {
    beforeEach(() => {
      loadBuiltInSkills(registry);
    });

    it('returns required input artifacts for skills', () => {
      const artifacts = registry.getRequiredInputArtifacts(['code-review']);
      expect(artifacts).toContain(ArtifactType.SOURCE_CODE);
    });

    it('returns empty array for skills with no required inputs', () => {
      const artifacts = registry.getRequiredInputArtifacts(['requirements-analysis']);
      expect(artifacts.length).toBe(0);
    });
  });
});

describe('Built-in Skills', () => {
  it('has 17 built-in skills', () => {
    expect(BUILT_IN_SKILLS.length).toBe(17);
  });

  it('all skills have unique IDs', () => {
    const ids = BUILT_IN_SKILLS.map((s) => s.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });

  it('all skills have valid categories', () => {
    const validCategories: SkillCategory[] = ['planning', 'design', 'build', 'review', 'operations'];
    BUILT_IN_SKILLS.forEach((skill) => {
      expect(validCategories).toContain(skill.category);
    });
  });

  it('all skills have at least one compatible agent', () => {
    BUILT_IN_SKILLS.forEach((skill) => {
      expect(skill.compatibleAgents.length).toBeGreaterThan(0);
    });
  });

  it('all skills have non-empty prompt templates', () => {
    BUILT_IN_SKILLS.forEach((skill) => {
      expect(skill.promptTemplate.length).toBeGreaterThan(0);
    });
  });

  it('all skills have at least one expected artifact', () => {
    BUILT_IN_SKILLS.forEach((skill) => {
      expect(skill.expectedArtifacts.length).toBeGreaterThan(0);
    });
  });

  describe('skill coverage', () => {
    const registry = new SkillRegistry();
    loadBuiltInSkills(registry);

    it('covers all 5 agent roles', () => {
      const roles = Object.values(AgentRole);
      roles.forEach((role) => {
        const skills = registry.getSkillsForAgent(role);
        expect(skills.length).toBeGreaterThan(0);
      });
    });

    it('covers all skill categories', () => {
      const categories: SkillCategory[] = ['planning', 'design', 'build', 'review', 'operations'];
      categories.forEach((category) => {
        const skills = registry.getSkillsByCategory(category);
        expect(skills.length).toBeGreaterThan(0);
      });
    });
  });
});
