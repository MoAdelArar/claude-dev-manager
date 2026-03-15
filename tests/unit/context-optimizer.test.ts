import { describe, it, expect } from 'bun:test';
import {
  type Artifact,
  ArtifactType,
  ArtifactStatus,
  ReviewStatus,
} from '../../src/types';
import {
  summarizeArtifact,
  summarizeArtifacts,
  extractSections,
  estimateTokens,
  truncateContent,
  formatArtifactContext,
} from '../../src/context/context-optimizer';

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'art-1',
    type: ArtifactType.REQUIREMENTS_DOC,
    name: 'Requirements',
    description: 'Test artifact',
    filePath: 'requirements.md',
    createdBy: 'software-engineer',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    content: 'Short content',
    metadata: {},
    status: ArtifactStatus.DRAFT,
    reviewStatus: ReviewStatus.PENDING,
    ...overrides,
  };
}

const SHORT_CONTENT = `# Requirements
## Overview
- Feature A
- Feature B`;

const LONG_CONTENT = `# Requirements Document
## Overview
This is the overview section for the project requirements.
## Functional Requirements
- FR-001: User can log in
- FR-002: User can log out
- FR-003: User can reset password
- **Important:** Two-factor authentication required
## Non-Functional Requirements
- NFR-001: Response time < 200ms
- NFR-002: 99.9% uptime SLA
- NFR-003: Support 1000 rps throughput
## User Stories
- US-001: As a user, I want to log in
- US-002: As a user, I want to reset my password
## Acceptance Criteria
- AC-001: Login succeeds with valid credentials
- AC-002: Error shown for invalid credentials
## Performance Targets
- Median latency: 50ms
- P99 latency: 500ms
- Throughput: 2000 rps peak
## Security
- All data encrypted at rest
- TLS 1.3 required
## Compliance
- GDPR compliant
- SOC2 Type II certified`;

const FULL_PROFILE = `# Code Style Profile
## Architecture
Layered architecture with API, Service, and Data layers.
## Naming Conventions
camelCase for variables, PascalCase for types.
## Import Style
Use node: protocol for built-in modules.
## Formatting
2-space indentation, semicolons required.
## TypeScript Usage
Strict mode, prefer interfaces over type aliases.
## Error Handling
Use custom error classes inheriting from Error.
## Code Samples
\`\`\`typescript
export class UserService { ... }
\`\`\`
## Testing Conventions
Jest with describe/it blocks, mocks via jest.fn().
## API Conventions
RESTful with versioned endpoints.`;

describe('summarizeArtifact()', () => {
  it('should return full content for short artifacts (under maxLines)', () => {
    const artifact = makeArtifact({ content: SHORT_CONTENT });
    const result = summarizeArtifact(artifact);
    expect(result).toBe(SHORT_CONTENT);
  });

  it('should return a summary for long artifacts', () => {
    const artifact = makeArtifact({ content: LONG_CONTENT, name: 'Requirements Doc', version: 2 });
    const result = summarizeArtifact(artifact, 15);

    expect(result).toContain('**Requirements Doc**');
    expect(result).toContain('v2');
    expect(result).toContain('Sections:');
    expect(result).toContain('Key points:');
    expect(result).toContain('lines total');
  });

  it('should include headings in summary', () => {
    const artifact = makeArtifact({ content: LONG_CONTENT });
    const result = summarizeArtifact(artifact, 5);

    expect(result).toContain('Sections:');
    expect(result).toContain('Overview');
    expect(result).toContain('Functional Requirements');
  });

  it('should include key decision points (bullet points, FR/NFR/US/AC prefixes, bold text)', () => {
    const artifact = makeArtifact({ content: LONG_CONTENT });
    const result = summarizeArtifact(artifact, 5);

    expect(result).toContain('Key points:');
    expect(result).toMatch(/FR-|NFR-|US-|AC-|\*\*/);
  });

  it('should include metrics when present', () => {
    const artifact = makeArtifact({ content: LONG_CONTENT });
    const result = summarizeArtifact(artifact, 5);

    expect(result).toContain('Metrics:');
    expect(result).toMatch(/ms|rps|%/);
  });

  it('should return minimal summary for artifact with no content', () => {
    const artifact = makeArtifact({ content: '' });
    const result = summarizeArtifact(artifact);

    expect(result).toBe('');
  });

  it('should handle artifact with null-ish content via nullish coalescing', () => {
    const artifact = makeArtifact({ content: undefined as unknown as string });
    const result = summarizeArtifact(artifact);
    expect(result).toBe('');
  });

  it('should truncate long key decision lines to 120 characters', () => {
    const longLine = '- ' + 'A'.repeat(200);
    const content = Array.from({ length: 20 }, () => longLine).join('\n');
    const artifact = makeArtifact({ content });
    const result = summarizeArtifact(artifact, 5);

    const lines = result.split('\n');
    const keyPointLines = lines.filter(l => l.startsWith('- '));
    for (const line of keyPointLines) {
      expect(line.length).toBeLessThanOrEqual(120);
    }
  });
});

