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

const DATABASE_ENGINEER_SYSTEM_PROMPT = `You are a Senior Database Engineer and DBA with 12+ years of hands-on experience across
relational databases (PostgreSQL, MySQL, SQL Server), NoSQL stores (MongoDB, DynamoDB,
Cassandra), caching layers (Redis, Memcached), and search engines (Elasticsearch). You have
designed and operated databases at scale for transactional, analytical, and hybrid workloads.

## Core Database Engineering Areas

### Schema Design
- Normalization: apply 1NF through BCNF systematically, understand when to stop
  (usually 3NF for OLTP, denormalized star/snowflake for OLAP)
- Denormalization strategies: materialized views, summary tables, pre-computed aggregates
  — document every denormalization decision with rationale and update strategy
- Naming conventions: snake_case for columns/tables, singular table names, explicit
  foreign key naming ({table}_{column}_fk), index naming (idx_{table}_{columns})
- Data types: choose the smallest correct type (SMALLINT vs INT vs BIGINT, VARCHAR(n)
  vs TEXT, TIMESTAMPTZ vs TIMESTAMP), avoid implicit conversions
- Constraints: NOT NULL by default (nullable is the exception), CHECK constraints for
  domain validation, UNIQUE constraints for business keys, foreign keys for referential
  integrity
- Soft deletes vs. hard deletes: trade-offs with query complexity, storage, GDPR
- Audit columns: created_at, updated_at, created_by, updated_by on every table
- Partitioning: range (time-based), list (category), hash (even distribution)
  — partition pruning benefits, partition maintenance procedures
- Multi-tenancy: shared schema with tenant_id, schema-per-tenant, database-per-tenant
  — isolation vs. operational complexity trade-offs

### Migration Strategies
- Expand-contract pattern for zero-downtime migrations:
  1. Expand: add new column/table, dual-write
  2. Migrate: backfill existing data, validate
  3. Contract: remove old column/table, stop dual-write
- Version every migration with sequential numbering or timestamps
- Every migration MUST be reversible — provide explicit up() and down() scripts
- Data migration validation: row counts, checksum comparison, referential integrity checks
- Large table migrations: batched updates, online schema change tools (pt-online-schema-change,
  gh-ost, pgrollup)
- Blue-green database deployments with connection string switching
- Feature flags for schema changes that affect application code

### Query Optimization
- EXPLAIN / EXPLAIN ANALYZE: read execution plans, identify sequential scans on large tables,
  nested loops vs. hash joins vs. merge joins, sort operations
- Index types: B-tree (default, range queries), Hash (equality only), GIN (full-text, arrays,
  JSONB), GiST (geometric, range), BRIN (large sequential datasets)
- Composite indexes: column order matters (equality → range → sort), covering indexes
  to avoid table lookups
- Index-only scans: include columns for covering indexes (PostgreSQL INCLUDE clause)
- Query anti-patterns to flag:
  * SELECT * — always specify columns
  * N+1 queries — use JOINs or batch loading
  * Functions on indexed columns in WHERE clause (prevents index usage)
  * LIKE '%prefix' — cannot use B-tree index
  * Implicit type casting in joins
  * Missing LIMIT on potentially large result sets
  * Correlated subqueries that could be JOINs

### Connection Management
- Connection pooling: PgBouncer (transaction mode vs. session mode), ProxySQL, application-level
  pooling (HikariCP, node-postgres pool)
- Pool sizing: connections = (core_count * 2) + effective_spindle_count as starting point,
  tune based on actual workload
- Read replicas: route read queries to replicas, handle replication lag (causal consistency,
  REPLICA IDENTITY FULL)
- Connection limits: set per-role limits, monitoring connection count vs. max_connections

### Backup and Recovery
- Backup strategies: full + incremental, WAL archiving (PostgreSQL), binary log (MySQL)
- Point-in-time recovery (PITR): WAL replay to specific timestamp
- Backup testing: automated restoration tests monthly, measure RTO and RPO
- Disaster recovery: cross-region replication, automated failover (Patroni, RDS Multi-AZ)
- Data retention: define retention policies per table, implement automated archival

### Data Integrity
- Transaction isolation levels: READ COMMITTED (default), REPEATABLE READ, SERIALIZABLE
  — understand phantom reads, dirty reads, write skew
- Optimistic vs. pessimistic locking: version columns vs. SELECT FOR UPDATE
- Distributed transactions: two-phase commit vs. saga pattern
- Data validation: database-level constraints (NOT NULL, CHECK, FK), application-level
  validation, API-level validation — defense in depth

## Output Requirements

For each database design task, produce:
1. **Database Schema** with complete DDL: tables, columns, types, constraints, indexes,
   partitioning, and relationships (ERD description)
2. **Migration Scripts** that are versioned, reversible, and include data validation steps
3. **Query Optimization Report** with EXPLAIN analysis, index recommendations,
   and anti-pattern identification

Always consider the access patterns first — schema design should be driven by how the data
is queried, not just how it is structured. Document every trade-off between normalization
and performance, consistency and availability, simplicity and scalability.`;

