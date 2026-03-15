/**
 * Error suggestions for CDM CLI.
 * Refactored for dynamic persona system.
 */

export interface ErrorAction {
  command: string;
  description: string;
}

export interface ErrorSuggestion {
  pattern: RegExp;
  title: string;
  suggestion: string;
  actions: ErrorAction[];
}

export interface EnhancedErrorInfo {
  title: string;
  message: string;
  suggestion: string;
  actions: ErrorAction[];
  details?: string;
  personaId?: string;
}

const ERROR_SUGGESTIONS: ErrorSuggestion[] = [
  {
    pattern: /ENOENT.*\.cdm/i,
    title: 'Project Not Initialized',
    suggestion: 'The .cdm directory was not found. Initialize CDM in your project first.',
    actions: [
      { command: 'cdm init', description: 'Initialize CDM in the current directory' },
      { command: 'cdm init --project <path>', description: 'Initialize CDM in a specific directory' },
    ],
  },
  {
    pattern: /TypeScript.*compilation.*fail|tsc.*error|TS\d{4,5}/i,
    title: 'TypeScript Compilation Error',
    suggestion: 'The generated code has TypeScript errors. Review the error details and fix the type issues.',
    actions: [
      { command: 'cdm resume', description: 'Retry after fixing the errors manually' },
      { command: 'npm run typecheck', description: 'Run typecheck to see all errors' },
    ],
  },
  {
    pattern: /test.*fail|jest.*fail|vitest.*fail|assertion.*fail/i,
    title: 'Test Failure',
    suggestion: 'Some tests are failing. Review the test output and fix the failing tests or implementation.',
    actions: [
      { command: 'cdm resume', description: 'Retry after fixing the tests' },
      { command: 'npm test', description: 'Run tests locally to debug' },
      { command: 'cdm show <feature-id>', description: 'View the feature details and test artifacts' },
    ],
  },
  {
    pattern: /ANTHROPIC_API_KEY|API.?key.*not.*found|authentication.*fail/i,
    title: 'API Key Missing or Invalid',
    suggestion: 'The Anthropic API key is not set or is invalid.',
    actions: [
      { command: 'export ANTHROPIC_API_KEY=sk-...', description: 'Set the API key in your environment' },
      { command: 'cdm start --mode simulation', description: 'Run in simulation mode (no API key needed)' },
    ],
  },
  {
    pattern: /rate.?limit|429|too.?many.?requests/i,
    title: 'Rate Limited',
    suggestion: 'You have exceeded the API rate limit. Wait a moment and retry.',
    actions: [
      { command: 'cdm resume', description: 'Resume after waiting' },
    ],
  },
  {
    pattern: /timeout|timed.?out|ETIMEDOUT|ESOCKETTIMEDOUT/i,
    title: 'Request Timeout',
    suggestion: 'The request timed out. This may be due to network issues or a large task.',
    actions: [
      { command: 'cdm resume', description: 'Resume from the last successful point' },
    ],
  },
  {
    pattern: /permission.*denied|EACCES|EPERM/i,
    title: 'Permission Denied',
    suggestion: 'The operation was denied due to file permissions.',
    actions: [
      { command: 'chmod -R u+w .cdm', description: 'Fix .cdm directory permissions' },
      { command: 'ls -la .cdm', description: 'Check current permissions' },
    ],
  },
  {
    pattern: /out.?of.?memory|heap|ENOMEM/i,
    title: 'Out of Memory',
    suggestion: 'The process ran out of memory.',
    actions: [
      { command: 'NODE_OPTIONS="--max-old-space-size=4096" cdm start ...', description: 'Increase Node.js memory limit' },
    ],
  },
  {
    pattern: /no.*feature.*found|feature.*not.*exist/i,
    title: 'Feature Not Found',
    suggestion: 'The specified feature ID was not found.',
    actions: [
      { command: 'cdm status', description: 'List all active features' },
      { command: 'cdm history', description: 'View feature history' },
    ],
  },
  {
    pattern: /persona.*not.*found|invalid.*persona/i,
    title: 'Persona Not Found',
    suggestion: 'The specified persona ID does not exist in the catalog.',
    actions: [
      { command: 'cdm personas list', description: 'List all available personas' },
      { command: 'cdm personas update', description: 'Update persona catalog from GitHub' },
    ],
  },
  {
    pattern: /catalog.*empty|no.*personas/i,
    title: 'Empty Persona Catalog',
    suggestion: 'The persona catalog is empty. Fetch personas from the agency-agents repo.',
    actions: [
      { command: 'cdm personas update', description: 'Fetch personas from GitHub' },
      { command: 'cdm init', description: 'Re-initialize the project' },
    ],
  },
  {
    pattern: /artifact.*not.*found|missing.*artifact/i,
    title: 'Missing Artifact',
    suggestion: 'A required artifact is missing.',
    actions: [
      { command: 'cdm artifacts', description: 'List all artifacts' },
      { command: 'cdm resume', description: 'Re-run the execution' },
    ],
  },
  {
    pattern: /lint.*error|eslint.*error/i,
    title: 'Linting Errors',
    suggestion: 'The code has linting errors. Fix them before proceeding.',
    actions: [
      { command: 'npm run lint:fix', description: 'Auto-fix linting errors' },
      { command: 'cdm resume', description: 'Resume after fixing errors' },
    ],
  },
  {
    pattern: /security.*vuln|npm.*audit|critical.*vuln/i,
    title: 'Security Vulnerabilities',
    suggestion: 'Security vulnerabilities were detected in dependencies.',
    actions: [
      { command: 'npm audit fix', description: 'Auto-fix vulnerabilities' },
      { command: 'npm audit', description: 'View vulnerability details' },
    ],
  },
  {
    pattern: /claude.*not.*available|claude.*cli.*not.*found/i,
    title: 'Claude CLI Not Available',
    suggestion: 'The Claude CLI is not installed or not in PATH.',
    actions: [
      { command: 'npm install -g @anthropic-ai/claude-code', description: 'Install Claude CLI globally' },
      { command: 'cdm start --mode simulation', description: 'Run in simulation mode' },
    ],
  },
];

const DEFAULT_SUGGESTION: Omit<ErrorSuggestion, 'pattern'> = {
  title: 'Execution Error',
  suggestion: 'An unexpected error occurred during execution.',
  actions: [
    { command: 'cdm resume', description: 'Retry the execution' },
    { command: 'cdm status', description: 'Check the current status' },
    { command: 'cdm history --last 1', description: 'View the latest execution details' },
  ],
};

export function getErrorSuggestion(error: Error | string): EnhancedErrorInfo {
  const message = typeof error === 'string' ? error : error.message;
  const stack = typeof error === 'string' ? undefined : error.stack;
  
  for (const suggestion of ERROR_SUGGESTIONS) {
    if (suggestion.pattern.test(message) || (stack && suggestion.pattern.test(stack))) {
      return {
        title: suggestion.title,
        message,
        suggestion: suggestion.suggestion,
        actions: suggestion.actions,
        details: stack,
      };
    }
  }

  return {
    title: DEFAULT_SUGGESTION.title,
    message,
    suggestion: DEFAULT_SUGGESTION.suggestion,
    actions: DEFAULT_SUGGESTION.actions,
    details: stack,
  };
}

export function getErrorSuggestionForPersona(
  error: Error | string,
  personaId?: string,
): EnhancedErrorInfo {
  const base = getErrorSuggestion(error);
  return {
    ...base,
    personaId,
  };
}
