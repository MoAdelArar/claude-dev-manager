import {
  type Artifact,
  ArtifactType,
  ArtifactStatus,
  ReviewStatus,
  AgentRole,
} from '../../src/types';
import {
  summarizeArtifact,
  summarizeArtifacts,
  optimizeAnalysisForRole,
  optimizeProfileForRole,
  shouldPassFullArtifacts,
  optimizeInputArtifacts,
  estimateTokens,
  buildTokenReport,
} from '../../src/context/context-optimizer';

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'art-1',
    type: ArtifactType.REQUIREMENTS_DOC,
    name: 'Requirements',
    description: 'Test artifact',
    filePath: 'requirements.md',
    createdBy: AgentRole.PRODUCT_MANAGER,
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

const FULL_ANALYSIS = `# Codebase Analysis
## Entry Points
- src/index.ts
- src/cli.ts
## Dependencies
- express: 4.18.0
- pg: 8.11.0
## Patterns
- Repository pattern for data access
- Middleware pattern for request handling
## Testing
- tests/unit — Unit tests
- tests/integration — Integration tests
## Module Dependencies
api → services → db`;

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

describe('optimizeAnalysisForRole()', () => {
  it('should return null for null input', () => {
    expect(optimizeAnalysisForRole(null, AgentRole.PRODUCT_MANAGER)).toBeNull();
  });

  it('should return filtered sections for PRODUCT_MANAGER (Entry Points only)', () => {
    const result = optimizeAnalysisForRole(FULL_ANALYSIS, AgentRole.PRODUCT_MANAGER);
    expect(result).not.toBeNull();
    expect(result).toContain('Entry Points');
    expect(result).not.toContain('## Module Dependencies');
    expect(result).not.toContain('## Patterns');
    expect(result).not.toContain('## Testing');
  });

  it('should return Patterns and Module Dependencies for SENIOR_DEVELOPER', () => {
    const result = optimizeAnalysisForRole(FULL_ANALYSIS, AgentRole.SENIOR_DEVELOPER);
    expect(result).not.toBeNull();
    expect(result).toContain('Patterns');
    expect(result).toContain('Module Dependencies');
    expect(result).not.toContain('## Testing');
    expect(result).not.toContain('## Dependencies');
  });

  it('should return Dependencies and Entry Points for DEVOPS_ENGINEER', () => {
    const result = optimizeAnalysisForRole(FULL_ANALYSIS, AgentRole.DEVOPS_ENGINEER);
    expect(result).not.toBeNull();
    expect(result).toContain('Dependencies');
    expect(result).toContain('Entry Points');
    expect(result).not.toContain('## Patterns');
    expect(result).not.toContain('## Module Dependencies');
  });

  it('should return full analysis for unknown role', () => {
    const result = optimizeAnalysisForRole(FULL_ANALYSIS, 'unknown_role' as AgentRole);
    expect(result).toBe(FULL_ANALYSIS);
  });

  it('should return null when filtered analysis is completely empty', () => {
    const analysis = 'Just a raw line with no headings at all.';
    const result = optimizeAnalysisForRole(analysis, AgentRole.PRODUCT_MANAGER);
    expect(result).toBeNull();
  });

  it('should return null for empty string analysis', () => {
    const result = optimizeAnalysisForRole('', AgentRole.PRODUCT_MANAGER);
    expect(result).toBeNull();
  });
});

