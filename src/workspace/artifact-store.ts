/**
 * Artifact storage and retrieval for CDM.
 * Refactored for dynamic persona system.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import {
  type Artifact,
  type ArtifactType,
  type ArtifactStatus,
  type ReviewStatus,
} from '../types.js';
import logger from '../utils/logger.js';

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

  getByCreator(personaId: string): Artifact[] {
    return Array.from(this.artifacts.values())
      .filter((a) => a.createdBy === personaId)
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

  getForFeature(featureId: string): Artifact[] {
    return Array.from(this.artifacts.values())
      .filter((a) => (a.metadata as any)?.featureId === featureId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
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
