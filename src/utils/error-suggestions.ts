import type { AgentRole } from '../types.js';

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
  step?: number;
  agent?: AgentRole;
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
      { command: 'cdm resume --skip', description: 'Skip this step and continue' },
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
      { command: 'cdm resume', description: 'Resume the pipeline after waiting' },
      { command: 'cdm config --set pipeline.retryDelay=5000', description: 'Increase retry delay' },
    ],
  },
  {
    pattern: /timeout|timed.?out|ETIMEDOUT|ESOCKETTIMEDOUT/i,
    title: 'Request Timeout',
    suggestion: 'The request timed out. This may be due to network issues or a large task.',
    actions: [
      { command: 'cdm resume', description: 'Resume from the last successful step' },
      { command: 'cdm config --set pipeline.timeout=120000', description: 'Increase timeout' },
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
    suggestion: 'The process ran out of memory. Try running with fewer concurrent tasks.',
    actions: [
      { command: 'NODE_OPTIONS="--max-old-space-size=4096" cdm start ...', description: 'Increase Node.js memory limit' },
      { command: 'cdm start --template quick-fix ...', description: 'Use a smaller pipeline template' },
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
    pattern: /invalid.*template|template.*not.*found/i,
    title: 'Invalid Template',
    suggestion: 'The specified pipeline template does not exist.',
    actions: [
      { command: 'cdm pipeline', description: 'List available templates' },
      { command: 'cdm start --template feature "..."', description: 'Use the default feature template' },
    ],
  },
  {
    pattern: /artifact.*not.*found|missing.*artifact/i,
    title: 'Missing Artifact',
    suggestion: 'A required artifact from a previous step is missing.',
    actions: [
      { command: 'cdm artifacts', description: 'List all artifacts' },
      { command: 'cdm resume --skip-steps <step>', description: 'Skip the problematic step' },
    ],
  },
  {
    pattern: /gate.*fail|gate.*condition/i,
    title: 'Gate Condition Failed',
    suggestion: 'A pipeline gate condition was not met. Review the issues and fix them.',
    actions: [
      { command: 'cdm show <feature-id>', description: 'View feature details and issues' },
      { command: 'cdm resume', description: 'Retry after fixing the issues' },
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
];

const DEFAULT_SUGGESTION: Omit<ErrorSuggestion, 'pattern'> = {
  title: 'Pipeline Error',
  suggestion: 'An unexpected error occurred during pipeline execution.',
  actions: [
    { command: 'cdm resume', description: 'Retry from the last successful step' },
    { command: 'cdm status', description: 'Check the current pipeline status' },
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

export function getErrorSuggestionForStep(
  error: Error | string,
  stepIndex: number,
  agent?: AgentRole
): EnhancedErrorInfo {
  const base = getErrorSuggestion(error);
  return {
    ...base,
    step: stepIndex,
    agent,
  };
}
