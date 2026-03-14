import * as fs from 'node:fs';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import {
  type Artifact,
  ArtifactType,
  type ArtifactStatus,
  type ReviewStatus,
  type AgentRole,
} from '../types';
import logger from '../utils/logger';

const SKILL_ARTIFACT_MAP: Record<string, ArtifactType[]> = {
  // Planning skills
  'requirements-analysis': [
    ArtifactType.REQUIREMENTS_DOC,
    ArtifactType.USER_STORIES,
    ArtifactType.ACCEPTANCE_CRITERIA,
  ],
  'task-decomposition': [
    ArtifactType.TASK_LIST,
    ArtifactType.EXECUTION_PLAN,
  ],
  // Design skills
  'system-design': [
    ArtifactType.ARCHITECTURE_DOC,
    ArtifactType.SYSTEM_DIAGRAM,
  ],
  'api-design': [
    ArtifactType.API_SPEC,
    ArtifactType.API_DOCUMENTATION,
  ],
  'data-modeling': [
    ArtifactType.DATABASE_SCHEMA,
    ArtifactType.DATA_MODEL,
  ],
  'ui-design': [
    ArtifactType.UI_SPEC,
    ArtifactType.WIREFRAME,
    ArtifactType.COMPONENT_SPEC,
  ],
  // Build skills
  'code-implementation': [
    ArtifactType.SOURCE_CODE,
  ],
  'test-writing': [
    ArtifactType.UNIT_TESTS,
    ArtifactType.INTEGRATION_TESTS,
    ArtifactType.E2E_TESTS,
    ArtifactType.TEST_REPORT,
  ],
  'documentation': [
    ArtifactType.API_DOCUMENTATION,
    ArtifactType.USER_DOCUMENTATION,
    ArtifactType.DEVELOPER_DOCUMENTATION,
    ArtifactType.CHANGELOG,
  ],
  // Review skills
  'code-review': [
    ArtifactType.CODE_REVIEW_REPORT,
  ],
  'security-audit': [
    ArtifactType.SECURITY_REPORT,
  ],
  'performance-analysis': [
    ArtifactType.PERFORMANCE_REPORT,
  ],
  'accessibility-audit': [
    ArtifactType.ACCESSIBILITY_REPORT,
  ],
  'test-validation': [
    ArtifactType.TEST_REPORT,
  ],
  // Operations skills
  'ci-cd': [
    ArtifactType.CI_CD_CONFIG,
  ],
  'deployment': [
    ArtifactType.DEPLOYMENT_PLAN,
    ArtifactType.INFRASTRUCTURE_CONFIG,
    ArtifactType.RUNBOOK,
  ],
  'monitoring': [
    ArtifactType.MONITORING_CONFIG,
  ],
};

export class ArtifactStore {
  private artifacts: Map<string, Artifact> = new Map();
  private readonly storageDir: string;

  constructor(projectPath: string) {
    this.storageDir = path.join(projectPath, '.cdm', 'artifacts');
    this.ensureStorageDir();
    this.loadFromDisk();
  }

  store(artifact: Artifact): Artifact {
    if (!artifact.id) {
      artifact.id = uuidv4();
    }

    const existing = this.findByTypeAndName(artifact.type, artifact.name);
    if (existing) {
      artifact.version = existing.version + 1;
      artifact.updatedAt = new Date();
      logger.info(`Updating artifact "${artifact.name}" to v${artifact.version}`);
    }

    this.artifacts.set(artifact.id, artifact);
    this.persistToDisk(artifact);
    return artifact;
  }

  get(id: string): Artifact | undefined {
    return this.artifacts.get(id);
  }

  getByType(type: ArtifactType): Artifact[] {
    return Array.from(this.artifacts.values())
      .filter((a) => a.type === type)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  getByCreator(role: AgentRole): Artifact[] {
    return Array.from(this.artifacts.values())
      .filter((a) => a.createdBy === role)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  getByStatus(status: ArtifactStatus): Artifact[] {
    return Array.from(this.artifacts.values()).filter((a) => a.status === status);
  }

  getLatestByType(type: ArtifactType): Artifact | undefined {
    const artifacts = this.getByType(type);
    return artifacts.length > 0 ? artifacts[0] : undefined;
  }

  getById(id: string): Artifact | undefined {
    return this.artifacts.get(id);
  }

  getByName(name: string): Artifact | undefined {
    const lower = name.toLowerCase();
    return Array.from(this.artifacts.values()).find(
      (a) => a.name.toLowerCase() === lower || a.name.toLowerCase().includes(lower),
    );
  }

  getAll(): Artifact[] {
    return Array.from(this.artifacts.values());
  }

  getForSkills(skillIds: string[]): Artifact[] {
    const types = new Set<ArtifactType>();
    for (const skillId of skillIds) {
      const skillTypes = SKILL_ARTIFACT_MAP[skillId];
      if (skillTypes) {
        for (const type of skillTypes) {
          types.add(type);
        }
      }
    }
    return Array.from(types).flatMap((type) => this.getByType(type));
  }

  getForTypes(types: ArtifactType[]): Artifact[] {
    return types.flatMap((type) => this.getByType(type));
  }

  updateStatus(id: string, status: ArtifactStatus): void {
    const artifact = this.artifacts.get(id);
    if (artifact) {
      artifact.status = status;
      artifact.updatedAt = new Date();
      this.persistToDisk(artifact);
    }
  }

  updateReviewStatus(id: string, reviewStatus: ReviewStatus): void {
    const artifact = this.artifacts.get(id);
    if (artifact) {
      artifact.reviewStatus = reviewStatus;
      artifact.updatedAt = new Date();
      this.persistToDisk(artifact);
    }
  }

  remove(id: string): boolean {
    const artifact = this.artifacts.get(id);
    if (!artifact) return false;

    this.artifacts.delete(id);
    const filePath = this.getStoragePath(artifact);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  }

  clear(): void {
    this.artifacts.clear();
    if (fs.existsSync(this.storageDir)) {
      const files = fs.readdirSync(this.storageDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.storageDir, file));
        }
      }
    }
  }

  getSummary(): { total: number; byType: Record<string, number>; byStatus: Record<string, number> } {
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const artifact of this.artifacts.values()) {
      byType[artifact.type] = (byType[artifact.type] ?? 0) + 1;
      byStatus[artifact.status] = (byStatus[artifact.status] ?? 0) + 1;
    }

    return { total: this.artifacts.size, byType, byStatus };
  }

  private findByTypeAndName(type: ArtifactType, name: string): Artifact | undefined {
    return Array.from(this.artifacts.values()).find(
      (a) => a.type === type && a.name === name,
    );
  }

  private ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private getStoragePath(artifact: Artifact): string {
    return path.join(this.storageDir, `${artifact.id}.json`);
  }

  private persistToDisk(artifact: Artifact): void {
    try {
      const filePath = this.getStoragePath(artifact);
      const serialized = JSON.stringify(artifact, null, 2);
      fs.writeFileSync(filePath, serialized, 'utf-8');
    } catch (error) {
      logger.error(`Failed to persist artifact ${artifact.id}: ${error}`);
    }
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.storageDir)) return;

      const files = fs.readdirSync(this.storageDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.storageDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const artifact = JSON.parse(content) as Artifact;

        artifact.createdAt = new Date(artifact.createdAt);
        artifact.updatedAt = new Date(artifact.updatedAt);

        this.artifacts.set(artifact.id, artifact);
      }

      logger.debug(`Loaded ${this.artifacts.size} artifacts from disk`);
    } catch (error) {
      logger.error(`Failed to load artifacts from disk: ${error}`);
    }
  }
}
