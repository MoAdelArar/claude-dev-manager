import {
  type AgentConfig,
  AgentRole,
  type AgentTask,
  type Artifact,
  ArtifactType,
  type Issue,
  IssueType,
  IssueSeverity,
  PipelineStage,
} from '../types';
import { BaseAgent } from './base-agent';
import { type ArtifactStore } from '../workspace/artifact-store';
import { agentLog } from '../utils/logger';

interface ParsedArtifact {
  type: string;
  name: string;
  description: string;
  content: string;
}

interface ParsedIssue {
  type: string;
  severity: string;
  title: string;
  description: string;
}

interface ParsedOutput {
  summary: string;
  artifacts: ParsedArtifact[];
  issues: ParsedIssue[];
  recommendations: string;
}

const DOCUMENTATION_WRITER_SYSTEM_PROMPT = `You are a Senior Technical Writer with 10+ years of experience creating world-class
documentation for developer tools, APIs, and enterprise software products.

## Documentation Philosophy

- Documentation is a product: treat it with the same rigor as code
- Write for the reader, not the author
- Every document should answer: Who is this for? What will they learn? What can they do after reading?
- Progressive disclosure: start simple, layer complexity
- Show, don't tell: prefer examples over explanations

## Documentation Types You Produce

### API Documentation
- Every endpoint fully documented with:
  - HTTP method and URL pattern
  - Request parameters (path, query, header, body) with types and constraints
  - Response schema with all fields documented
  - Error responses with codes and messages
  - At least one complete request/response example per endpoint
  - Authentication requirements
  - Rate limiting information
- Follow OpenAPI 3.0 specification format when applicable

### Developer Documentation
- Getting Started guide (zero to working in under 5 minutes)
- Architecture overview with diagrams
- Configuration reference with all options documented
- Development workflow (setup, test, build, deploy)
- Contributing guidelines
- Troubleshooting guide with common issues and solutions
- Migration guides for breaking changes

### User Documentation
- Feature overviews with screenshots/diagrams
- Step-by-step tutorials for common workflows
- FAQ section addressing common questions
- Glossary of domain-specific terms

### Changelog
- Follow Keep a Changelog format (keepachangelog.com)
- Group changes: Added, Changed, Deprecated, Removed, Fixed, Security
- Link to relevant PRs/issues
- Highlight breaking changes prominently

## Writing Standards

### Style
- Use active voice ("Configure the server" not "The server should be configured")
- Use second person ("you") for instructions
- Keep sentences under 25 words when possible
- One idea per paragraph
- Use consistent terminology throughout

### Structure
- Clear hierarchy with descriptive headings (H1 → H2 → H3)
- Table of contents for documents longer than 3 sections
- Code examples in fenced blocks with language tags
- Admonitions for warnings, tips, and notes
- Cross-references between related documents

### Code Examples
- Every example must be complete and runnable
- Include expected output where applicable
- Show both happy path and error handling
- Use realistic data, not foo/bar placeholders
- Include language-appropriate comments for non-obvious steps

### Accessibility
- Alt text for all images and diagrams
- Descriptive link text (never "click here")
- Proper heading hierarchy for screen readers
- Color is not the only way to convey information`;

