#!/usr/bin/env node
/**
 * CDM postinstall script — checks for rtk and suggests installation.
 * Auto-install is opt-in via CDM_AUTO_INSTALL_RTK=1 environment variable.
 * Non-blocking: CDM works fine without rtk.
 */

const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';

// Common rtk install locations
const RTK_PATHS_UNIX = [
  'rtk',
  path.join(os.homedir() || '', '.local', 'bin', 'rtk'),
  '/usr/local/bin/rtk',
  '/opt/homebrew/bin/rtk'
];

const RTK_PATHS_WINDOWS = [
  'rtk',
  'rtk.exe',
  path.join(os.homedir() || '', '.cargo', 'bin', 'rtk.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'rtk', 'rtk.exe')
];

function isWindows() {
  return os.platform() === 'win32';
}

function getRtkPaths() {
  return isWindows() ? RTK_PATHS_WINDOWS : RTK_PATHS_UNIX;
}

function findRtk() {
  for (const rtkPath of getRtkPaths()) {
    if (!rtkPath) continue;
    try {
      execSync(`"${rtkPath}" --version`, { stdio: 'pipe', timeout: 3000 });
      return rtkPath;
    } catch {
      continue;
    }
  }
  return null;
}

function tryInstallRtk() {
  const platform = os.platform();
  
  // Windows: suggest manual install
  if (platform === 'win32') {
    console.log(`${GRAY}[cdm]${RESET} On Windows, install rtk via:`);
    console.log(`${GRAY}[cdm]${RESET}   winget install rtk-ai.rtk`);
    console.log(`${GRAY}[cdm]${RESET}   # or download from https://github.com/rtk-ai/rtk/releases`);
    return false;
  }

  // macOS/Linux: try homebrew first
  if (platform === 'darwin' || platform === 'linux') {
    try {
      execSync('command -v brew', { stdio: 'pipe', shell: true });
      console.log(`${GRAY}[cdm]${RESET} Installing rtk via Homebrew...`);
      execSync('brew install rtk', { stdio: 'inherit', timeout: 120000 });
      return true;
    } catch {
      // Homebrew not available or install failed
    }

    // Try install script
    try {
      console.log(`${GRAY}[cdm]${RESET} Installing rtk via install script...`);
      execSync(
        'curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh',
        { stdio: 'inherit', timeout: 120000, shell: true }
      );
      return true;
    } catch {
      // Install script failed
    }
  }

  return false;
}

function getInstallInstructions() {
  const platform = os.platform();
  
  if (platform === 'win32') {
    return 'winget install rtk-ai.rtk';
  } else if (platform === 'darwin') {
    return 'brew install rtk && rtk init --global';
  } else {
    return 'curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh && rtk init --global';
  }
}

function main() {
  // Skip in CI environments
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
    return;
  }

  console.log('');
  
  const rtkPath = findRtk();
  
  if (rtkPath) {
    console.log(`${GREEN}[cdm]${RESET} rtk detected — agent CLI outputs will be compressed (60-90% token savings)`);
    console.log(`${GRAY}[cdm]${RESET} Run 'rtk init --global' if you haven't already to activate the hook`);
    console.log('');
    return;
  }

  // rtk not found
  console.log(`${YELLOW}[cdm]${RESET} rtk not found`);
  console.log(`${GRAY}[cdm]${RESET} rtk compresses CLI outputs for 60-90% token savings in agent sessions.`);
  
  // Check if auto-install is enabled (opt-in)
  const autoInstall = process.env.CDM_AUTO_INSTALL_RTK === '1' || process.env.CDM_AUTO_INSTALL_RTK === 'true';
  
  if (autoInstall) {
    console.log(`${GRAY}[cdm]${RESET} CDM_AUTO_INSTALL_RTK=1 detected, attempting install...`);
    const installed = tryInstallRtk();
    
    if (installed && findRtk()) {
      console.log(`${GREEN}[cdm]${RESET} rtk installed successfully!`);
      console.log(`${GRAY}[cdm]${RESET} Run 'rtk init --global' to activate the hook`);
    } else {
      console.log(`${YELLOW}[cdm]${RESET} rtk installation failed. Install manually:`);
      console.log(`${GRAY}[cdm]${RESET}   ${getInstallInstructions()}`);
    }
  } else {
    // Just suggest installation (opt-in behavior)
    console.log(`${GRAY}[cdm]${RESET} Install manually for token savings:`);
    console.log(`${GRAY}[cdm]${RESET}   ${getInstallInstructions()}`);
    console.log(`${GRAY}[cdm]${RESET} Or set CDM_AUTO_INSTALL_RTK=1 before npm install to auto-install.`);
  }
  
  console.log(`${GRAY}[cdm]${RESET} CDM works fine without rtk.`);
  console.log('');
}

// Top-level try/catch to prevent any uncaught exceptions from breaking npm install
try {
  main();
} catch (error) {
  // Silently fail - rtk is optional, don't break npm install
  // Uncomment for debugging: console.error('[cdm] postinstall error:', error.message);
}
