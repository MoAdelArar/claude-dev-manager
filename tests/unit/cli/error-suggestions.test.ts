import { describe, it, expect } from 'bun:test';
import {
  getErrorSuggestion,
  getErrorSuggestionForPersona,
} from '../../../src/utils/error-suggestions.js';

describe('error-suggestions', () => {
  describe('getErrorSuggestion', () => {
    it('matches project not initialized error', () => {
      const error = new Error('ENOENT: no such file or directory, open \'.cdm/config.yaml\'');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Project Not Initialized');
      expect(suggestion.actions.some((a) => a.command === 'cdm init')).toBe(true);
    });

    it('matches TypeScript compilation error', () => {
      const error = new Error('TypeScript compilation failed: TS2339: Property does not exist');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('TypeScript Compilation Error');
      expect(suggestion.actions.some((a) => a.command === 'cdm resume')).toBe(true);
    });

    it('matches test failure error', () => {
      const error = new Error('Test suite failed: 3 tests failed');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Test Failure');
    });

    it('matches API key error', () => {
      const error = new Error('ANTHROPIC_API_KEY not found in environment');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('API Key Missing or Invalid');
      expect(suggestion.actions.some((a) => a.command.includes('simulation'))).toBe(true);
    });

    it('matches rate limit error', () => {
      const error = new Error('Error 429: Too many requests');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Rate Limited');
    });

    it('matches timeout error', () => {
      const error = new Error('Request timed out after 30000ms');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Request Timeout');
    });

    it('matches permission denied error', () => {
      const error = new Error('EACCES: permission denied');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Permission Denied');
    });

    it('matches feature not found error', () => {
      const error = new Error('No feature found with id feat-123');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Feature Not Found');
      expect(suggestion.actions.some((a) => a.command === 'cdm status')).toBe(true);
    });

    it('matches persona not found error', () => {
      const error = new Error('Persona not found: invalid-persona-id');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Persona Not Found');
      expect(suggestion.actions.some((a) => a.command === 'cdm personas list')).toBe(true);
    });

    it('matches empty persona catalog error', () => {
      const error = new Error('Catalog empty, no personas available');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Empty Persona Catalog');
      expect(suggestion.actions.some((a) => a.command === 'cdm personas update')).toBe(true);
    });

    it('matches Claude CLI not available error', () => {
      const error = new Error('Claude CLI not available in PATH');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Claude CLI Not Available');
      expect(suggestion.actions.some((a) => a.command.includes('simulation'))).toBe(true);
    });

    it('matches missing artifact error', () => {
      const error = new Error('Artifact not found: requirements-doc');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Missing Artifact');
      expect(suggestion.actions.some((a) => a.command === 'cdm artifacts')).toBe(true);
    });

    it('matches linting error', () => {
      const error = new Error('ESLint error: too many errors');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Linting Errors');
      expect(suggestion.actions.some((a) => a.command === 'npm run lint:fix')).toBe(true);
    });

    it('matches security vulnerability error', () => {
      const error = new Error('npm audit found critical vulnerabilities');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Security Vulnerabilities');
      expect(suggestion.actions.some((a) => a.command === 'npm audit fix')).toBe(true);
    });

    it('matches out of memory error', () => {
      const error = new Error('FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Out of Memory');
      expect(suggestion.actions.some((a) => a.command.includes('--max-old-space-size'))).toBe(true);
    });

    it('returns default suggestion for unknown errors', () => {
      const error = new Error('Some random unknown error');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Execution Error');
      expect(suggestion.actions.length).toBeGreaterThan(0);
    });

    it('handles string errors', () => {
      const suggestion = getErrorSuggestion('TypeScript compilation failed');
      
      expect(suggestion.title).toBe('TypeScript Compilation Error');
    });
  });

  describe('getErrorSuggestionForPersona', () => {
    it('includes persona ID in response', () => {
      const error = new Error('Test failed');
      const suggestion = getErrorSuggestionForPersona(error, 'software-engineer');
      
      expect(suggestion.personaId).toBe('software-engineer');
    });

    it('still matches error patterns', () => {
      const error = new Error('TypeScript compilation failed');
      const suggestion = getErrorSuggestionForPersona(error, 'code-reviewer');
      
      expect(suggestion.title).toBe('TypeScript Compilation Error');
      expect(suggestion.personaId).toBe('code-reviewer');
    });

    it('works without persona ID', () => {
      const error = new Error('Test failed');
      const suggestion = getErrorSuggestionForPersona(error);
      
      expect(suggestion.personaId).toBeUndefined();
    });

    it('preserves all base suggestion properties', () => {
      const error = new Error('ENOENT: no such file or directory, open \'.cdm/config.yaml\'');
      const suggestion = getErrorSuggestionForPersona(error, 'devops-engineer');
      
      expect(suggestion.title).toBe('Project Not Initialized');
      expect(suggestion.message).toContain('ENOENT');
      expect(suggestion.suggestion).toBeDefined();
      expect(suggestion.actions.length).toBeGreaterThan(0);
      expect(suggestion.personaId).toBe('devops-engineer');
    });
  });
});
