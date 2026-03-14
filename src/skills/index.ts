export {
  SkillRegistry,
  getDefaultSkillRegistry,
  resetDefaultSkillRegistry,
  type ProjectContext,
} from './base-skill';

// Re-export skill types from types.ts
export type { Skill, SkillCategory, SkillProjectFilter } from '../types';

// ─── Built-in Skill Imports ──────────────────────────────────────────────────

import { requirementsAnalysisSkill } from './requirements-analysis';
import { taskDecompositionSkill } from './task-decomposition';
import { systemDesignSkill } from './system-design';
import { apiDesignSkill } from './api-design';
import { dataModelingSkill } from './data-modeling';
import { uiDesignSkill } from './ui-design';
import { codeImplementationSkill } from './code-implementation';
import { testWritingSkill } from './test-writing';
import { documentationSkill } from './documentation';
import { codeReviewSkill } from './code-review';
import { securityAuditSkill } from './security-audit';
import { performanceAnalysisSkill } from './performance-analysis';
import { accessibilityAuditSkill } from './accessibility-audit';
import { testValidationSkill } from './test-validation';
import { ciCdSkill } from './ci-cd';
import { deploymentSkill } from './deployment';
import { monitoringSkill } from './monitoring';

import { SkillRegistry, getDefaultSkillRegistry } from './base-skill';
import type { Skill } from '../types';

// ─── All Built-in Skills ─────────────────────────────────────────────────────

export const BUILT_IN_SKILLS: Skill[] = [
  // Planning
  requirementsAnalysisSkill,
  taskDecompositionSkill,
  // Design
  systemDesignSkill,
  apiDesignSkill,
  dataModelingSkill,
  uiDesignSkill,
  // Build
  codeImplementationSkill,
  testWritingSkill,
  documentationSkill,
  // Review
  codeReviewSkill,
  securityAuditSkill,
  performanceAnalysisSkill,
  accessibilityAuditSkill,
  testValidationSkill,
  // Operations
  ciCdSkill,
  deploymentSkill,
  monitoringSkill,
];

// ─── Skill ID Constants ──────────────────────────────────────────────────────

export const SKILL_IDS = {
  // Planning
  REQUIREMENTS_ANALYSIS: 'requirements-analysis',
  TASK_DECOMPOSITION: 'task-decomposition',
  // Design
  SYSTEM_DESIGN: 'system-design',
  API_DESIGN: 'api-design',
  DATA_MODELING: 'data-modeling',
  UI_DESIGN: 'ui-design',
  // Build
  CODE_IMPLEMENTATION: 'code-implementation',
  TEST_WRITING: 'test-writing',
  DOCUMENTATION: 'documentation',
  // Review
  CODE_REVIEW: 'code-review',
  SECURITY_AUDIT: 'security-audit',
  PERFORMANCE_ANALYSIS: 'performance-analysis',
  ACCESSIBILITY_AUDIT: 'accessibility-audit',
  TEST_VALIDATION: 'test-validation',
  // Operations
  CI_CD: 'ci-cd',
  DEPLOYMENT: 'deployment',
  MONITORING: 'monitoring',
} as const;

// ─── Load Built-in Skills into Registry ──────────────────────────────────────

export function loadBuiltInSkills(registry?: SkillRegistry): SkillRegistry {
  const reg = registry ?? getDefaultSkillRegistry();
  reg.registerSkills(BUILT_IN_SKILLS);
  return reg;
}

// ─── Create Pre-loaded Registry ──────────────────────────────────────────────

export function createSkillRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  loadBuiltInSkills(registry);
  return registry;
}

// ─── Re-export Individual Skills ─────────────────────────────────────────────

export {
  requirementsAnalysisSkill,
  taskDecompositionSkill,
  systemDesignSkill,
  apiDesignSkill,
  dataModelingSkill,
  uiDesignSkill,
  codeImplementationSkill,
  testWritingSkill,
  documentationSkill,
  codeReviewSkill,
  securityAuditSkill,
  performanceAnalysisSkill,
  accessibilityAuditSkill,
  testValidationSkill,
  ciCdSkill,
  deploymentSkill,
  monitoringSkill,
};
