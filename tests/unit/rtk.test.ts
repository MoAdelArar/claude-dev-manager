import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

jest.mock('node:child_process');
jest.mock('node:fs');
jest.mock('node:os');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

import {
  isRtkInstalled,
  isRtkHookActive,
  ensureRtkInitialized,
  getRtkGain,
  clearRtkCache,
} from '../../src/utils/rtk';

describe('RTK Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearRtkCache();
    mockOs.homedir.mockReturnValue('/home/testuser');
  });

  describe('isRtkInstalled', () => {
    it('should return true when rtk binary is on PATH', () => {
      mockExecSync.mockReturnValue(Buffer.from('rtk 0.29.0'));
      expect(isRtkInstalled()).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('rtk --version', expect.any(Object));
    });

    it('should return false when rtk binary is not found', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found: rtk');
      });
      expect(isRtkInstalled()).toBe(false);
    });

    it('should cache the result for subsequent calls', () => {
      mockExecSync.mockReturnValue(Buffer.from('rtk 0.29.0'));
      expect(isRtkInstalled()).toBe(true);
      expect(isRtkInstalled()).toBe(true);
      expect(mockExecSync).toHaveBeenCalledTimes(1);
    });

    it('should use custom rtk path when provided', () => {
      mockExecSync.mockReturnValue(Buffer.from('rtk 0.29.0'));
      clearRtkCache();
      isRtkInstalled('/custom/path/rtk');
      expect(mockExecSync).toHaveBeenCalledWith('/custom/path/rtk --version', expect.any(Object));
    });
  });

  describe('isRtkHookActive', () => {
    it('should return true when settings.json contains rtk PreToolUse hook', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        hooks: {
          PreToolUse: ['rtk'],
        },
      }));
      expect(isRtkHookActive()).toBe(true);
    });

    it('should return false when settings.json does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(isRtkHookActive()).toBe(false);
    });

    it('should return false when settings.json does not contain rtk hook', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        hooks: {},
      }));
      expect(isRtkHookActive()).toBe(false);
    });

    it('should return false and handle errors gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      expect(isRtkHookActive()).toBe(false);
    });
  });

  describe('ensureRtkInitialized', () => {
    it('should return installed=false when rtk is not installed', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found');
      });

      const result = ensureRtkInitialized();
      expect(result).toEqual({
        installed: false,
        hookActive: false,
        message: 'rtk not installed',
      });
    });

    it('should return hookActive=true when rtk is installed and hook is already active', () => {
      mockExecSync.mockReturnValue(Buffer.from('rtk 0.29.0'));
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{"hooks": {"PreToolUse": ["rtk"]}}');

      const result = ensureRtkInitialized();
      expect(result).toEqual({
        installed: true,
        hookActive: true,
        message: 'RTK hook already active',
      });
    });

    it('should run rtk init --global when installed but hook not active', () => {
      let callCount = 0;
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'rtk --version') {
          return Buffer.from('rtk 0.29.0');
        }
        if (cmd === 'rtk init --global') {
          return Buffer.from('Initialized');
        }
        throw new Error('Unknown command');
      });

      mockFs.existsSync.mockImplementation(() => {
        callCount++;
        return callCount > 1;
      });
      mockFs.readFileSync.mockReturnValue('{"hooks": {"PreToolUse": ["rtk"]}}');

      clearRtkCache();
      const result = ensureRtkInitialized();
      expect(result.installed).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('rtk init --global', expect.any(Object));
    });
  });

  describe('getRtkGain', () => {
    it('should return null when rtk is not installed', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found');
      });

      expect(getRtkGain()).toBeNull();
    });

    it('should parse rtk gain output correctly', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'rtk --version') {
          return Buffer.from('rtk 0.29.0');
        }
        if (cmd === 'rtk gain') {
          return Buffer.from(`📊 RTK Token Savings
════════════════════════════════════
Total commands: 2,927
Input tokens: 11.6M
Output tokens: 1.4M
Tokens saved: 10.3M (89.2%)`);
        }
        throw new Error('Unknown command');
      });

      clearRtkCache();
      const result = getRtkGain();
      expect(result).toEqual({
        totalCommands: 2927,
        tokensSaved: 10300000,
        savingsPercent: 89.2,
      });
    });

    it('should handle K suffix in token counts', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'rtk --version') {
          return Buffer.from('rtk 0.29.0');
        }
        if (cmd === 'rtk gain') {
          return Buffer.from(`Total commands: 100
Tokens saved: 500K (75%)`);
        }
        throw new Error('Unknown command');
      });

      clearRtkCache();
      const result = getRtkGain();
      expect(result).toEqual({
        totalCommands: 100,
        tokensSaved: 500000,
        savingsPercent: 75,
      });
    });

    it('should return null when gain output cannot be parsed', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'rtk --version') {
          return Buffer.from('rtk 0.29.0');
        }
        if (cmd === 'rtk gain') {
          return Buffer.from('No data available');
        }
        throw new Error('Unknown command');
      });

      clearRtkCache();
      expect(getRtkGain()).toBeNull();
    });

    it('should return null when rtk gain command fails', () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd === 'rtk --version') {
          return Buffer.from('rtk 0.29.0');
        }
        throw new Error('Command failed');
      });

      clearRtkCache();
      expect(getRtkGain()).toBeNull();
    });
  });
});