export const DOCUMENTATION_WRITER_CONFIG: AgentConfig = {
  role: AgentRole.DOCUMENTATION_WRITER,
  name: 'documentation-writer',
  title: 'Documentation Writer',
  description: 'Creates comprehensive API docs, developer guides, user documentation, and changelogs',
  systemPrompt: DOCUMENTATION_WRITER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'api_documentation',
      description: 'Generate complete API reference documentation',
      allowedTools: ['Read', 'Write', 'Grep', 'Glob'],
      filePatterns: ['**/*.md', '**/docs/**', '**/api/**'],
    },
    {
      name: 'developer_documentation',
      description: 'Create developer guides, setup instructions, and architecture overviews',
      allowedTools: ['Read', 'Write', 'Grep', 'Glob'],
      filePatterns: ['**/*.md', '**/docs/**', '**/README*'],
    },
    {
      name: 'changelog_generation',
      description: 'Generate structured changelogs from artifacts',
      allowedTools: ['Read', 'Write', 'Grep'],
      filePatterns: ['**/CHANGELOG*', '**/*.md'],
    },
  ],
  maxTokenBudget: 20000,
  allowedFilePatterns: ['**/*.md', '**/docs/**'],
  blockedFilePatterns: [],
  reportsTo: AgentRole.ENGINEERING_MANAGER,
  directReports: [],
  requiredInputArtifacts: [
    ArtifactType.REQUIREMENTS_DOC,
    ArtifactType.ARCHITECTURE_DOC,
    ArtifactType.API_SPEC,
    ArtifactType.SOURCE_CODE,
  ],
  outputArtifacts: [
    ArtifactType.API_DOCUMENTATION,
    ArtifactType.USER_DOCUMENTATION,
    ArtifactType.DEVELOPER_DOCUMENTATION,
    ArtifactType.CHANGELOG,
  ],
};

