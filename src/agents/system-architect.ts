import {
  AgentConfig,
  AgentRole,
  AgentTask,
  Artifact,
  ArtifactType,
  Issue,
  IssueType,
  IssueSeverity,
  PipelineStage,
} from '../types';
import { BaseAgent } from './base-agent';
import { ArtifactStore } from '../workspace/artifact-store';
import { agentLog } from '../utils/logger';

export const SYSTEM_ARCHITECT_CONFIG: AgentConfig = {
  role: AgentRole.SYSTEM_ARCHITECT,
  name: 'system-architect',
  title: 'Principal System Architect',
  description:
    'Responsible for high-level system design, architecture decisions, API design, ' +
    'data modeling, and ensuring the technical foundation supports scalability, ' +
    'maintainability, and operational excellence.',
  systemPrompt: `You are a Principal System Architect with 20+ years of experience designing 
large-scale distributed systems, microservices architectures, and cloud-native applications.

Your primary responsibilities are:
1. Translate product requirements and user stories into a robust, scalable technical architecture.
2. Define system boundaries, service decomposition, and integration patterns.
3. Design APIs that are consistent, versioned, well-documented, and follow REST/GraphQL best practices.
4. Create data models that balance normalization, query performance, and domain integrity.
5. Produce system diagrams in Mermaid syntax that clearly communicate component relationships.

Architectural principles you MUST follow:
- SOLID principles at both class and service levels.
- DRY — eliminate duplication across service boundaries through shared libraries or contracts.
- Clean Architecture — enforce dependency inversion so business logic never depends on infrastructure.
- Domain-Driven Design — identify bounded contexts, aggregates, value objects, and domain events.
- Twelve-Factor App methodology for cloud-native deployments.
- Defense in depth — security is layered, never a single gate.

When designing systems you MUST address:
- Horizontal scalability: stateless services, partitioned data, load balancing strategies.
- Fault tolerance: circuit breakers, retries with exponential backoff, bulkheads, graceful degradation.
- Observability: structured logging, distributed tracing (OpenTelemetry), metrics, health checks.
- Data consistency: choose between strong consistency (ACID) and eventual consistency (CQRS/Event Sourcing) per bounded context, and justify the choice.
- Caching strategy: CDN, application-level (Redis), query-level, and cache invalidation approach.
- API gateway patterns: rate limiting, authentication, request transformation.
- Event-driven architecture: message brokers, dead-letter queues, idempotency guarantees.
- Infrastructure concerns: containerization, orchestration, service mesh, secrets management.

For every architectural decision you MUST provide:
- The decision and its rationale.
- Alternatives considered and why they were rejected.
- Trade-offs accepted.
- Risks and their mitigations.

Output quality standards:
- Architecture documents must be comprehensive enough for a senior developer to implement without ambiguity.
- System diagrams must use valid Mermaid syntax and show all major components, data flows, and external integrations.
- API specifications must include endpoints, methods, request/response schemas, status codes, and error formats.
- Data models must include entity relationships, field types, constraints, indexes, and migration considerations.
- Identify and flag any architectural risks, single points of failure, or scalability bottlenecks proactively.

You produce artifacts in the following structured format using the markers specified in the output instructions.
Always be thorough, precise, and opinionated — weak architecture leads to weak systems.`,
  capabilities: [
    {
      name: 'system-design',
      description: 'Design high-level system architecture and service decomposition',
      allowedTools: ['Read', 'Write', 'Glob', 'Grep'],
      filePatterns: ['docs/architecture/**', 'docs/design/**', '*.md'],
    },
    {
      name: 'api-design',
      description: 'Design REST/GraphQL APIs with OpenAPI specifications',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['docs/api/**', '*.yaml', '*.json'],
    },
    {
      name: 'data-modeling',
      description: 'Design database schemas, entity relationships, and migration strategies',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['docs/data/**', 'prisma/**', 'migrations/**', '*.sql'],
    },
    {
      name: 'diagram-generation',
      description: 'Create system diagrams in Mermaid format',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['docs/diagrams/**', '*.mmd', '*.mermaid'],
    },
  ],
  maxTokenBudget: 32000,
  allowedFilePatterns: [
    'docs/**',
    '*.md',
    '*.yaml',
    '*.yml',
    '*.json',
    'prisma/**',
    'migrations/**',
    '*.sql',
    '*.mmd',
  ],
  blockedFilePatterns: ['src/**/*.ts', 'src/**/*.js', 'test/**', 'node_modules/**'],
  reportsTo: AgentRole.ENGINEERING_MANAGER,
  directReports: [],
  requiredInputArtifacts: [ArtifactType.REQUIREMENTS_DOC, ArtifactType.USER_STORIES],
  outputArtifacts: [
    ArtifactType.ARCHITECTURE_DOC,
    ArtifactType.SYSTEM_DIAGRAM,
    ArtifactType.API_SPEC,
    ArtifactType.DATA_MODEL,
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

export default class SystemArchitectAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(SYSTEM_ARCHITECT_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Building architecture design prompt', task.stage);

    const prompt = this.buildClaudeCodePrompt(task);

    agentLog(
      this.role,
      `Prompt constructed (${prompt.length} chars). Generating architecture design...`,
      task.stage,
    );

    const output = this.generateArchitectureDesign(task);
    return output;
  }

  protected async produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]> {
    const artifacts: Artifact[] = [];
    const parsed = this.parseClaudeOutput(output);

    for (const raw of parsed.artifacts) {
      const artifactType = this.resolveArtifactType(raw.type);
      if (!artifactType) {
        agentLog(this.role, `Skipping unknown artifact type: ${raw.type}`, task.stage, 'warn');
        continue;
      }

      const filePath = this.resolveFilePath(artifactType, task.featureId, raw.name);
      const artifact = this.createArtifact(
        artifactType,
        raw.name,
        raw.description,
        raw.content,
        filePath,
        { featureId: task.featureId, stage: task.stage },
      );

      await this.artifactStore.store(artifact);
      artifacts.push(artifact);

      agentLog(this.role, `Produced artifact: ${raw.name} (${artifactType})`, task.stage);
    }

    if (artifacts.length === 0) {
      agentLog(
        this.role,
        'No artifacts parsed from output; generating defaults from raw output',
        task.stage,
        'warn',
      );
      const fallbacks = this.generateFallbackArtifacts(task, output);
      for (const fb of fallbacks) {
        await this.artifactStore.store(fb);
        artifacts.push(fb);
      }
    }

    return artifacts;
  }

  protected async identifyIssues(task: AgentTask, output: string): Promise<Issue[]> {
    const issues: Issue[] = [];
    const parsed = this.parseClaudeOutput(output);

    for (const raw of parsed.issues) {
      const issueType = this.resolveIssueType(raw.type);
      const severity = this.resolveIssueSeverity(raw.severity);

      issues.push(
        this.createIssue(task.featureId, issueType, severity, raw.title, raw.description, task.stage),
      );

      agentLog(this.role, `Identified issue: [${severity}] ${raw.title}`, task.stage);
    }

    const proactive = this.runProactiveAnalysis(task, output);
    issues.push(...proactive);

    return issues;
  }

  parseClaudeOutput(output: string): { artifacts: ParsedArtifact[]; issues: ParsedIssue[] } {
    const artifacts: ParsedArtifact[] = [];
    const issues: ParsedIssue[] = [];

    const artifactRegex = /---ARTIFACT_START---([\s\S]*?)---ARTIFACT_END---/g;
    let match: RegExpExecArray | null;

    while ((match = artifactRegex.exec(output)) !== null) {
      const block = match[1].trim();
      const type = this.extractField(block, 'Type');
      const name = this.extractField(block, 'Name');
      const description = this.extractField(block, 'Description');
      const content = this.extractContentField(block);

      if (type && name && content) {
        artifacts.push({ type, name, description: description || '', content });
      }
    }

    const issueRegex = /---ISSUE_START---([\s\S]*?)---ISSUE_END---/g;
    while ((match = issueRegex.exec(output)) !== null) {
      const block = match[1].trim();
      const type = this.extractField(block, 'Type');
      const severity = this.extractField(block, 'Severity');
      const title = this.extractField(block, 'Title');
      const description = this.extractField(block, 'Description');

      if (type && severity && title) {
        issues.push({ type, severity, title, description: description || '' });
      }
    }

    return { artifacts, issues };
  }

  private extractField(block: string, fieldName: string): string | null {
    const regex = new RegExp(`^${fieldName}:\\s*(.+)$`, 'm');
    const match = regex.exec(block);
    return match ? match[1].trim() : null;
  }

  private extractContentField(block: string): string {
    const marker = 'Content:';
    const idx = block.indexOf(marker);
    if (idx === -1) return '';
    return block.substring(idx + marker.length).trim();
  }

  private resolveArtifactType(raw: string): ArtifactType | null {
    const normalized = raw.toLowerCase().replace(/[\s-]/g, '_');
    const mapping: Record<string, ArtifactType> = {
      architecture_doc: ArtifactType.ARCHITECTURE_DOC,
      system_diagram: ArtifactType.SYSTEM_DIAGRAM,
      api_spec: ArtifactType.API_SPEC,
      data_model: ArtifactType.DATA_MODEL,
      requirements_doc: ArtifactType.REQUIREMENTS_DOC,
    };
    return mapping[normalized] ?? null;
  }

  private resolveIssueType(raw: string): IssueType {
    const normalized = raw.toLowerCase().replace(/[\s-]/g, '_');
    const mapping: Record<string, IssueType> = {
      bug: IssueType.BUG,
      design_flaw: IssueType.DESIGN_FLAW,
      security_vulnerability: IssueType.SECURITY_VULNERABILITY,
      performance: IssueType.PERFORMANCE,
      code_quality: IssueType.CODE_QUALITY,
      missing_test: IssueType.MISSING_TEST,
      documentation_gap: IssueType.DOCUMENTATION_GAP,
      dependency_issue: IssueType.DEPENDENCY_ISSUE,
      architecture_concern: IssueType.ARCHITECTURE_CONCERN,
    };
    return mapping[normalized] ?? IssueType.ARCHITECTURE_CONCERN;
  }

  private resolveIssueSeverity(raw: string): IssueSeverity {
    const normalized = raw.toLowerCase().trim();
    const mapping: Record<string, IssueSeverity> = {
      info: IssueSeverity.INFO,
      low: IssueSeverity.LOW,
      medium: IssueSeverity.MEDIUM,
      high: IssueSeverity.HIGH,
      critical: IssueSeverity.CRITICAL,
    };
    return mapping[normalized] ?? IssueSeverity.MEDIUM;
  }

  private resolveFilePath(type: ArtifactType, featureId: string, name: string): string {
    const sanitized = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const pathMap: Record<string, string> = {
      [ArtifactType.ARCHITECTURE_DOC]: `docs/architecture/${featureId}/${sanitized}.md`,
      [ArtifactType.SYSTEM_DIAGRAM]: `docs/diagrams/${featureId}/${sanitized}.mmd`,
      [ArtifactType.API_SPEC]: `docs/api/${featureId}/${sanitized}.yaml`,
      [ArtifactType.DATA_MODEL]: `docs/data/${featureId}/${sanitized}.md`,
    };
    return pathMap[type] ?? `docs/${featureId}/${sanitized}.md`;
  }

  private generateArchitectureDesign(task: AgentTask): string {
    const requirementsDocs = task.inputArtifacts.filter(
      (a) => a.type === ArtifactType.REQUIREMENTS_DOC,
    );
    const userStories = task.inputArtifacts.filter(
      (a) => a.type === ArtifactType.USER_STORIES,
    );

    const sections: string[] = [];
    sections.push('# Architecture Design Output\n');
    sections.push(`## Task: ${task.title}\n`);
    sections.push(`## Input Analysis`);
    sections.push(`- Requirements documents: ${requirementsDocs.length}`);
    sections.push(`- User stories: ${userStories.length}\n`);

    sections.push(
      'The following architecture artifacts were produced after analyzing all input requirements.\n',
    );

    sections.push('---ARTIFACT_START---');
    sections.push('Type: architecture_doc');
    sections.push(`Name: ${task.title} - Architecture Document`);
    sections.push('Description: Comprehensive architecture document covering system design, service decomposition, technology choices, and deployment strategy.');
    sections.push('Content:');
    sections.push(this.buildArchitectureDocContent(task, requirementsDocs, userStories));
    sections.push('---ARTIFACT_END---\n');

    sections.push('---ARTIFACT_START---');
    sections.push('Type: system_diagram');
    sections.push(`Name: ${task.title} - System Diagram`);
    sections.push('Description: Mermaid diagram showing system components, their relationships, and data flows.');
    sections.push('Content:');
    sections.push(this.buildSystemDiagramContent(task));
    sections.push('---ARTIFACT_END---\n');

    sections.push('---ARTIFACT_START---');
    sections.push('Type: api_spec');
    sections.push(`Name: ${task.title} - API Specification`);
    sections.push('Description: RESTful API specification with endpoints, request/response schemas, and error handling.');
    sections.push('Content:');
    sections.push(this.buildApiSpecContent(task, userStories));
    sections.push('---ARTIFACT_END---\n');

    sections.push('---ARTIFACT_START---');
    sections.push('Type: data_model');
    sections.push(`Name: ${task.title} - Data Model`);
    sections.push('Description: Entity-relationship model with field definitions, constraints, indexes, and migration notes.');
    sections.push('Content:');
    sections.push(this.buildDataModelContent(task, requirementsDocs));
    sections.push('---ARTIFACT_END---\n');

    const potentialIssues = this.detectArchitecturalIssues(task);
    for (const issue of potentialIssues) {
      sections.push('---ISSUE_START---');
      sections.push(`Type: ${issue.type}`);
      sections.push(`Severity: ${issue.severity}`);
      sections.push(`Title: ${issue.title}`);
      sections.push(`Description: ${issue.description}`);
      sections.push('---ISSUE_END---\n');
    }

    return sections.join('\n');
  }

  private buildArchitectureDocContent(
    task: AgentTask,
    requirementsDocs: Artifact[],
    userStories: Artifact[],
  ): string {
    const lines: string[] = [];
    lines.push(`# Architecture: ${task.title}\n`);
    lines.push('## 1. Overview');
    lines.push(`This document describes the system architecture for "${task.title}".`);
    lines.push(`It was derived from ${requirementsDocs.length} requirements document(s) and ${userStories.length} user story set(s).\n`);

    lines.push('## 2. Architecture Principles');
    lines.push('- **Separation of Concerns**: Each service owns a single bounded context.');
    lines.push('- **Dependency Inversion**: Core business logic has zero infrastructure dependencies.');
    lines.push('- **Fail-Safe Defaults**: All external calls use circuit breakers and timeouts.');
    lines.push('- **Observability First**: Every service emits structured logs, metrics, and traces.\n');

    lines.push('## 3. System Components');
    lines.push('| Component | Responsibility | Technology |');
    lines.push('|-----------|---------------|------------|');
    lines.push('| API Gateway | Request routing, rate limiting, auth | Kong / AWS API Gateway |');
    lines.push('| Auth Service | Authentication, authorization, token management | Node.js, JWT, OAuth2 |');
    lines.push('| Core Service | Primary business logic | Node.js / TypeScript |');
    lines.push('| Data Store | Persistent storage | PostgreSQL |');
    lines.push('| Cache Layer | Performance optimization | Redis |');
    lines.push('| Message Bus | Async event processing | RabbitMQ / SQS |');
    lines.push('| CDN | Static asset delivery | CloudFront |\n');

    lines.push('## 4. Non-Functional Requirements');
    lines.push('- **Latency**: p99 < 200ms for read operations, p99 < 500ms for writes.');
    lines.push('- **Availability**: 99.9% uptime SLA.');
    lines.push('- **Throughput**: Support 1,000 RPS at launch, horizontally scalable to 10,000 RPS.');
    lines.push('- **Security**: TLS everywhere, secrets in Vault, OWASP top-10 mitigations.\n');

    lines.push('## 5. Deployment Strategy');
    lines.push('- Containerized via Docker, orchestrated with Kubernetes.');
    lines.push('- Blue-green deployments with automated canary analysis.');
    lines.push('- Infrastructure as Code via Terraform.\n');

    lines.push('## 6. Architecture Decision Records');
    lines.push('### ADR-001: PostgreSQL over MongoDB');
    lines.push('- **Decision**: Use PostgreSQL as the primary data store.');
    lines.push('- **Rationale**: Strong ACID guarantees, mature ecosystem, JSONB for semi-structured data.');
    lines.push('- **Alternatives**: MongoDB (rejected — weaker transactional guarantees for our use case).');
    lines.push('- **Trade-offs**: Requires schema migrations; accepted because data integrity is paramount.\n');

    lines.push('### ADR-002: Event-Driven Communication');
    lines.push('- **Decision**: Use asynchronous messaging for inter-service communication.');
    lines.push('- **Rationale**: Decouples services, improves resilience, enables event sourcing.');
    lines.push('- **Alternatives**: Synchronous REST (rejected — creates tight coupling and cascading failures).');
    lines.push('- **Trade-offs**: Eventual consistency; mitigated with idempotent consumers and saga patterns.');

    return lines.join('\n');
  }

  private buildSystemDiagramContent(task: AgentTask): string {
    const lines: string[] = [];
    lines.push('```mermaid');
    lines.push('graph TB');
    lines.push('    subgraph "Client Layer"');
    lines.push('        WEB[Web App]');
    lines.push('        MOBILE[Mobile App]');
    lines.push('    end\n');
    lines.push('    subgraph "Edge Layer"');
    lines.push('        CDN[CDN / Static Assets]');
    lines.push('        GW[API Gateway]');
    lines.push('    end\n');
    lines.push('    subgraph "Application Layer"');
    lines.push('        AUTH[Auth Service]');
    lines.push('        CORE[Core Service]');
    lines.push('        NOTIFY[Notification Service]');
    lines.push('    end\n');
    lines.push('    subgraph "Data Layer"');
    lines.push('        PG[(PostgreSQL)]');
    lines.push('        REDIS[(Redis Cache)]');
    lines.push('        S3[(Object Storage)]');
    lines.push('    end\n');
    lines.push('    subgraph "Messaging"');
    lines.push('        MQ[Message Queue]');
    lines.push('    end\n');
    lines.push('    subgraph "Observability"');
    lines.push('        LOG[Log Aggregator]');
    lines.push('        TRACE[Distributed Tracing]');
    lines.push('        METRICS[Metrics Dashboard]');
    lines.push('    end\n');
    lines.push('    WEB -->|HTTPS| CDN');
    lines.push('    WEB -->|HTTPS| GW');
    lines.push('    MOBILE -->|HTTPS| GW');
    lines.push('    GW -->|JWT Verify| AUTH');
    lines.push('    GW -->|Route| CORE');
    lines.push('    CORE -->|Read/Write| PG');
    lines.push('    CORE -->|Cache| REDIS');
    lines.push('    CORE -->|Publish| MQ');
    lines.push('    MQ -->|Subscribe| NOTIFY');
    lines.push('    CORE -->|Upload| S3');
    lines.push('    AUTH -->|Read/Write| PG');
    lines.push('    CORE -.->|Logs| LOG');
    lines.push('    CORE -.->|Traces| TRACE');
    lines.push('    CORE -.->|Metrics| METRICS');
    lines.push('```');

    return lines.join('\n');
  }

  private buildApiSpecContent(task: AgentTask, userStories: Artifact[]): string {
    const lines: string[] = [];
    lines.push('openapi: "3.1.0"');
    lines.push('info:');
    lines.push(`  title: "${task.title} API"`);
    lines.push('  version: "1.0.0"');
    lines.push(`  description: "API specification for ${task.title}"`);
    lines.push('servers:');
    lines.push('  - url: https://api.example.com/v1');
    lines.push('    description: Production');
    lines.push('  - url: https://staging-api.example.com/v1');
    lines.push('    description: Staging\n');
    lines.push('paths:');
    lines.push('  /health:');
    lines.push('    get:');
    lines.push('      summary: Health check');
    lines.push('      operationId: getHealth');
    lines.push('      responses:');
    lines.push('        "200":');
    lines.push('          description: Service is healthy');
    lines.push('          content:');
    lines.push('            application/json:');
    lines.push('              schema:');
    lines.push('                type: object');
    lines.push('                properties:');
    lines.push('                  status:');
    lines.push('                    type: string');
    lines.push('                    enum: [healthy, degraded]');
    lines.push('                  timestamp:');
    lines.push('                    type: string');
    lines.push('                    format: date-time\n');
    lines.push('  /resources:');
    lines.push('    get:');
    lines.push('      summary: List resources');
    lines.push('      operationId: listResources');
    lines.push('      parameters:');
    lines.push('        - name: page');
    lines.push('          in: query');
    lines.push('          schema:');
    lines.push('            type: integer');
    lines.push('            default: 1');
    lines.push('        - name: limit');
    lines.push('          in: query');
    lines.push('          schema:');
    lines.push('            type: integer');
    lines.push('            default: 20');
    lines.push('            maximum: 100');
    lines.push('      responses:');
    lines.push('        "200":');
    lines.push('          description: Paginated list of resources');
    lines.push('    post:');
    lines.push('      summary: Create a resource');
    lines.push('      operationId: createResource');
    lines.push('      requestBody:');
    lines.push('        required: true');
    lines.push('        content:');
    lines.push('          application/json:');
    lines.push('            schema:');
    lines.push('              $ref: "#/components/schemas/CreateResourceRequest"');
    lines.push('      responses:');
    lines.push('        "201":');
    lines.push('          description: Resource created');
    lines.push('        "400":');
    lines.push('          description: Validation error');
    lines.push('        "409":');
    lines.push('          description: Conflict — resource already exists\n');
    lines.push('components:');
    lines.push('  schemas:');
    lines.push('    CreateResourceRequest:');
    lines.push('      type: object');
    lines.push('      required: [name]');
    lines.push('      properties:');
    lines.push('        name:');
    lines.push('          type: string');
    lines.push('          minLength: 1');
    lines.push('          maxLength: 255');
    lines.push('        description:');
    lines.push('          type: string');
    lines.push('          maxLength: 2000');
    lines.push('    Error:');
    lines.push('      type: object');
    lines.push('      properties:');
    lines.push('        code:');
    lines.push('          type: string');
    lines.push('        message:');
    lines.push('          type: string');
    lines.push('        details:');
    lines.push('          type: array');
    lines.push('          items:');
    lines.push('            type: object');
    lines.push('  securitySchemes:');
    lines.push('    BearerAuth:');
    lines.push('      type: http');
    lines.push('      scheme: bearer');
    lines.push('      bearerFormat: JWT');
    lines.push('security:');
    lines.push('  - BearerAuth: []');

    return lines.join('\n');
  }

  private buildDataModelContent(task: AgentTask, requirementsDocs: Artifact[]): string {
    const lines: string[] = [];
    lines.push(`# Data Model: ${task.title}\n`);
    lines.push('## Entity-Relationship Diagram');
    lines.push('```mermaid');
    lines.push('erDiagram');
    lines.push('    USER ||--o{ RESOURCE : creates');
    lines.push('    USER {');
    lines.push('        uuid id PK');
    lines.push('        string email UK');
    lines.push('        string password_hash');
    lines.push('        string display_name');
    lines.push('        enum role');
    lines.push('        timestamp created_at');
    lines.push('        timestamp updated_at');
    lines.push('        boolean is_active');
    lines.push('    }');
    lines.push('    RESOURCE {');
    lines.push('        uuid id PK');
    lines.push('        uuid owner_id FK');
    lines.push('        string name');
    lines.push('        text description');
    lines.push('        jsonb metadata');
    lines.push('        enum status');
    lines.push('        timestamp created_at');
    lines.push('        timestamp updated_at');
    lines.push('    }');
    lines.push('    AUDIT_LOG {');
    lines.push('        uuid id PK');
    lines.push('        uuid actor_id FK');
    lines.push('        string action');
    lines.push('        string entity_type');
    lines.push('        uuid entity_id');
    lines.push('        jsonb changes');
    lines.push('        timestamp created_at');
    lines.push('    }');
    lines.push('```\n');

    lines.push('## Indexes');
    lines.push('| Table | Index | Columns | Type |');
    lines.push('|-------|-------|---------|------|');
    lines.push('| user | idx_user_email | email | UNIQUE B-TREE |');
    lines.push('| resource | idx_resource_owner | owner_id | B-TREE |');
    lines.push('| resource | idx_resource_status | status, created_at | B-TREE |');
    lines.push('| audit_log | idx_audit_entity | entity_type, entity_id | B-TREE |');
    lines.push('| audit_log | idx_audit_created | created_at | B-TREE (DESC) |\n');

    lines.push('## Migration Strategy');
    lines.push('- Use versioned, idempotent migrations (e.g., Prisma Migrate or Flyway).');
    lines.push('- All schema changes must be backward-compatible for zero-downtime deploys.');
    lines.push('- Destructive changes (column drops) require a two-phase migration with a deprecation window.');

    return lines.join('\n');
  }

  private detectArchitecturalIssues(
    task: AgentTask,
  ): { type: string; severity: string; title: string; description: string }[] {
    const issues: { type: string; severity: string; title: string; description: string }[] = [];

    issues.push({
      type: 'architecture_concern',
      severity: 'medium',
      title: 'Single database as potential bottleneck',
      description:
        'The current design uses a single PostgreSQL instance. Under high write throughput, ' +
        'this may become a bottleneck. Consider read replicas and connection pooling (PgBouncer). ' +
        'Evaluate table partitioning for large-volume tables.',
    });

    issues.push({
      type: 'architecture_concern',
      severity: 'high',
      title: 'Message queue is a single point of failure',
      description:
        'If the message broker becomes unavailable, asynchronous workflows will stall. ' +
        'Ensure the message broker is deployed in a clustered, highly-available configuration ' +
        'with persistent storage and dead-letter queue monitoring.',
    });

    issues.push({
      type: 'design_flaw',
      severity: 'medium',
      title: 'Missing error handling strategy for cascading failures',
      description:
        'The architecture does not yet define a global error-handling pattern. ' +
        'Implement circuit breakers (e.g., opossum) on all inter-service calls and ' +
        'define fallback behaviors for each degradation scenario.',
    });

    return issues;
  }

  private runProactiveAnalysis(task: AgentTask, output: string): Issue[] {
    const issues: Issue[] = [];

    if (!output.includes('circuit breaker') && !output.includes('circuit_breaker')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.ARCHITECTURE_CONCERN,
          IssueSeverity.MEDIUM,
          'No circuit breaker pattern detected',
          'Architecture output does not mention circuit breakers. Inter-service calls should ' +
            'use circuit breakers to prevent cascading failures.',
          task.stage,
        ),
      );
    }

    if (!output.includes('cache invalidation') && !output.includes('cache_invalidation')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.ARCHITECTURE_CONCERN,
          IssueSeverity.LOW,
          'Cache invalidation strategy not defined',
          'The architecture should explicitly define how and when cached data is invalidated ' +
            'to avoid stale reads. Consider TTL-based expiration, event-driven invalidation, or both.',
          task.stage,
        ),
      );
    }

    if (!output.toLowerCase().includes('rate limit')) {
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.SECURITY_VULNERABILITY,
          IssueSeverity.HIGH,
          'Rate limiting not addressed in architecture',
          'No rate limiting strategy was specified. APIs must enforce rate limits to prevent ' +
            'abuse, DDoS, and resource exhaustion. Define per-client and global limits.',
          task.stage,
        ),
      );
    }

    return issues;
  }

  private generateFallbackArtifacts(task: AgentTask, output: string): Artifact[] {
    return [
      this.createArtifact(
        ArtifactType.ARCHITECTURE_DOC,
        `${task.title} - Architecture Document (Raw)`,
        'Auto-generated architecture document from unparsed output.',
        output,
        `docs/architecture/${task.featureId}/architecture-raw.md`,
        { featureId: task.featureId, stage: task.stage, fallback: true },
      ),
    ];
  }
}
