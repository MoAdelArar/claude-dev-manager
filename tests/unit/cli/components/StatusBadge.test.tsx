import { describe, it, expect } from 'bun:test';
import React from 'react';
import { render } from 'ink-testing-library';
import { StatusBadge } from '../../../../src/cli/components/StatusBadge.js';

describe('StatusBadge', () => {
  it('renders completed status with checkmark', () => {
    const { lastFrame } = render(<StatusBadge status="completed" />);
    expect(lastFrame()).toContain('✓');
    expect(lastFrame()).toContain('completed');
  });

  it('renders in_progress status with circle', () => {
    const { lastFrame } = render(<StatusBadge status="in_progress" />);
    expect(lastFrame()).toContain('●');
    expect(lastFrame()).toContain('in_progress');
  });

  it('renders failed status with X', () => {
    const { lastFrame } = render(<StatusBadge status="failed" />);
    expect(lastFrame()).toContain('✗');
    expect(lastFrame()).toContain('failed');
  });

  it('renders pending status with empty circle', () => {
    const { lastFrame } = render(<StatusBadge status="pending" />);
    expect(lastFrame()).toContain('○');
    expect(lastFrame()).toContain('pending');
  });

  it('renders without icon when showIcon is false', () => {
    const { lastFrame } = render(<StatusBadge status="completed" showIcon={false} />);
    expect(lastFrame()).not.toContain('✓');
    expect(lastFrame()).toContain('completed');
  });

  it('renders on_hold status', () => {
    const { lastFrame } = render(<StatusBadge status="on_hold" />);
    expect(lastFrame()).toContain('on_hold');
  });

  it('renders skipped status with dash', () => {
    const { lastFrame } = render(<StatusBadge status="skipped" />);
    expect(lastFrame()).toContain('−');
    expect(lastFrame()).toContain('skipped');
  });
});