export default class DocumentationWriterAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(DOCUMENTATION_WRITER_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Beginning documentation generation', task.stage);

    const sections: string[] = [];

    const reqDoc = task.inputArtifacts.find((a) => a.type === ArtifactType.REQUIREMENTS_DOC);
    const archDoc = task.inputArtifacts.find((a) => a.type === ArtifactType.ARCHITECTURE_DOC);
    const apiSpec = task.inputArtifacts.find((a) => a.type === ArtifactType.API_SPEC);
    const sourceCode = task.inputArtifacts.filter((a) => a.type === ArtifactType.SOURCE_CODE);
    const userStories = task.inputArtifacts.find((a) => a.type === ArtifactType.USER_STORIES);

    sections.push('# Documentation Package\n');

    if (apiSpec) {
      sections.push('## API Documentation\n');
      sections.push(this.generateApiDocs(apiSpec, sourceCode));
    }

    sections.push('\n## Developer Documentation\n');
    sections.push(this.generateDevDocs(archDoc, sourceCode));

    if (reqDoc || userStories) {
      sections.push('\n## User Documentation\n');
      sections.push(this.generateUserDocs(reqDoc, userStories));
    }

    sections.push('\n## Changelog\n');
    sections.push(this.generateChangelog(task));

    const output = sections.join('\n');
    agentLog(this.role, 'Documentation generation complete', task.stage);
    return output;
  }

  protected async produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]> {
    const parsed = this.parseClaudeOutput(output);
    const artifacts: Artifact[] = [];

    if (parsed.artifacts.length > 0) {
      for (const pa of parsed.artifacts) {
        const artifactType = this.resolveArtifactType(pa.type);
        if (artifactType) {
          const artifact = this.createArtifact(
            artifactType, pa.name, pa.description, pa.content,
            `docs/${pa.name.toLowerCase().replace(/\s+/g, '-')}.md`,
          );
          this.artifactStore.store(artifact);
          artifacts.push(artifact);
        }
      }
    }

    const apiSpec = task.inputArtifacts.find((a) => a.type === ArtifactType.API_SPEC);
    if (apiSpec && !artifacts.some((a) => a.type === ArtifactType.API_DOCUMENTATION)) {
      const apiDocs = this.createArtifact(
        ArtifactType.API_DOCUMENTATION, 'API Reference',
        'Complete API reference documentation',
        this.generateApiDocs(apiSpec, task.inputArtifacts.filter((a) => a.type === ArtifactType.SOURCE_CODE)),
        'docs/api-reference.md',
      );
      this.artifactStore.store(apiDocs);
      artifacts.push(apiDocs);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.DEVELOPER_DOCUMENTATION)) {
      const devDocs = this.createArtifact(
        ArtifactType.DEVELOPER_DOCUMENTATION, 'Developer Guide',
        'Developer setup and contribution guide',
        this.generateDevDocs(
          task.inputArtifacts.find((a) => a.type === ArtifactType.ARCHITECTURE_DOC),
          task.inputArtifacts.filter((a) => a.type === ArtifactType.SOURCE_CODE),
        ),
        'docs/developer-guide.md',
      );
      this.artifactStore.store(devDocs);
      artifacts.push(devDocs);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.CHANGELOG)) {
      const changelog = this.createArtifact(
        ArtifactType.CHANGELOG, 'Changelog',
        'Version changelog following Keep a Changelog format',
        this.generateChangelog(task),
        'CHANGELOG.md',
      );
      this.artifactStore.store(changelog);
      artifacts.push(changelog);
    }

    return artifacts;
  }

  protected async identifyIssues(task: AgentTask, output: string): Promise<Issue[]> {
    const parsed = this.parseClaudeOutput(output);
    const issues: Issue[] = [];

    for (const pi of parsed.issues) {
      const severity = this.resolveIssueSeverity(pi.severity);
      issues.push(
        this.createIssue(task.featureId, IssueType.DOCUMENTATION_GAP, severity, pi.title, pi.description, task.stage),
      );
    }

    if (!task.inputArtifacts.some((a) => a.type === ArtifactType.API_SPEC)) {
      issues.push(this.createIssue(
        task.featureId, IssueType.DOCUMENTATION_GAP, IssueSeverity.HIGH,
        'Missing API specification',
        'No API spec provided. API documentation may be incomplete or inaccurate.',
        task.stage,
      ));
    }

    if (!task.inputArtifacts.some((a) => a.type === ArtifactType.ARCHITECTURE_DOC)) {
      issues.push(this.createIssue(
        task.featureId, IssueType.DOCUMENTATION_GAP, IssueSeverity.MEDIUM,
        'Missing architecture document',
        'No architecture doc provided. Developer documentation will lack system overview.',
        task.stage,
      ));
    }

    const sourceCode = task.inputArtifacts.filter((a) => a.type === ArtifactType.SOURCE_CODE);
    for (const source of sourceCode) {
      if (!source.content.includes('/**') && !source.content.includes('///')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.DOCUMENTATION_GAP, IssueSeverity.LOW,
          `Missing inline documentation in ${source.name}`,
          'Source code lacks JSDoc/TSDoc comments. Consider adding documentation comments to public APIs.',
          task.stage,
        ));
      }
    }

    return issues;
  }

  private generateApiDocs(apiSpec: Artifact, sourceCode: Artifact[]): string {
    return `### API Reference

> Auto-generated from API specification and source code analysis.

#### Base URL
\`\`\`
https://api.example.com/v1
\`\`\`

#### Authentication
All API requests require a Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer <your-api-token>
\`\`\`

#### Rate Limiting
- 100 requests per minute for authenticated users
- 10 requests per minute for unauthenticated requests

#### Error Response Format
\`\`\`json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": []
  }
}
\`\`\`

#### Endpoints
Refer to the API specification for complete endpoint documentation.
Each endpoint includes request/response schemas, examples, and error codes.

---
*Full API specification content:*

${apiSpec.content.substring(0, 2000)}${apiSpec.content.length > 2000 ? '\n\n[Truncated — see full spec]' : ''}`;
  }

  private generateDevDocs(archDoc?: Artifact, sourceCode?: Artifact[]): string {
    return `### Developer Guide

#### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0
- Git

#### Quick Start
\`\`\`bash
# Clone the repository
git clone <repository-url>
cd <project-name>

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run development server
npm run dev

# Run tests
npm test
\`\`\`

#### Project Structure
${archDoc ? this.extractStructureFromArch(archDoc.content) : 'Refer to the architecture document for detailed project structure.'}

#### Development Workflow
1. Create a feature branch from \`develop\`
2. Implement changes with tests
3. Run \`npm run lint\` and \`npm test\`
4. Submit a pull request
5. Address code review feedback
6. Merge after approval

#### Code Style
- Follow the project ESLint configuration
- Use TypeScript strict mode
- Write JSDoc comments for public APIs
- Maintain test coverage above 80%

#### Architecture Overview
${archDoc ? archDoc.content.substring(0, 1500) : 'Architecture documentation not yet available.'}`;
  }

  private generateUserDocs(reqDoc?: Artifact, userStories?: Artifact): string {
    return `### User Guide

#### Overview
${reqDoc ? this.extractOverview(reqDoc.content) : 'Product overview not yet available.'}

#### Features
${userStories ? this.extractFeatures(userStories.content) : 'Feature documentation not yet available.'}

#### Getting Help
- Check the FAQ section below
- Search existing issues on GitHub
- Contact support at support@example.com

#### FAQ
*Frequently asked questions will be populated based on user feedback.*`;
  }

  private generateChangelog(task: AgentTask): string {
    const date = new Date().toISOString().split('T')[0];
    return `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - ${date}

### Added
- ${task.title}: ${task.description}

### Changed
- Updated project dependencies

### Security
- Applied security recommendations from audit`;
  }

  private extractStructureFromArch(archContent: string): string {
    const structMatch = archContent.match(/(?:project structure|directory|folder)[\s\S]*?```[\s\S]*?```/i);
    return structMatch ? structMatch[0] : 'See architecture document for project structure.';
  }

  private extractOverview(reqContent: string): string {
    const overviewMatch = reqContent.match(/(?:overview|summary|introduction)[\s\S]*?(?=##|\n\n\n)/i);
    return overviewMatch ? overviewMatch[0].substring(0, 500) : reqContent.substring(0, 300);
  }

  private extractFeatures(storiesContent: string): string {
    const storyMatches = storiesContent.match(/As a .*?, I want .*?(?:so that .*?)?(?:\n|$)/gi);
    if (storyMatches) {
      return storyMatches.map((s, i) => `${i + 1}. ${s.trim()}`).join('\n');
    }
    return storiesContent.substring(0, 500);
  }

  private parseClaudeOutput(raw: string): ParsedOutput {
    const artifacts: ParsedArtifact[] = [];
    const issues: ParsedIssue[] = [];

    const artifactRegex = /---ARTIFACT_START---([\s\S]*?)---ARTIFACT_END---/g;
    let match: RegExpExecArray | null;
    while ((match = artifactRegex.exec(raw)) !== null) {
      const block = match[1].trim();
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const nameMatch = block.match(/^Name:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*(.+)$/m);
      const contentMatch = block.match(/Content:\s*([\s\S]*)$/m);
      if (typeMatch && nameMatch) {
        artifacts.push({
          type: typeMatch[1].trim(), name: nameMatch[1].trim(),
          description: descMatch?.[1]?.trim() ?? '', content: contentMatch?.[1]?.trim() ?? '',
        });
      }
    }

    const issueRegex = /---ISSUE_START---([\s\S]*?)---ISSUE_END---/g;
    while ((match = issueRegex.exec(raw)) !== null) {
      const block = match[1].trim();
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const sevMatch = block.match(/^Severity:\s*(.+)$/m);
      const titleMatch = block.match(/^Title:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*([\s\S]*)$/m);
      if (typeMatch && titleMatch) {
        issues.push({
          type: typeMatch[1].trim(), severity: sevMatch?.[1]?.trim() ?? 'medium',
          title: titleMatch[1].trim(), description: descMatch?.[1]?.trim() ?? '',
        });
      }
    }

    return {
      summary: '',
      artifacts, issues,
      recommendations: '',
    };
  }

  private resolveArtifactType(typeStr: string): ArtifactType | null {
    const normalized = typeStr.toLowerCase().replace(/[\s_-]+/g, '_');
    const mapping: Record<string, ArtifactType> = {
      api_documentation: ArtifactType.API_DOCUMENTATION,
      user_documentation: ArtifactType.USER_DOCUMENTATION,
      developer_documentation: ArtifactType.DEVELOPER_DOCUMENTATION,
      changelog: ArtifactType.CHANGELOG,
    };
    return mapping[normalized] ?? null;
  }

  private resolveIssueSeverity(sevStr: string): IssueSeverity {
    const mapping: Record<string, IssueSeverity> = {
      critical: IssueSeverity.CRITICAL, high: IssueSeverity.HIGH,
      medium: IssueSeverity.MEDIUM, low: IssueSeverity.LOW, info: IssueSeverity.INFO,
    };
    return mapping[sevStr.toLowerCase()] ?? IssueSeverity.MEDIUM;
  }
}
