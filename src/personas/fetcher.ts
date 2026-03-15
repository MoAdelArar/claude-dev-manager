/**
 * PersonaFetcher - Clones and updates the agency-agents repo.
 * Uses git sparse-checkout to only fetch configured divisions.
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type PersonasConfig, DEFAULT_PERSONAS_CONFIG } from './types';
import logger from '../utils/logger';

export interface FetchResult {
  success: boolean;
  personaCount: number;
  divisions: string[];
  commit: string;
  fromCache: boolean;
  error?: string;
}

export class PersonaFetcher {
  private config: PersonasConfig;

  constructor(config: Partial<PersonasConfig> = {}) {
    this.config = { ...DEFAULT_PERSONAS_CONFIG, ...config };
  }

  getSourceDir(projectPath: string): string {
    return path.join(projectPath, '.cdm', 'personas', 'source');
  }

  async fetchPersonas(projectPath: string): Promise<FetchResult> {
    const sourceDir = this.getSourceDir(projectPath);
    const personasDir = path.dirname(sourceDir);

    if (!fs.existsSync(personasDir)) {
      fs.mkdirSync(personasDir, { recursive: true });
    }

    if (fs.existsSync(sourceDir)) {
      return this.updatePersonas(projectPath);
    }

    return this.clonePersonas(projectPath);
  }

  async clonePersonas(projectPath: string): Promise<FetchResult> {
    const sourceDir = this.getSourceDir(projectPath);
    const repoUrl = `https://github.com/${this.config.repo}.git`;

    try {
      logger.info(`Cloning personas from ${this.config.repo}...`);

      execSync(
        `git clone --depth 1 --filter=blob:none --sparse "${repoUrl}" "${sourceDir}"`,
        { stdio: 'pipe', timeout: 60000 },
      );

      const sparseCheckoutDirs = this.config.divisions.join(' ');
      execSync(`git sparse-checkout set ${sparseCheckoutDirs}`, {
        cwd: sourceDir,
        stdio: 'pipe',
        timeout: 30000,
      });

      const commit = this.getCommitHash(sourceDir);
      const personaCount = this.countPersonaFiles(sourceDir);

      logger.info(`Fetched ${personaCount} personas from ${this.config.divisions.length} divisions`);

      return {
        success: true,
        personaCount,
        divisions: this.config.divisions,
        commit,
        fromCache: false,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to clone personas: ${errorMsg}`);

      if (fs.existsSync(sourceDir)) {
        fs.rmSync(sourceDir, { recursive: true, force: true });
      }

      return {
        success: false,
        personaCount: 0,
        divisions: [],
        commit: '',
        fromCache: false,
        error: errorMsg,
      };
    }
  }

  async updatePersonas(projectPath: string): Promise<FetchResult> {
    const sourceDir = this.getSourceDir(projectPath);

    if (!fs.existsSync(sourceDir)) {
      return this.clonePersonas(projectPath);
    }

    try {
      logger.info('Updating personas...');

      execSync('git fetch --depth 1 origin', {
        cwd: sourceDir,
        stdio: 'pipe',
        timeout: 30000,
      });

      execSync('git reset --hard origin/main', {
        cwd: sourceDir,
        stdio: 'pipe',
        timeout: 15000,
      });

      const sparseCheckoutDirs = this.config.divisions.join(' ');
      execSync(`git sparse-checkout set ${sparseCheckoutDirs}`, {
        cwd: sourceDir,
        stdio: 'pipe',
        timeout: 30000,
      });

      const commit = this.getCommitHash(sourceDir);
      const personaCount = this.countPersonaFiles(sourceDir);

      logger.info(`Updated to ${personaCount} personas (commit: ${commit.slice(0, 7)})`);

      return {
        success: true,
        personaCount,
        divisions: this.config.divisions,
        commit,
        fromCache: false,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to update personas: ${errorMsg}. Using cached version.`);

      const commit = this.getCommitHashSafe(sourceDir);
      const personaCount = this.countPersonaFiles(sourceDir);

      if (personaCount > 0) {
        return {
          success: true,
          personaCount,
          divisions: this.config.divisions,
          commit,
          fromCache: true,
          error: errorMsg,
        };
      }

      return {
        success: false,
        personaCount: 0,
        divisions: [],
        commit: '',
        fromCache: true,
        error: errorMsg,
      };
    }
  }

  private getCommitHash(sourceDir: string): string {
    try {
      return execSync('git rev-parse HEAD', {
        cwd: sourceDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();
    } catch {
      return 'unknown';
    }
  }

  private getCommitHashSafe(sourceDir: string): string {
    try {
      return this.getCommitHash(sourceDir);
    } catch {
      return 'unknown';
    }
  }

  private countPersonaFiles(sourceDir: string): number {
    let count = 0;

    for (const division of this.config.divisions) {
      const divisionDir = path.join(sourceDir, division);
      if (fs.existsSync(divisionDir)) {
        count += this.countMdFilesRecursive(divisionDir);
      }
    }

    return count;
  }

  private countMdFilesRecursive(dir: string): number {
    let count = 0;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          count += this.countMdFilesRecursive(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          count++;
        }
      }
    } catch {
      // Directory not accessible
    }

    return count;
  }

  isAvailable(projectPath: string): boolean {
    const sourceDir = this.getSourceDir(projectPath);
    return fs.existsSync(sourceDir) && this.countPersonaFiles(sourceDir) > 0;
  }

  getConfig(): PersonasConfig {
    return { ...this.config };
  }
}

export function createPersonaFetcher(config?: Partial<PersonasConfig>): PersonaFetcher {
  return new PersonaFetcher(config);
}
