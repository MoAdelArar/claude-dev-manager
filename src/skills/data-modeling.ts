import { type Skill, AgentRole, ArtifactType } from '../types';

export const dataModelingSkill: Skill = {
  id: 'data-modeling',
  name: 'Data Modeling',
  description: 'Design database schemas, entity relationships, migrations, and indexing strategies',
  category: 'design',
  compatibleAgents: [AgentRole.ARCHITECT],
  promptTemplate: `Design the data model for the requested feature.

Include:
1. **Entity Definitions**
   - Table/collection names
   - Fields with types and constraints
   - Primary keys and unique constraints
   - Default values and nullable fields

2. **Relationships**
   - Foreign keys and references
   - One-to-one, one-to-many, many-to-many
   - Cascade rules (delete, update)

3. **Indexes**
   - Primary and secondary indexes
   - Composite indexes for common queries
   - Full-text search indexes if needed

4. **Migration Strategy**
   - Steps to migrate from current schema
   - Data transformation scripts
   - Rollback procedures
   - Zero-downtime migration plan

5. **Query Patterns**
   - Common query patterns the schema supports
   - Performance considerations
   - Denormalization decisions (if any)

Output schema as SQL DDL or ORM model definitions for {framework}.
Consider the database type (PostgreSQL, MySQL, MongoDB, etc.) when applicable.`,
  expectedArtifacts: [ArtifactType.DATA_MODEL, ArtifactType.DATABASE_SCHEMA],
  requiredInputArtifacts: [ArtifactType.REQUIREMENTS_DOC],
};
