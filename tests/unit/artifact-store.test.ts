import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  Artifact,
  ArtifactType,
  ArtifactStatus,
  ReviewStatus,
  AgentRole,
  PipelineStage,
} from '../../src/types';
import { ArtifactStore } from '../../src/workspace/artifact-store';

function createTestArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    type: ArtifactType.REQUIREMENTS_DOC,
    name: 'Test Artifact',
    description: 'A test artifact',
    filePath: 'test/artifact.md',
    createdBy: AgentRole.PRODUCT_MANAGER,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    content: 'Test content',
    metadata: {},
    status: ArtifactStatus.DRAFT,
    reviewStatus: ReviewStatus.PENDING,
    ...overrides,
  };
}

describe('ArtifactStore', () => {
  let store: ArtifactStore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-test-'));
    store = new ArtifactStore(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('store', () => {
    it('should store and retrieve an artifact', () => {
      const artifact = createTestArtifact();
      const stored = store.store(artifact);
      expect(stored.id).toBe(artifact.id);

      const retrieved = store.get(artifact.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('Test Artifact');
    });

    it('should increment version on duplicate name+type', () => {
      const artifact1 = createTestArtifact({ id: 'a1', name: 'Shared Name' });
      store.store(artifact1);

      const artifact2 = createTestArtifact({ id: 'a2', name: 'Shared Name' });
      const stored = store.store(artifact2);
      expect(stored.version).toBe(2);
    });

    it('should persist artifacts to disk', () => {
      const artifact = createTestArtifact();
      store.store(artifact);

      const diskPath = path.join(tempDir, '.cdm', 'artifacts', `${artifact.id}.json`);
      expect(fs.existsSync(diskPath)).toBe(true);
    });
  });

  describe('getByType', () => {
    it('should filter artifacts by type', () => {
      store.store(createTestArtifact({ type: ArtifactType.REQUIREMENTS_DOC }));
      store.store(createTestArtifact({ type: ArtifactType.SOURCE_CODE }));
      store.store(createTestArtifact({ type: ArtifactType.REQUIREMENTS_DOC }));

      const reqDocs = store.getByType(ArtifactType.REQUIREMENTS_DOC);
      expect(reqDocs).toHaveLength(2);

      const sourceCode = store.getByType(ArtifactType.SOURCE_CODE);
      expect(sourceCode).toHaveLength(1);
    });
  });

  describe('getByCreator', () => {
    it('should filter artifacts by creator role', () => {
      store.store(createTestArtifact({ createdBy: AgentRole.PRODUCT_MANAGER }));
      store.store(createTestArtifact({ createdBy: AgentRole.SENIOR_DEVELOPER }));

      const pmArtifacts = store.getByCreator(AgentRole.PRODUCT_MANAGER);
      expect(pmArtifacts).toHaveLength(1);
    });
  });

  describe('getLatestByType', () => {
    it('should return the most recently updated artifact of a type', () => {
      const older = createTestArtifact({
        updatedAt: new Date('2025-01-01'),
        name: 'Older',
      });
      const newer = createTestArtifact({
        updatedAt: new Date('2025-06-01'),
        name: 'Newer',
      });

      store.store(older);
      store.store(newer);

      const latest = store.getLatestByType(ArtifactType.REQUIREMENTS_DOC);
      expect(latest).toBeDefined();
      expect(latest!.name).toBe('Newer');
    });

    it('should return undefined for missing type', () => {
      const latest = store.getLatestByType(ArtifactType.SECURITY_REPORT);
      expect(latest).toBeUndefined();
    });
  });

  describe('updateStatus', () => {
    it('should update artifact status', () => {
      const artifact = createTestArtifact();
      store.store(artifact);

      store.updateStatus(artifact.id, ArtifactStatus.APPROVED);

      const updated = store.get(artifact.id);
      expect(updated!.status).toBe(ArtifactStatus.APPROVED);
    });
  });

  describe('updateReviewStatus', () => {
    it('should update review status', () => {
      const artifact = createTestArtifact();
      store.store(artifact);

      store.updateReviewStatus(artifact.id, ReviewStatus.APPROVED);

      const updated = store.get(artifact.id);
      expect(updated!.reviewStatus).toBe(ReviewStatus.APPROVED);
    });
  });

  describe('remove', () => {
    it('should remove an artifact', () => {
      const artifact = createTestArtifact();
      store.store(artifact);

      const removed = store.remove(artifact.id);
      expect(removed).toBe(true);
      expect(store.get(artifact.id)).toBeUndefined();
    });

    it('should return false for non-existent artifact', () => {
      const removed = store.remove('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all artifacts', () => {
      store.store(createTestArtifact());
      store.store(createTestArtifact());

      store.clear();
      expect(store.getAll()).toHaveLength(0);
    });
  });

  describe('getSummary', () => {
    it('should return correct summary statistics', () => {
      store.store(createTestArtifact({ type: ArtifactType.REQUIREMENTS_DOC }));
      store.store(createTestArtifact({ type: ArtifactType.SOURCE_CODE, status: ArtifactStatus.APPROVED }));
      store.store(createTestArtifact({ type: ArtifactType.REQUIREMENTS_DOC }));

      const summary = store.getSummary();
      expect(summary.total).toBe(3);
      expect(summary.byType[ArtifactType.REQUIREMENTS_DOC]).toBe(2);
      expect(summary.byType[ArtifactType.SOURCE_CODE]).toBe(1);
      expect(summary.byStatus[ArtifactStatus.DRAFT]).toBe(2);
      expect(summary.byStatus[ArtifactStatus.APPROVED]).toBe(1);
    });
  });

  describe('persistence', () => {
    it('should reload artifacts from disk on new instance', () => {
      const artifact = createTestArtifact({ name: 'Persistent' });
      store.store(artifact);

      const newStore = new ArtifactStore(tempDir);
      const loaded = newStore.get(artifact.id);
      expect(loaded).toBeDefined();
      expect(loaded!.name).toBe('Persistent');
    });
  });

  describe('getForStage', () => {
    it('should return artifacts relevant to a pipeline stage', () => {
      store.store(createTestArtifact({ type: ArtifactType.REQUIREMENTS_DOC }));
      store.store(createTestArtifact({ type: ArtifactType.USER_STORIES }));
      store.store(createTestArtifact({ type: ArtifactType.SOURCE_CODE }));

      const reqStage = store.getForStage(PipelineStage.REQUIREMENTS_GATHERING);
      expect(reqStage.length).toBeGreaterThanOrEqual(2);

      const implStage = store.getForStage(PipelineStage.IMPLEMENTATION);
      expect(implStage.length).toBeGreaterThanOrEqual(1);
    });
  });
});