describe('summarizeArtifacts()', () => {
  it('should return "No input artifacts." for empty array', () => {
    expect(summarizeArtifacts([])).toBe('No input artifacts.');
  });

  it('should summarize a single artifact', () => {
    const result = summarizeArtifacts([makeArtifact({ content: SHORT_CONTENT })]);
    expect(result).toContain('Requirements');
  });

  it('should summarize multiple artifacts separated by double newlines', () => {
    const a1 = makeArtifact({ content: SHORT_CONTENT, name: 'Artifact A' });
    const a2 = makeArtifact({ content: SHORT_CONTENT, name: 'Artifact B' });
    const result = summarizeArtifacts([a1, a2]);
    expect(result).toContain('# Requirements');
    expect(result.split('\n\n').length).toBeGreaterThanOrEqual(2);
  });
});

describe('extractSections()', () => {
  it('should return empty string for empty markdown', () => {
    expect(extractSections('', ['Overview'])).toBe('');
  });

  it('should return empty string for empty section names', () => {
    expect(extractSections(FULL_PROFILE, [])).toBe('');
  });

  it('should extract matching sections', () => {
    const result = extractSections(FULL_PROFILE, ['Architecture', 'Naming Conventions']);
    expect(result).toContain('Architecture');
    expect(result).toContain('Naming Conventions');
    expect(result).toContain('# Code Style Profile');
  });

  it('should preserve title line', () => {
    const result = extractSections(FULL_PROFILE, ['Architecture']);
    expect(result.startsWith('# Code Style Profile')).toBe(true);
  });

  it('should handle case-insensitive section matching', () => {
    const result = extractSections(FULL_PROFILE, ['architecture']);
    expect(result).toContain('## Architecture');
  });

  it('should handle partial section name matching', () => {
    const result = extractSections(FULL_PROFILE, ['Naming']);
    expect(result).toContain('## Naming Conventions');
  });
});

describe('estimateTokens()', () => {
  it('should estimate tokens as ceil(length / 4)', () => {
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('should handle a large string', () => {
    const text = 'x'.repeat(1000);
    expect(estimateTokens(text)).toBe(250);
  });
});

describe('truncateContent()', () => {
  it('should return full content when under maxChars', () => {
    const content = 'Short content here';
    const result = truncateContent(content, 100);
    expect(result).toBe(content);
  });

  it('should truncate content when over maxChars', () => {
    const content = 'x'.repeat(200);
    const result = truncateContent(content, 100);
    expect(result.length).toBeLessThan(content.length);
    expect(result).toContain('(truncated)');
  });

  it('should try to truncate at last newline for cleaner output', () => {
    const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const result = truncateContent(content, 25);
    expect(result).toContain('(truncated)');
  });

  it('should handle content with no newlines', () => {
    const content = 'x'.repeat(200);
    const result = truncateContent(content, 100);
    expect(result).toContain('(truncated)');
  });
});

describe('formatArtifactContext()', () => {
  it('should return empty string for empty artifacts array', () => {
    expect(formatArtifactContext([])).toBe('');
  });

  it('should return full content when under maxTotalChars', () => {
    const artifact = makeArtifact({ content: 'Small content', name: 'Tiny' });
    const result = formatArtifactContext([artifact], 8000);

    expect(result).toContain('### Tiny');
    expect(result).toContain('Small content');
    expect(result).toContain('```');
  });

  it('should summarize when over maxTotalChars', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `Line ${i}: ${'x'.repeat(30)}`);
    const bigContent = lines.join('\n');

    const artifact = makeArtifact({ content: bigContent, name: 'Large Doc' });
    const result = formatArtifactContext([artifact], 1000);

    expect(result).toContain('lines total');
  });

  it('should handle multiple small artifacts', () => {
    const a1 = makeArtifact({ content: 'Content A', name: 'Doc A' });
    const a2 = makeArtifact({ content: 'Content B', name: 'Doc B' });
    const result = formatArtifactContext([a1, a2], 8000);

    expect(result).toContain('### Doc A');
    expect(result).toContain('### Doc B');
    expect(result).toContain('Content A');
    expect(result).toContain('Content B');
  });

  it('should handle artifacts with undefined content', () => {
    const artifact = makeArtifact({
      content: undefined as unknown as string,
      name: 'Empty',
    });
    const result = formatArtifactContext([artifact], 8000);
    expect(result).toContain('### Empty');
  });
});
