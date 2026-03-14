import { describe, it, expect } from 'bun:test';
import {
  getErrorSuggestion,
  getErrorSuggestionForStep,
} from '../../../src/utils/error-suggestions.js';
import { AgentRole } from '../../../src/types.js';

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

    it('matches invalid template error', () => {
      const error = new Error('Invalid template: unknown-template');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Invalid Template');
      expect(suggestion.actions.some((a) => a.command === 'cdm pipeline')).toBe(true);
    });

    it('returns default suggestion for unknown errors', () => {
      const error = new Error('Some random unknown error');
      const suggestion = getErrorSuggestion(error);
      
      expect(suggestion.title).toBe('Pipeline Error');
      expect(suggestion.actions.length).toBeGreaterThan(0);
    });

    it('handles string errors', () => {
      const suggestion = getErrorSuggestion('TypeScript compilation failed');
      
      expect(suggestion.title).toBe('TypeScript Compilation Error');
    });
  });

  describe('getErrorSuggestionForStep', () => {
    it('includes step information', () => {
      const error = new Error('Test failed');
      const suggestion = getErrorSuggestionForStep(error, 2);
      
      expect(suggestion.step).toBe(2);
    });

    it('includes agent information', () => {
      const error = new Error('Test failed');
      const suggestion = getErrorSuggestionForStep(error, 2, AgentRole.DEVELOPER);
      
      expect(suggestion.step).toBe(2);
      expect(suggestion.agent).toBe(AgentRole.DEVELOPER);
    });

    it('still matches error patterns', () => {
      const error = new Error('TypeScript compilation failed');
      const suggestion = getErrorSuggestionForStep(error, 1, AgentRole.DEVELOPER);
      
      expect(suggestion.title).toBe('TypeScript Compilation Error');
      expect(suggestion.step).toBe(1);
      expect(suggestion.agent).toBe(AgentRole.DEVELOPER);
    });
  });
});
