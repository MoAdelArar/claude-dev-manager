import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import logger from './logger';

export interface RtkGainStats {
  totalCommands: number;
  tokensSaved: number;
  savingsPercent: number;
}

export interface RtkInitResult {
  installed: boolean;
  hookActive: boolean;
  message: string;
}

let rtkInstalledCache: boolean | null = null;

export function isRtkInstalled(rtkPath: string = 'rtk'): boolean {
  if (rtkInstalledCache !== null) return rtkInstalledCache;
  try {
    execSync(`${rtkPath} --version`, { stdio: 'pipe', timeout: 3000 });
    rtkInstalledCache = true;
  } catch {
    rtkInstalledCache = false;
  }
  return rtkInstalledCache;
}

export function isRtkHookActive(): boolean {
  try {
    const claudeDir = path.join(os.homedir(), '.claude');
    const settingsPath = path.join(claudeDir, 'settings.json');
    if (!fs.existsSync(settingsPath)) return false;

    const content = fs.readFileSync(settingsPath, 'utf-8');
    return content.includes('rtk') && content.includes('PreToolUse');
  } catch {
    return false;
  }
}

export function ensureRtkInitialized(rtkPath: string = 'rtk'): RtkInitResult {
  if (!isRtkInstalled(rtkPath)) {
    return { installed: false, hookActive: false, message: 'rtk not installed' };
  }

  if (isRtkHookActive()) {
    return { installed: true, hookActive: true, message: 'RTK hook already active' };
  }

  try {
    execSync(`${rtkPath} init --global`, { stdio: 'pipe', timeout: 10000 });
    const nowActive = isRtkHookActive();
    return {
      installed: true,
      hookActive: nowActive,
      message: nowActive ? 'RTK hook activated' : 'RTK init ran but hook not detected',
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.debug(`rtk init failed: ${msg}`);
    return { installed: true, hookActive: false, message: 'RTK init failed' };
  }
}

export function getRtkGain(rtkPath: string = 'rtk'): RtkGainStats | null {
  if (!isRtkInstalled(rtkPath)) return null;

  try {
    const output = execSync(`${rtkPath} gain`, { stdio: 'pipe', timeout: 5000 }).toString();
    const savedMatch = output.match(/Tokens saved:\s*([\d,.]+[KMB]?)\s*\((\d+(?:\.\d+)?)%\)/i);
    const commandsMatch = output.match(/Total commands:\s*([\d,]+)/i);

    if (!savedMatch || !commandsMatch) return null;

    const parseTokens = (s: string): number => {
      const num = parseFloat(s.replace(/,/g, ''));
      if (s.endsWith('K')) return num * 1000;
      if (s.endsWith('M')) return num * 1_000_000;
      if (s.endsWith('B')) return num * 1_000_000_000;
      return num;
    };

    return {
      totalCommands: parseInt(commandsMatch[1].replace(/,/g, ''), 10),
      tokensSaved: Math.round(parseTokens(savedMatch[1])),
      savingsPercent: parseFloat(savedMatch[2]),
    };
  } catch {
    return null;
  }
}

export function clearRtkCache(): void {
  rtkInstalledCache = null;
}
