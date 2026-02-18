import {
  PipelineStage,
  StageStatus,
  StageResult,
  Artifact,
  ArtifactType,
  Issue,
  IssueSeverity,
  Feature,
} from '../types';
import { getStageConfig, getNextStage } from './stages';
import { ArtifactStore } from '../workspace/artifact-store';
import logger from '../utils/logger';

export interface TransitionResult {
  allowed: boolean;
  nextStage: PipelineStage | null;
  blockers: string[];
  warnings: string[];
}

export class TransitionEngine {
  private artifactStore: ArtifactStore;

  constructor(artifactStore: ArtifactStore) {
    this.artifactStore = artifactStore;
  }

  evaluateTransition(
    feature: Feature,
    fromStage: PipelineStage,
  ): TransitionResult {
    const config = getStageConfig(fromStage);
    if (!config) {
      return {
        allowed: false,
        nextStage: null,
        blockers: [`Unknown stage: ${fromStage}`],
        warnings: [],
      };
    }

    const stageResult = feature.stageResults.get(fromStage);
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (!stageResult) {
      blockers.push(`Stage ${fromStage} has not been executed yet`);
    } else if (
      stageResult.status !== StageStatus.APPROVED &&
      stageResult.status !== StageStatus.SKIPPED
    ) {
      blockers.push(`Stage ${fromStage} status is ${stageResult.status}, must be approved or skipped`);
    }

    if (stageResult) {
      const gateResults = this.evaluateGateConditions(config.gateConditions, stageResult, feature);
      for (const gate of gateResults) {
        if (!gate.passed && gate.required) {
          blockers.push(`Gate condition failed: ${gate.name} - ${gate.reason}`);
        } else if (!gate.passed) {
          warnings.push(`Optional gate condition not met: ${gate.name} - ${gate.reason}`);
        }
      }
    }

    for (const requiredArtifact of config.producedArtifacts) {
      const artifacts = this.artifactStore.getByType(requiredArtifact);
      if (artifacts.length === 0) {
        warnings.push(`Expected artifact not found: ${requiredArtifact}`);
      }
    }

    if (stageResult) {
      const criticalIssues = stageResult.issues.filter(
        (i: Issue) => i.severity === IssueSeverity.CRITICAL,
      );
      if (criticalIssues.length > 0) {
        blockers.push(
          `${criticalIssues.length} critical issue(s) must be resolved: ${criticalIssues.map((i: Issue) => i.title).join(', ')}`,
        );
      }

      const highIssues = stageResult.issues.filter(
        (i: Issue) => i.severity === IssueSeverity.HIGH && i.status === 'open',
      );
      if (highIssues.length > 0) {
        warnings.push(`${highIssues.length} high-severity issue(s) are still open`);
      }
    }

    const nextStage = getNextStage(fromStage);

    return {
      allowed: blockers.length === 0,
      nextStage,
      blockers,
      warnings,
    };
  }

  canSkipStage(stage: PipelineStage): boolean {
    const config = getStageConfig(stage);
    return config?.canBeSkipped ?? false;
  }

  getRequiredArtifactsForStage(stage: PipelineStage): ArtifactType[] {
    const config = getStageConfig(stage);
    return config?.requiredArtifacts ?? [];
  }

  getMissingArtifacts(stage: PipelineStage): ArtifactType[] {
    const required = this.getRequiredArtifactsForStage(stage);
    return required.filter((type) => {
      const artifacts = this.artifactStore.getByType(type);
      return artifacts.length === 0;
    });
  }

  private evaluateGateConditions(
    conditions: { name: string; description: string; validator: string; required: boolean }[],
    stageResult: StageResult,
    feature: Feature,
  ): { name: string; passed: boolean; required: boolean; reason: string }[] {
    return conditions.map((condition) => {
      const [validatorType, validatorArg] = condition.validator.split(':');
      let passed = false;
      let reason = '';

      switch (validatorType) {
        case 'hasArtifact': {
          const artifactType = validatorArg as ArtifactType;
          const found = stageResult.artifacts.some(
            (a: Artifact) => a.type === artifactType,
          ) || this.artifactStore.getByType(artifactType).length > 0;
          passed = found;
          reason = found ? '' : `Required artifact ${artifactType} not found`;
          break;
        }
        case 'noCriticalIssues': {
          const criticalCount = stageResult.issues.filter(
            (i: Issue) => i.severity === IssueSeverity.CRITICAL,
          ).length;
          passed = criticalCount === 0;
          reason = criticalCount > 0 ? `${criticalCount} critical issues found` : '';
          break;
        }
        case 'noHighIssues': {
          const highCount = stageResult.issues.filter(
            (i: Issue) =>
              i.severity === IssueSeverity.HIGH ||
              i.severity === IssueSeverity.CRITICAL,
          ).length;
          passed = highCount === 0;
          reason = highCount > 0 ? `${highCount} high/critical issues found` : '';
          break;
        }
        default:
          passed = true;
          reason = `Unknown validator: ${validatorType}`;
      }

      return { name: condition.name, passed, required: condition.required, reason };
    });
  }
}