export const DATABASE_ENGINEER_CONFIG: AgentConfig = {
  role: AgentRole.DATABASE_ENGINEER,
  name: 'database-engineer',
  title: 'Database Engineer',
  description: 'Designs database schemas, writes migration scripts, optimizes queries, plans indexing strategies, and ensures data integrity and backup procedures.',
  systemPrompt: DATABASE_ENGINEER_SYSTEM_PROMPT,
  capabilities: [
    {
      name: 'schema_design',
      description: 'Designs normalized/denormalized schemas with constraints and indexes',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/db/**', '**/migrations/**', '**/prisma/**'],
    },
    {
      name: 'query_optimization',
      description: 'Analyzes query plans and recommends index and query improvements',
      allowedTools: ['Read', 'Write', 'Shell'],
      filePatterns: ['**/queries/**'],
    },
    {
      name: 'data_modeling',
      description: 'Creates entity-relationship models and data flow diagrams',
      allowedTools: ['Read', 'Write'],
      filePatterns: ['**/models/**'],
    },
  ],
  maxTokenBudget: 20000,
  allowedFilePatterns: ['**/*.sql', '**/*.prisma', '**/migrations/**', '**/db/**', '**/models/**', 'docs/**', '**/*.md'],
  blockedFilePatterns: [],
  reportsTo: AgentRole.SYSTEM_ARCHITECT,
  directReports: [],
  requiredInputArtifacts: [
    ArtifactType.ARCHITECTURE_DOC,
    ArtifactType.DATA_MODEL,
  ],
  outputArtifacts: [
    ArtifactType.DATABASE_SCHEMA,
    ArtifactType.MIGRATION_SCRIPT,
    ArtifactType.QUERY_OPTIMIZATION_REPORT,
  ],
};

export default class DatabaseEngineerAgent extends BaseAgent {
  constructor(artifactStore: ArtifactStore) {
    super(DATABASE_ENGINEER_CONFIG, artifactStore);
  }

  protected async performWork(task: AgentTask): Promise<string> {
    agentLog(this.role, 'Beginning database engineering analysis', task.stage);

    const sections: string[] = [];
    sections.push('# Database Engineering Report\n');

    const archDoc = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.ARCHITECTURE_DOC,
    );
    const dataModel = task.inputArtifacts.find(
      (a) => a.type === ArtifactType.DATA_MODEL,
    );
    const sourceArtifacts = task.inputArtifacts.filter(
      (a) => a.type === ArtifactType.SOURCE_CODE,
    );

    sections.push('## Input Analysis\n');
    sections.push(`- Architecture document: ${archDoc ? 'Available' : 'Not provided'}`);
    sections.push(`- Data model: ${dataModel ? 'Available' : 'Not provided'}`);
    sections.push(`- Source code artifacts: ${sourceArtifacts.length}`);

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: DATABASE_SCHEMA');
    sections.push('Name: Database Schema');
    sections.push('Description: Complete DDL with tables, relationships, indexes, and constraints');
    sections.push('Content:');
    sections.push(this.generateDatabaseSchema(archDoc, dataModel));
    sections.push('---ARTIFACT_END---\n');

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: MIGRATION_SCRIPT');
    sections.push('Name: Migration Scripts');
    sections.push('Description: Versioned, reversible migration scripts with validation steps');
    sections.push('Content:');
    sections.push(this.generateMigrationScripts(dataModel));
    sections.push('---ARTIFACT_END---\n');

    sections.push('\n---ARTIFACT_START---');
    sections.push('Type: QUERY_OPTIMIZATION_REPORT');
    sections.push('Name: Query Optimization Report');
    sections.push('Description: Index recommendations, query anti-patterns, and EXPLAIN analysis guidance');
    sections.push('Content:');
    sections.push(this.generateQueryOptimizationReport(sourceArtifacts));
    sections.push('---ARTIFACT_END---\n');

    agentLog(this.role, 'Database engineering analysis complete', task.stage);
    return sections.join('\n');
  }

  protected async produceArtifacts(task: AgentTask, output: string): Promise<Artifact[]> {
    const parsed = this.parseClaudeOutput(output);
    const artifacts: Artifact[] = [];

    if (parsed.artifacts.length > 0) {
      for (const pa of parsed.artifacts) {
        const artifactType = this.resolveArtifactType(pa.type);
        if (artifactType) {
          const artifact = this.createArtifact(
            artifactType,
            pa.name,
            pa.description,
            pa.content,
            `.cdm/database/${pa.name.toLowerCase().replace(/\s+/g, '-')}.md`,
          );
          this.artifactStore.store(artifact);
          artifacts.push(artifact);
        }
      }
    }

    if (!artifacts.some((a) => a.type === ArtifactType.DATABASE_SCHEMA)) {
      const schema = this.createArtifact(
        ArtifactType.DATABASE_SCHEMA,
        'Database Schema',
        'Complete DDL with tables, relationships, indexes, and constraints',
        output,
        '.cdm/database/database-schema.md',
      );
      this.artifactStore.store(schema);
      artifacts.push(schema);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.MIGRATION_SCRIPT)) {
      const migration = this.createArtifact(
        ArtifactType.MIGRATION_SCRIPT,
        'Migration Scripts',
        'Versioned, reversible migration scripts with validation steps',
        output,
        '.cdm/database/migration-scripts.md',
      );
      this.artifactStore.store(migration);
      artifacts.push(migration);
    }

    if (!artifacts.some((a) => a.type === ArtifactType.QUERY_OPTIMIZATION_REPORT)) {
      const report = this.createArtifact(
        ArtifactType.QUERY_OPTIMIZATION_REPORT,
        'Query Optimization Report',
        'Index recommendations and query anti-pattern analysis',
        output,
        '.cdm/database/query-optimization-report.md',
      );
      this.artifactStore.store(report);
      artifacts.push(report);
    }

    return artifacts;
  }

  protected async identifyIssues(task: AgentTask, output: string): Promise<Issue[]> {
    const parsed = this.parseClaudeOutput(output);
    const issues: Issue[] = [];

    for (const pi of parsed.issues) {
      const severity = this.resolveIssueSeverity(pi.severity);
      issues.push(
        this.createIssue(
          task.featureId,
          IssueType.PERFORMANCE,
          severity,
          pi.title,
          pi.description,
          task.stage,
        ),
      );
    }

    for (const source of task.inputArtifacts.filter((a) => a.type === ArtifactType.SOURCE_CODE)) {
      const content = source.content;
      const lower = content.toLowerCase();

      if (this.detectN1Queries(content)) {
        issues.push(this.createIssue(
          task.featureId, IssueType.PERFORMANCE, IssueSeverity.HIGH,
          'N+1 query pattern detected',
          `Source ${source.name} contains patterns suggesting N+1 queries (queries inside loops). Use JOINs, eager loading, or batch queries to reduce database round-trips.`,
          task.stage,
        ));
      }

      if (/SELECT\s+\*\s+FROM/i.test(content)) {
        issues.push(this.createIssue(
          task.featureId, IssueType.PERFORMANCE, IssueSeverity.MEDIUM,
          'SELECT * usage detected',
          `Source ${source.name} uses SELECT *. Always specify required columns to reduce data transfer and enable index-only scans.`,
          task.stage,
        ));
      }

      if (!lower.includes('index') && (lower.includes('where') || lower.includes('join'))) {
        issues.push(this.createIssue(
          task.featureId, IssueType.PERFORMANCE, IssueSeverity.MEDIUM,
          'Potential missing indexes',
          `Source ${source.name} contains WHERE/JOIN clauses but no index definitions found. Analyze query patterns and add appropriate indexes.`,
          task.stage,
        ));
      }
    }

    const dataModel = task.inputArtifacts.find((a) => a.type === ArtifactType.DATA_MODEL);
    if (dataModel) {
      const modelContent = dataModel.content.toLowerCase();

      if (!modelContent.includes('migration') && !modelContent.includes('versio')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ARCHITECTURE_CONCERN, IssueSeverity.HIGH,
          'No migration strategy for schema changes',
          'Data model does not reference migration procedures. All schema changes must use versioned, reversible migrations with expand-contract pattern for zero-downtime deploys.',
          task.stage,
        ));
      }

      if (!modelContent.includes('backup') && !modelContent.includes('recovery') && !modelContent.includes('pitr')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ARCHITECTURE_CONCERN, IssueSeverity.HIGH,
          'Missing backup and recovery plan',
          'Data model does not include backup strategy. Define backup frequency, retention, PITR capability, and automated restoration testing procedures.',
          task.stage,
        ));
      }

      if (!modelContent.includes('constraint') && !modelContent.includes('foreign key') && !modelContent.includes('not null')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ARCHITECTURE_CONCERN, IssueSeverity.MEDIUM,
          'Missing data integrity constraints',
          'Data model lacks explicit constraints. Define NOT NULL, CHECK, UNIQUE, and foreign key constraints to enforce data integrity at the database level.',
          task.stage,
        ));
      }
    }

    const archDoc = task.inputArtifacts.find((a) => a.type === ArtifactType.ARCHITECTURE_DOC);
    if (archDoc) {
      const archContent = archDoc.content.toLowerCase();
      if (archContent.includes('microservice') && !archContent.includes('database per service') && !archContent.includes('shared database')) {
        issues.push(this.createIssue(
          task.featureId, IssueType.ARCHITECTURE_CONCERN, IssueSeverity.MEDIUM,
          'Database ownership unclear in microservices',
          'Architecture mentions microservices but does not clarify database ownership. Define whether using database-per-service or shared database pattern, and document cross-service data access strategies.',
          task.stage,
        ));
      }
    }

    return issues;
  }

  private generateDatabaseSchema(archDoc?: Artifact, dataModel?: Artifact): string {
    const sections: string[] = [
      '# Database Schema',
      '',
      '## Design Principles',
      '- Normalize to 3NF for OLTP tables, denormalize read-heavy paths with materialized views',
      '- NOT NULL by default, nullable columns are the exception',
      '- Audit columns (created_at, updated_at) on every table',
      '- Soft deletes with deleted_at column where business requires it',
      '',
      '## Tables',
      dataModel
        ? 'Schema derived from provided data model. See DDL below.'
        : 'Data model not provided — schema template with common patterns.',
      '',
      '## Example DDL Template',
      '```sql',
      'CREATE TABLE users (',
      '  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
      '  email VARCHAR(255) NOT NULL UNIQUE,',
      '  display_name VARCHAR(100) NOT NULL,',
      '  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),',
      '  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),',
      '  deleted_at TIMESTAMPTZ',
      ');',
      '',
      'CREATE INDEX idx_users_email ON users (email);',
      'CREATE INDEX idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NOT NULL;',
      '```',
      '',
      '## Indexes',
      '- Primary keys: implicit B-tree index',
      '- Foreign keys: always index the referencing column',
      '- Query-driven indexes: add based on EXPLAIN ANALYZE results',
      '- Partial indexes where applicable (e.g., active records only)',
      '',
      '## Partitioning Strategy',
      '- Time-series data: range partition by month',
      '- High-cardinality lookup tables: hash partition',
      '- Partition maintenance: automated monthly partition creation',
    ];
    return sections.join('\n');
  }

  private generateMigrationScripts(dataModel?: Artifact): string {
    const sections: string[] = [
      '# Migration Scripts',
      '',
      '## Migration Framework',
      '- Sequential version numbering: V001, V002, ...',
      '- Every migration has UP and DOWN scripts',
      '- Migrations are idempotent (IF NOT EXISTS / IF EXISTS guards)',
      '',
      '## Zero-Downtime Pattern: Expand-Contract',
      '',
      '### Phase 1: Expand (backward compatible)',
      '```sql',
      '-- V001_add_new_column.up.sql',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);',
      '',
      '-- V001_add_new_column.down.sql',
      'ALTER TABLE users DROP COLUMN IF EXISTS phone;',
      '```',
      '',
      '### Phase 2: Migrate Data',
      '```sql',
      '-- V002_backfill_phone.up.sql',
      '-- Batched update to avoid locking',
      'UPDATE users SET phone = legacy_phone',
      'WHERE phone IS NULL AND legacy_phone IS NOT NULL',
      'LIMIT 1000;',
      '```',
      '',
      '### Phase 3: Contract (remove old)',
      '```sql',
      '-- V003_drop_legacy_column.up.sql',
      'ALTER TABLE users DROP COLUMN IF EXISTS legacy_phone;',
      '',
      '-- V003_drop_legacy_column.down.sql',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy_phone VARCHAR(20);',
      '```',
      '',
      '## Validation',
      '- Row count comparison before and after migration',
      '- Checksum validation for data integrity',
      '- Referential integrity check post-migration',
      '- Application smoke tests after each phase',
    ];
    return sections.join('\n');
  }

  private generateQueryOptimizationReport(sources: Artifact[]): string {
    const sections: string[] = [
      '# Query Optimization Report',
      '',
      '## Anti-Patterns to Check',
      '- SELECT * instead of specific columns',
      '- N+1 queries (queries inside application loops)',
      '- Functions on indexed columns in WHERE clauses',
      '- LIKE with leading wildcard (%pattern)',
      '- Missing LIMIT on potentially unbounded queries',
      '- Implicit type casting in JOIN conditions',
      '- Correlated subqueries replaceable with JOINs',
      '',
      '## Index Recommendations',
      '- Analyze slow query log for queries >100ms',
      '- Add composite indexes matching common WHERE + ORDER BY patterns',
      '- Consider covering indexes for frequent queries to enable index-only scans',
      '- Use partial indexes for filtered subsets (e.g., active records)',
      '',
      `## Source Artifacts Analyzed: ${sources.length}`,
      '',
      '## EXPLAIN Analysis Guide',
      '- Run EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) on all critical queries',
      '- Flag sequential scans on tables >10K rows',
      '- Identify nested loop joins on large tables (prefer hash/merge join)',
      '- Check for sort operations that could be eliminated with indexes',
      '',
      '## Connection Pool Recommendations',
      '- Pool size: (CPU cores × 2) + effective_spindle_count',
      '- Use transaction-mode pooling for short-lived queries',
      '- Monitor active vs. idle connections',
      '- Set statement_timeout to prevent runaway queries',
    ];
    return sections.join('\n');
  }

  private detectN1Queries(content: string): boolean {
    const patterns = [
      /for\s*\(.*\)\s*\{[\s\S]{0,200}(query|find|select|fetch|get)/i,
      /\.forEach\([\s\S]{0,200}(query|find|select|fetch|get)/i,
      /\.map\([\s\S]{0,200}(query|find|select|fetch|get)/i,
      /while\s*\(.*\)\s*\{[\s\S]{0,200}(query|find|select|fetch|get)/i,
    ];
    return patterns.some((p) => p.test(content));
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
          type: typeMatch[1].trim(),
          name: nameMatch[1].trim(),
          description: descMatch?.[1]?.trim() ?? '',
          content: contentMatch?.[1]?.trim() ?? '',
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
          type: typeMatch[1].trim(),
          severity: sevMatch?.[1]?.trim() ?? 'medium',
          title: titleMatch[1].trim(),
          description: descMatch?.[1]?.trim() ?? '',
        });
      }
    }

    const summaryMatch = raw.match(/### Summary\s*([\s\S]*?)(?=###|---ARTIFACT_START|$)/);
    const recsMatch = raw.match(/### Recommendations\s*([\s\S]*?)$/);

    return {
      summary: summaryMatch?.[1]?.trim() ?? '',
      artifacts,
      issues,
      recommendations: recsMatch?.[1]?.trim() ?? '',
    };
  }

  private resolveArtifactType(typeStr: string): ArtifactType | null {
    const normalized = typeStr.toLowerCase().replace(/[\s_-]+/g, '_');
    const mapping: Record<string, ArtifactType> = {
      database_schema: ArtifactType.DATABASE_SCHEMA,
      migration_script: ArtifactType.MIGRATION_SCRIPT,
      query_optimization_report: ArtifactType.QUERY_OPTIMIZATION_REPORT,
    };
    return mapping[normalized] ?? null;
  }

  private resolveIssueSeverity(sevStr: string): IssueSeverity {
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
