import {
  AgentRole,
  PipelineStage,
  ArtifactType,
  ArtifactStatus,
  ReviewStatus,
  FeatureStatus,
  FeaturePriority,
  MessageType,
  MessagePriority,
  IssueType,
  IssueSeverity,
  IssueStatus,
  StageStatus,
  AgentStatus,
} from '../../src/types';

describe('Type Enums', () => {
  describe('AgentRole', () => {
    it('should have all 18 agent roles defined', () => {
      const roles = Object.values(AgentRole);
      expect(roles).toHaveLength(18);
      expect(roles).toContain('product_manager');
      expect(roles).toContain('business_analyst');
      expect(roles).toContain('engineering_manager');
      expect(roles).toContain('solutions_architect');
      expect(roles).toContain('system_architect');
      expect(roles).toContain('ui_designer');
      expect(roles).toContain('senior_developer');
      expect(roles).toContain('junior_developer');
      expect(roles).toContain('database_engineer');
      expect(roles).toContain('code_reviewer');
      expect(roles).toContain('qa_engineer');
      expect(roles).toContain('performance_engineer');
      expect(roles).toContain('security_engineer');
      expect(roles).toContain('compliance_officer');
      expect(roles).toContain('accessibility_specialist');
      expect(roles).toContain('sre_engineer');
      expect(roles).toContain('devops_engineer');
      expect(roles).toContain('documentation_writer');
    });
  });

  describe('PipelineStage', () => {
    it('should have all 11 pipeline stages in correct order', () => {
      const stages = Object.values(PipelineStage);
      expect(stages).toHaveLength(11);
      expect(stages[0]).toBe('requirements_gathering');
      expect(stages[stages.length - 1]).toBe('completed');
    });
  });

  describe('ArtifactType', () => {
    it('should have all artifact types defined', () => {
      const types = Object.values(ArtifactType);
      expect(types.length).toBeGreaterThanOrEqual(20);
      expect(types).toContain('requirements_doc');
      expect(types).toContain('source_code');
      expect(types).toContain('security_report');
      expect(types).toContain('deployment_plan');
    });
  });

  describe('IssueType', () => {
    it('should have all issue types', () => {
      const types = Object.values(IssueType);
      expect(types).toContain('bug');
      expect(types).toContain('security_vulnerability');
      expect(types).toContain('code_quality');
      expect(types).toContain('architecture_concern');
    });
  });

  describe('IssueSeverity', () => {
    it('should have severity levels from info to critical', () => {
      const severities = Object.values(IssueSeverity);
      expect(severities).toContain('info');
      expect(severities).toContain('low');
      expect(severities).toContain('medium');
      expect(severities).toContain('high');
      expect(severities).toContain('critical');
    });
  });

  describe('StageStatus', () => {
    it('should have all stage statuses', () => {
      expect(StageStatus.NOT_STARTED).toBe('not_started');
      expect(StageStatus.IN_PROGRESS).toBe('in_progress');
      expect(StageStatus.APPROVED).toBe('approved');
      expect(StageStatus.REVISION_NEEDED).toBe('revision_needed');
      expect(StageStatus.FAILED).toBe('failed');
    });
  });
});
