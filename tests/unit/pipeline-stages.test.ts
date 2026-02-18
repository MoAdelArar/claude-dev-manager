import {
  getStageConfig,
  getAllStageConfigs,
  getStagesInOrder,
  getNextStage,
  getPreviousStage,
  isTerminalStage,
} from '../../src/pipeline/stages';
import { PipelineStage, AgentRole, ArtifactType } from '../../src/types';

describe('Pipeline Stages', () => {
  describe('getStageConfig', () => {
    it('should return config for each valid stage', () => {
      const stages = [
        PipelineStage.REQUIREMENTS_GATHERING,
        PipelineStage.ARCHITECTURE_DESIGN,
        PipelineStage.UI_UX_DESIGN,
        PipelineStage.TASK_BREAKDOWN,
        PipelineStage.IMPLEMENTATION,
        PipelineStage.CODE_REVIEW,
        PipelineStage.TESTING,
        PipelineStage.SECURITY_REVIEW,
        PipelineStage.DOCUMENTATION,
        PipelineStage.DEPLOYMENT,
      ];

      for (const stage of stages) {
        const config = getStageConfig(stage);
        expect(config).toBeDefined();
        expect(config!.stage).toBe(stage);
        expect(config!.primaryAgent).toBeDefined();
        expect(config!.name).toBeTruthy();
      }
    });

    it('should assign correct primary agents', () => {
      expect(getStageConfig(PipelineStage.REQUIREMENTS_GATHERING)!.primaryAgent).toBe(AgentRole.PRODUCT_MANAGER);
      expect(getStageConfig(PipelineStage.ARCHITECTURE_DESIGN)!.primaryAgent).toBe(AgentRole.SYSTEM_ARCHITECT);
      expect(getStageConfig(PipelineStage.UI_UX_DESIGN)!.primaryAgent).toBe(AgentRole.UI_DESIGNER);
      expect(getStageConfig(PipelineStage.TASK_BREAKDOWN)!.primaryAgent).toBe(AgentRole.ENGINEERING_MANAGER);
      expect(getStageConfig(PipelineStage.IMPLEMENTATION)!.primaryAgent).toBe(AgentRole.SENIOR_DEVELOPER);
      expect(getStageConfig(PipelineStage.CODE_REVIEW)!.primaryAgent).toBe(AgentRole.CODE_REVIEWER);
      expect(getStageConfig(PipelineStage.TESTING)!.primaryAgent).toBe(AgentRole.QA_ENGINEER);
      expect(getStageConfig(PipelineStage.SECURITY_REVIEW)!.primaryAgent).toBe(AgentRole.SECURITY_ENGINEER);
      expect(getStageConfig(PipelineStage.DOCUMENTATION)!.primaryAgent).toBe(AgentRole.DOCUMENTATION_WRITER);
      expect(getStageConfig(PipelineStage.DEPLOYMENT)!.primaryAgent).toBe(AgentRole.DEVOPS_ENGINEER);
    });

    it('should have gate conditions for each stage', () => {
      const configs = getAllStageConfigs();
      for (const config of configs) {
        expect(config.gateConditions.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getAllStageConfigs', () => {
    it('should return 10 stage configs (excluding COMPLETED)', () => {
      const configs = getAllStageConfigs();
      expect(configs).toHaveLength(10);
    });
  });

  describe('getStagesInOrder', () => {
    it('should return stages in pipeline order', () => {
      const stages = getStagesInOrder();
      expect(stages[0]).toBe(PipelineStage.REQUIREMENTS_GATHERING);
      expect(stages[1]).toBe(PipelineStage.ARCHITECTURE_DESIGN);
      expect(stages[2]).toBe(PipelineStage.UI_UX_DESIGN);
      expect(stages[9]).toBe(PipelineStage.DEPLOYMENT);
    });
  });

  describe('getNextStage', () => {
    it('should return the correct next stage', () => {
      expect(getNextStage(PipelineStage.REQUIREMENTS_GATHERING)).toBe(PipelineStage.ARCHITECTURE_DESIGN);
      expect(getNextStage(PipelineStage.ARCHITECTURE_DESIGN)).toBe(PipelineStage.UI_UX_DESIGN);
      expect(getNextStage(PipelineStage.IMPLEMENTATION)).toBe(PipelineStage.CODE_REVIEW);
    });

    it('should return null for the last stage', () => {
      expect(getNextStage(PipelineStage.DEPLOYMENT)).toBeNull();
    });
  });

  describe('getPreviousStage', () => {
    it('should return the correct previous stage', () => {
      expect(getPreviousStage(PipelineStage.ARCHITECTURE_DESIGN)).toBe(PipelineStage.REQUIREMENTS_GATHERING);
      expect(getPreviousStage(PipelineStage.DEPLOYMENT)).toBe(PipelineStage.DOCUMENTATION);
    });

    it('should return null for the first stage', () => {
      expect(getPreviousStage(PipelineStage.REQUIREMENTS_GATHERING)).toBeNull();
    });
  });

  describe('isTerminalStage', () => {
    it('should identify terminal stages', () => {
      expect(isTerminalStage(PipelineStage.DEPLOYMENT)).toBe(true);
      expect(isTerminalStage(PipelineStage.COMPLETED)).toBe(true);
    });

    it('should identify non-terminal stages', () => {
      expect(isTerminalStage(PipelineStage.REQUIREMENTS_GATHERING)).toBe(false);
      expect(isTerminalStage(PipelineStage.IMPLEMENTATION)).toBe(false);
    });
  });

  describe('stage skippability', () => {
    it('should mark mandatory stages as non-skippable', () => {
      expect(getStageConfig(PipelineStage.REQUIREMENTS_GATHERING)!.canBeSkipped).toBe(false);
      expect(getStageConfig(PipelineStage.ARCHITECTURE_DESIGN)!.canBeSkipped).toBe(false);
      expect(getStageConfig(PipelineStage.IMPLEMENTATION)!.canBeSkipped).toBe(false);
      expect(getStageConfig(PipelineStage.CODE_REVIEW)!.canBeSkipped).toBe(false);
      expect(getStageConfig(PipelineStage.TESTING)!.canBeSkipped).toBe(false);
    });

    it('should mark optional stages as skippable', () => {
      expect(getStageConfig(PipelineStage.UI_UX_DESIGN)!.canBeSkipped).toBe(true);
      expect(getStageConfig(PipelineStage.SECURITY_REVIEW)!.canBeSkipped).toBe(true);
      expect(getStageConfig(PipelineStage.DOCUMENTATION)!.canBeSkipped).toBe(true);
      expect(getStageConfig(PipelineStage.DEPLOYMENT)!.canBeSkipped).toBe(true);
    });
  });

  describe('stage artifact requirements', () => {
    it('should have no required artifacts for requirements gathering', () => {
      const config = getStageConfig(PipelineStage.REQUIREMENTS_GATHERING)!;
      expect(config.requiredArtifacts).toHaveLength(0);
    });

    it('should require requirements for architecture design', () => {
      const config = getStageConfig(PipelineStage.ARCHITECTURE_DESIGN)!;
      expect(config.requiredArtifacts).toContain(ArtifactType.REQUIREMENTS_DOC);
    });

    it('should require source code for code review', () => {
      const config = getStageConfig(PipelineStage.CODE_REVIEW)!;
      expect(config.requiredArtifacts).toContain(ArtifactType.SOURCE_CODE);
    });
  });
});