describe('optimizeProfileForRole()', () => {
  it('should return null for null input', () => {
    expect(optimizeProfileForRole(null, AgentRole.BUSINESS_ANALYST)).toBeNull();
  });

  it('should return architecture only for BUSINESS_ANALYST', () => {
    const result = optimizeProfileForRole(FULL_PROFILE, AgentRole.BUSINESS_ANALYST);
    expect(result).not.toBeNull();
    expect(result).toContain('Architecture');
    expect(result).not.toContain('## Import Style');
    expect(result).not.toContain('## TypeScript Usage');
  });

  it('should return full code style for SENIOR_DEVELOPER', () => {
    const result = optimizeProfileForRole(FULL_PROFILE, AgentRole.SENIOR_DEVELOPER);
    expect(result).not.toBeNull();
    expect(result).toContain('Naming Conventions');
    expect(result).toContain('Import Style');
    expect(result).toContain('Formatting');
    expect(result).toContain('TypeScript Usage');
    expect(result).toContain('Error Handling');
    expect(result).toContain('Code Samples');
  });

  it('should return testing sections for QA_ENGINEER', () => {
    const result = optimizeProfileForRole(FULL_PROFILE, AgentRole.QA_ENGINEER);
    expect(result).not.toBeNull();
    expect(result).toContain('Testing Conventions');
    expect(result).toContain('Naming Conventions');
    expect(result).not.toContain('## Import Style');
  });

  it('should return full profile for unknown role', () => {
    const result = optimizeProfileForRole(FULL_PROFILE, 'unknown_role' as AgentRole);
    expect(result).toBe(FULL_PROFILE);
  });

  it('should return null when filtered content is completely empty', () => {
    const profileWithNoTitle = 'Just a line without headings.';
    const result = optimizeProfileForRole(profileWithNoTitle, AgentRole.QA_ENGINEER);
    expect(result).toBeNull();
  });

  it('should return the title line even when no matching subsections found', () => {
    const minimalProfile = '# Code Style\nSome intro text only.';
    const result = optimizeProfileForRole(minimalProfile, AgentRole.QA_ENGINEER);
    expect(result).toBe('# Code Style');
  });
});

describe('shouldPassFullArtifacts()', () => {
  it('should return true for SENIOR_DEVELOPER', () => {
    expect(shouldPassFullArtifacts(AgentRole.SENIOR_DEVELOPER)).toBe(true);
  });

  it('should return true for JUNIOR_DEVELOPER', () => {
    expect(shouldPassFullArtifacts(AgentRole.JUNIOR_DEVELOPER)).toBe(true);
  });

  it('should return true for CODE_REVIEWER', () => {
    expect(shouldPassFullArtifacts(AgentRole.CODE_REVIEWER)).toBe(true);
  });

  it('should return true for DATABASE_ENGINEER', () => {
    expect(shouldPassFullArtifacts(AgentRole.DATABASE_ENGINEER)).toBe(true);
  });

  it('should return false for PRODUCT_MANAGER', () => {
    expect(shouldPassFullArtifacts(AgentRole.PRODUCT_MANAGER)).toBe(false);
  });

  it('should return false for DEVOPS_ENGINEER', () => {
    expect(shouldPassFullArtifacts(AgentRole.DEVOPS_ENGINEER)).toBe(false);
  });

  it('should return false for QA_ENGINEER', () => {
    expect(shouldPassFullArtifacts(AgentRole.QA_ENGINEER)).toBe(false);
  });

  it('should return false for BUSINESS_ANALYST', () => {
    expect(shouldPassFullArtifacts(AgentRole.BUSINESS_ANALYST)).toBe(false);
  });

  it('should return false for SECURITY_ENGINEER', () => {
    expect(shouldPassFullArtifacts(AgentRole.SECURITY_ENGINEER)).toBe(false);
  });

  it('should return false for an unknown role', () => {
    expect(shouldPassFullArtifacts('unknown' as AgentRole)).toBe(false);
  });
});

