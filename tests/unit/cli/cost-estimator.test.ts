import { describe, it, expect } from 'bun:test';
import {
  getTemplateEstimate,
  getAllTemplateEstimates,
  formatTokenCount,
  formatCost,
  formatDuration,
  estimateFromDescription,
} from '../../../src/utils/cost-estimator.js';

describe('cost-estimator', () => {
  describe('getTemplateEstimate', () => {
    it('returns estimate for quick-fix template', () => {
      const estimate = getTemplateEstimate('quick-fix');
      
      expect(estimate.templateId).toBe('quick-fix');
      expect(estimate.templateName).toBe('Quick Fix');
      expect(estimate.steps).toBe(2);
      expect(estimate.tokens.min).toBe(15000);
      expect(estimate.tokens.max).toBe(25000);
      expect(estimate.agents).toContain('Developer');
      expect(estimate.agents).toContain('Reviewer');
    });

    it('returns estimate for feature template', () => {
      const estimate = getTemplateEstimate('feature');
      
      expect(estimate.templateId).toBe('feature');
      expect(estimate.steps).toBe(4);
      expect(estimate.agents.length).toBe(4);
    });

    it('returns estimate for full-feature template', () => {
      const estimate = getTemplateEstimate('full-feature');
      
      expect(estimate.steps).toBe(6);
      expect(estimate.tokens.min).toBeGreaterThan(estimate.tokens.min);
    });

    it('defaults to feature template for unknown template', () => {
      const estimate = getTemplateEstimate('unknown-template');
      
      expect(estimate.templateId).toBe('unknown-template');
      expect(estimate.steps).toBe(4);
    });

    it('defaults to feature template when no template provided', () => {
      const estimate = getTemplateEstimate();
      
      expect(estimate.templateId).toBe('feature');
    });
  });

  describe('getAllTemplateEstimates', () => {
    it('returns all 6 templates', () => {
      const estimates = getAllTemplateEstimates();
      
      expect(estimates.length).toBe(6);
      expect(estimates.map((e) => e.templateId)).toContain('quick-fix');
      expect(estimates.map((e) => e.templateId)).toContain('feature');
      expect(estimates.map((e) => e.templateId)).toContain('full-feature');
      expect(estimates.map((e) => e.templateId)).toContain('review-only');
      expect(estimates.map((e) => e.templateId)).toContain('design-only');
      expect(estimates.map((e) => e.templateId)).toContain('deploy');
    });
  });

  describe('formatTokenCount', () => {
    it('formats small numbers as-is', () => {
      expect(formatTokenCount(500)).toBe('500');
    });

    it('formats thousands with K suffix', () => {
      expect(formatTokenCount(15000)).toBe('15.0K');
      expect(formatTokenCount(1500)).toBe('1.5K');
    });

    it('formats millions with M suffix', () => {
      expect(formatTokenCount(1500000)).toBe('1.50M');
    });
  });

  describe('formatCost', () => {
    it('formats costs in dollars', () => {
      expect(formatCost(0.15)).toBe('$0.15');
      expect(formatCost(1.50)).toBe('$1.50');
    });

    it('formats very small costs in cents', () => {
      expect(formatCost(0.005)).toBe('$0.50¢');
    });
  });

  describe('formatDuration', () => {
    it('formats seconds', () => {
      expect(formatDuration(45)).toBe('45s');
    });

    it('formats minutes', () => {
      expect(formatDuration(120)).toBe('2m');
    });

    it('formats minutes and seconds', () => {
      expect(formatDuration(90)).toBe('1m 30s');
    });
  });

  describe('estimateFromDescription', () => {
    it('detects quick-fix from bug description', () => {
      const estimate = estimateFromDescription('Fix login bug');
      expect(estimate.templateId).toBe('quick-fix');
    });

    it('detects quick-fix from typo description', () => {
      const estimate = estimateFromDescription('Fix typo in header');
      expect(estimate.templateId).toBe('quick-fix');
    });

    it('detects deploy from deploy description', () => {
      const estimate = estimateFromDescription('Deploy to production');
      expect(estimate.templateId).toBe('deploy');
    });

    it('detects review-only from audit description', () => {
      const estimate = estimateFromDescription('Security audit of auth module');
      expect(estimate.templateId).toBe('review-only');
    });

    it('detects design-only from architecture description', () => {
      const estimate = estimateFromDescription('Design new API architecture');
      expect(estimate.templateId).toBe('design-only');
    });

    it('detects full-feature from production description', () => {
      const estimate = estimateFromDescription('Add complete user authentication for production');
      expect(estimate.templateId).toBe('full-feature');
    });

    it('defaults to feature for generic descriptions', () => {
      const estimate = estimateFromDescription('Add user profile page');
      expect(estimate.templateId).toBe('feature');
    });
  });
});
