import { v4 as uuidv4 } from 'uuid';
import {
  type AgentConfig,
  AgentRole,
  type AgentTask,
  type Artifact,
  ArtifactType,
  type Issue,
  IssueType,
  IssueSeverity,
  ArtifactStatus,
  ReviewStatus,
} from '../types';
import { BaseAgent } from './base-agent';
import { type ArtifactStore } from '../workspace/artifact-store';
import { agentLog } from '../utils/logger';

const ARCHITECT_SYSTEM_PROMPT = `You design software systems. You think in components, interfaces, data flows, and trade-offs.
You produce design artifacts, not code. You consider scalability, maintainability, and testability.
You document decisions with rationale and alternatives considered.`;

export const ARCHITECT_CONFIG: AgentConfig = {
  role: AgentRole.ARCHITECT,
  name: 'architect',
  title: 'Architect',
  description: 'Designs system architecture, APIs, data models, and UI specifications. Produces design documents, not code.',
  systemPrompt: ARCHITECT_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'system_design',
      description: 'Designs system architecture and component structure',
      allowedTools: ['Read', 'Write', 'Grep'],
      filePatterns: ['**/*.md', 'docs/**'],
    },
    {
      name: 'api_design',
      description: 'Designs API contracts and specifications',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/*.yaml', '**/*.json', 'docs/**'],
    },
    {
      name: 'data_modeling',
      description: 'Designs database schemas and data models',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/*.sql', '**/*.prisma', 'docs/**'],
    },
  ],
  maxTokenBudget: 30000,
  allowedFilePatterns: ['docs/**', '**/*.md', 'architecture/**'],
  blockedFilePatterns: ['src/**/*.ts', 'src/**/*.js', 'test/**'],
  compatibleSkills: ['system-design', 'api-design', 'data-modeling', 'ui-design'],
  requiredInputArtifacts: [ArtifactType.REQUIREMENTS_DOC],
  outputArtifacts: [
    ArtifactType.ARCHITECTURE_DOC,
    ArtifactType.API_SPEC,
    ArtifactType.DATA_MODEL,
    ArtifactType.UI_SPEC,
  ],
};

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

export class ArchitectAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(ARCHITECT_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Designing system architecture', task.step);

    const sections: string[] = [];
    sections.push('# Architecture Design\n');

    const requirements = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.REQUIREMENTS_DOC,
    );

    sections.push('## Design Context\n');
    sections.push(`- Requirements: ${requirements ? 'Available' : 'Not provided'}`);
    sections.push(`- Active Skills: ${task.activeSkills?.join(', ') || 'None'}`);

    if (task.activeSkills?.includes('system-design')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: architecture_doc');
      sections.push('Name: System Architecture');
      sections.push('Description: High-level system architecture design');
      sections.push('Content:');
      sections.push(this.generateArchitectureDoc(task));
      sections.push('---ARTIFACT_END---\n');
    }

    if (task.activeSkills?.includes('api-design')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: api_spec');
      sections.push('Name: API Specification');
      sections.push('Description: API contract and endpoint specifications');
      sections.push('Content:');
      sections.push(this.generateApiSpec(task));
      sections.push('---ARTIFACT_END---\n');
    }

    if (task.activeSkills?.includes('data-modeling')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: data_model');
      sections.push('Name: Data Model');
      sections.push('Description: Database schema and entity relationships');
      sections.push('Content:');
      sections.push(this.generateDataModel(task));
      sections.push('---ARTIFACT_END---\n');
    }

    if (task.activeSkills?.includes('ui-design')) {
      sections.push('\n---ARTIFACT_START---');
      sections.push('Type: ui_spec');
      sections.push('Name: UI Specification');
      sections.push('Description: User interface design and component hierarchy');
      sections.push('Content:');
      sections.push(this.generateUiSpec(task));
      sections.push('---ARTIFACT_END---\n');
    }

    sections.push('\n## Design Decisions\n');
    sections.push('- Architecture pattern: To be determined based on requirements');
    sections.push('- Key trade-offs: Documented in artifacts');

    agentLog(this.role, 'Architecture design complete', task.step);
    return sections.join('\n');
  }

  protected async produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]> {
    const parsed = this.parseOutput(output);
    const artifacts: Artifact[] = [];

    for (const pa of parsed.artifacts) {
      const artifactType = this.resolveArtifactType(pa.type);
      if (artifactType) {
        const artifact: Artifact = {
          id: uuidv4(),
          type: artifactType,
          name: pa.name,
          description: pa.description,
          filePath: `.cdm/architecture/${pa.name.toLowerCase().replace(/\s+/g, '-')}.md`,
          createdBy: this.role,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
          content: pa.content,
          metadata: {
            taskId: task.id,
            featureId: task.featureId,
            skills: task.activeSkills,
          },
          status: ArtifactStatus.DRAFT,
          reviewStatus: ReviewStatus.PENDING,
        };
        this.artifactStore.store(artifact);
        artifacts.push(artifact);
      }
    }

    return artifacts;
  }

  protected async identifyIssues(task: AgentTask, output: string): Promise<Issue[]> {
    const parsed = this.parseOutput(output);
    const issues: Issue[] = [];

    for (const pi of parsed.issues) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.ARCHITECTURE_CONCERN,
          this.resolveSeverity(pi.severity),
          pi.title,
          pi.description,
          task.step,
        ),
      );
    }

    return issues;
  }

  private generateArchitectureDoc(task: AgentTask): string {
    return `# System Architecture

## Overview
Architecture design for: ${task.title}

## Components
- Component structure to be defined based on requirements

## Data Flow
- Data flow patterns to be specified

## Technology Stack
- Stack decisions based on project context

## Design Rationale
- Key decisions and trade-offs documented here

## Diagrams
\`\`\`mermaid
graph TD
    A[Client] --> B[API Gateway]
    B --> C[Service Layer]
    C --> D[Data Layer]
\`\`\`
`;
  }

  private generateApiSpec(task: AgentTask): string {
    return `# API Specification

## Overview
API design for: ${task.title}

## Endpoints

### Example Endpoint
- **Method**: GET/POST/PUT/DELETE
- **Path**: /api/v1/resource
- **Request Body**: Schema definition
- **Response**: Response schema
- **Errors**: Error codes and messages

## Authentication
- Authentication mechanism details

## Versioning
- API versioning strategy
`;
  }

  private generateDataModel(task: AgentTask): string {
    return `# Data Model

## Overview
Data model for: ${task.title}

## Entities

### Entity Name
| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | Primary Key |
| created_at | Timestamp | Not Null |

## Relationships
- Entity relationships defined here

## Indexes
- Index strategy for performance

## Migrations
- Migration approach for schema changes
`;
  }

  private generateUiSpec(task: AgentTask): string {
    return `# UI Specification

## Overview
UI design for: ${task.title}

## User Flow
1. Entry point
2. Main interaction
3. Completion/Exit

## Component Hierarchy
- Page/Screen structure
- Reusable components

## Accessibility
- WCAG 2.1 AA compliance requirements
- Keyboard navigation
- Screen reader support

## Responsive Design
- Desktop, tablet, mobile breakpoints
`;
  }

  private parseOutput(output: string): { artifacts: ParsedArtifact[]; issues: ParsedIssue[] } {
    const artifacts: ParsedArtifact[] = [];
    const issues: ParsedIssue[] = [];

    const artifactRegex = /---ARTIFACT_START---([\s\S]*?)---ARTIFACT_END---/g;
    let match: RegExpExecArray | null;

    while ((match = artifactRegex.exec(output)) !== null) {
      const block = match[1].trim();
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const nameMatch = block.match(/^Name:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*(.+)$/m);
      const contentMatch = block.match(/Content:\s*([\s\S]*)$/m);

      if (typeMatch && nameMatch) {
        artifacts.push({
          type: typeMatch[1].trim(),
          name: nameMatch[1].trim(),
          description: descMatch?.[1]?.trim() ?? '',
          content: contentMatch?.[1]?.trim() ?? '',
        });
      }
    }

    const issueRegex = /---ISSUE_START---([\s\S]*?)---ISSUE_END---/g;
    while ((match = issueRegex.exec(output)) !== null) {
      const block = match[1].trim();
      const typeMatch = block.match(/^Type:\s*(.+)$/m);
      const sevMatch = block.match(/^Severity:\s*(.+)$/m);
      const titleMatch = block.match(/^Title:\s*(.+)$/m);
      const descMatch = block.match(/^Description:\s*([\s\S]*)$/m);

      if (typeMatch && titleMatch) {
        issues.push({
          type: typeMatch[1].trim(),
          severity: sevMatch?.[1]?.trim() ?? 'medium',
          title: titleMatch[1].trim(),
          description: descMatch?.[1]?.trim() ?? '',
        });
      }
    }

    return { artifacts, issues };
  }

  private resolveArtifactType(typeStr: string): ArtifactType | null {
    const normalized = typeStr.toLowerCase().replace(/[\s_-]+/g, '_');
    const mapping: Record<string, ArtifactType> = {
      architecture_doc: ArtifactType.ARCHITECTURE_DOC,
      api_spec: ArtifactType.API_SPEC,
      data_model: ArtifactType.DATA_MODEL,
      database_schema: ArtifactType.DATABASE_SCHEMA,
      ui_spec: ArtifactType.UI_SPEC,
      wireframe: ArtifactType.WIREFRAME,
      component_spec: ArtifactType.COMPONENT_SPEC,
      system_diagram: ArtifactType.SYSTEM_DIAGRAM,
    };
    return mapping[normalized] ?? null;
  }

  private resolveSeverity(sevStr: string): IssueSeverity {
    const mapping: Record<string, IssueSeverity> = {
      critical: IssueSeverity.CRITICAL,
      high: IssueSeverity.HIGH,
      medium: IssueSeverity.MEDIUM,
      low: IssueSeverity.LOW,
      info: IssueSeverity.INFO,
    };
    return mapping[sevStr.toLowerCase()] ?? IssueSeverity.MEDIUM;
  }
}