describe('optimizeInputArtifacts()', () => {
  it('should return empty string for empty artifact array', () => {
    expect(optimizeInputArtifacts([], AgentRole.SENIOR_DEVELOPER)).toBe('');
  });

  it('should summarize artifacts for non-full-artifact roles', () => {
    const artifact = makeArtifact({ content: LONG_CONTENT, name: 'Requirements Doc', version: 1 });
    const result = optimizeInputArtifacts([artifact], AgentRole.PRODUCT_MANAGER);

    expect(result).toContain('Requirements Doc');
    expect(result).toContain('lines total');
  });

  it('should pass full content for developer roles when under 8KB', () => {
    const artifact = makeArtifact({ content: 'Small content', name: 'Tiny' });
    const result = optimizeInputArtifacts([artifact], AgentRole.SENIOR_DEVELOPER);

    expect(result).toContain('### Tiny');
    expect(result).toContain('Small content');
    expect(result).toContain('```');
  });

  it('should summarize even for developer roles when content exceeds 8KB', () => {
    const lines = Array.from({ length: 300 }, (_, i) => `Line ${i}: ${'x'.repeat(30)}`);
    const bigContent = lines.join('\n');
    expect(bigContent.length).toBeGreaterThan(8000);

    const artifact = makeArtifact({ content: bigContent, name: 'Large Doc' });
    const result = optimizeInputArtifacts([artifact], AgentRole.SENIOR_DEVELOPER);

    expect(result).toContain('lines total');
  });

  it('should handle artifacts with undefined content for developer roles', () => {
    const artifact = makeArtifact({
      content: undefined as unknown as string,
      name: 'Empty',
    });
    const result = optimizeInputArtifacts([artifact], AgentRole.SENIOR_DEVELOPER);
    expect(result).toContain('### Empty');
  });

  it('should handle multiple artifacts for developer roles under 8KB', () => {
    const a1 = makeArtifact({ content: 'Content A', name: 'Doc A' });
    const a2 = makeArtifact({ content: 'Content B', name: 'Doc B' });
    const result = optimizeInputArtifacts([a1, a2], AgentRole.CODE_REVIEWER);

    expect(result).toContain('### Doc A');
    expect(result).toContain('### Doc B');
    expect(result).toContain('Content A');
    expect(result).toContain('Content B');
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

describe('buildTokenReport()', () => {
  it('should return all required fields', () => {
    const report = buildTokenReport(
      'system prompt here',
      'task instructions',
      'analysis text',
      'profile text',
      'artifact context',
      'output format',
      'full analysis that is much longer than the filtered version',
      'full profile that is also much longer than the filtered version',
      'full artifact content that is the longest of all',
    );

    expect(report).toHaveProperty('systemPrompt');
    expect(report).toHaveProperty('taskInstructions');
    expect(report).toHaveProperty('analysis');
    expect(report).toHaveProperty('profile');
    expect(report).toHaveProperty('artifacts');
    expect(report).toHaveProperty('outputFormat');
    expect(report).toHaveProperty('total');
    expect(report).toHaveProperty('savedVsFull');
    expect(report).toHaveProperty('savingsPercent');
  });

  it('should calculate total as sum of components', () => {
    const report = buildTokenReport(
      'aaaa', // 1 token
      'bbbb', // 1 token
      'cccc', // 1 token
      'dddd', // 1 token
      'eeee', // 1 token
      'ffff', // 1 token
      'cccc',
      'dddd',
      'eeee',
    );

    expect(report.total).toBe(
      report.systemPrompt + report.taskInstructions + report.analysis +
      report.profile + report.artifacts + report.outputFormat,
    );
  });

  it('should calculate savings correctly', () => {
    const report = buildTokenReport(
      'sp',
      'ti',
      'short',
      'short',
      'short',
      'of',
      'this is a much longer full analysis text with many more tokens',
      'this is a much longer full profile text with many more tokens',
      'this is a much longer full artifact content with many more tokens',
    );

    expect(report.savedVsFull).toBeGreaterThan(0);
    expect(report.savingsPercent).toBeGreaterThan(0);
    expect(report.savingsPercent).toBeLessThanOrEqual(100);
  });

  it('should handle null analysis and profile', () => {
    const report = buildTokenReport(
      'system',
      'task',
      null,
      null,
      'artifacts',
      'format',
      null,
      null,
      'full artifacts',
    );

    expect(report.analysis).toBe(0);
    expect(report.profile).toBe(0);
    expect(report.total).toBe(
      report.systemPrompt + report.taskInstructions + report.artifacts + report.outputFormat,
    );
  });

  it('should return 0% savings when fullTotal is 0', () => {
    const report = buildTokenReport('', '', '', '', '', '', '', '', '');
    expect(report.savingsPercent).toBe(0);
  });
});
