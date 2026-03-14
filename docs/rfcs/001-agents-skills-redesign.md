# RFC 001: Agents + Skills Redesign

**Status**: Proposed  
**Author**: Product Manager  
**Created**: 2026-03-14  

## Problem Statement

The current CDM architecture has three fundamental problems:

### 1. Excessive Cost per Task

The 18-agent / 10-stage pipeline runs **~22 LLM calls per feature** regardless of complexity. A simple typo fix goes through the same assembly line as a full authentication system:

| Task Type | Current LLM Calls | Actual Need |
|-----------|-------------------|-------------|
| Fix typo | ~22 | 2 |
| Add utility function | ~22 | 3-4 |
| Standard feature | ~22 | 5-6 |
| Full feature + deploy | ~22 | 8-10 |

This wastes tokens, increases latency, and frustrates users.

### 2. Rigid Pipeline

The 10 fixed stages cannot adapt to task complexity:
- Backend-only features still invoke UI/UX Design stage (skipped, but still evaluated)
- Simple refactors go through Requirements Gathering (unnecessary)
- Audits/reviews force-fit into the full pipeline

Users resort to `--skip` flags everywhere, defeating the purpose of an "intelligent" pipeline.

### 3. Poor Cross-Project Reuse

The 18 agents are implicitly TypeScript-centric:
- Prompts reference specific patterns (`async/await`, `interface`, ESM imports)
- Artifact types are role-specific (ROI_ANALYSIS, CHAOS_TEST_PLAN)
- No abstraction between "what an agent does" (skills) and "who the agent is" (persona)

Adding support for Python, Go, or Rust requires duplicating agent logic.

## Proposed Solution

Separate **agents** (who) from **skills** (what) and make the pipeline adaptive.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        User Task                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Planner Agent                           │
│  - Analyzes task description + project context              │
│  - Selects template or builds custom plan                   │
│  - Outputs: ExecutionPlan                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Pipeline Executor                         │
│  - Runs ExecutionPlan step by step                          │
│  - Each step: Agent + Skills                                │
│  - Parallel execution where dependencies allow              │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │ Architect│        │Developer │        │ Reviewer │
    │ + skills │        │ + skills │        │ + skills │
    └──────────┘        └──────────┘        └──────────┘
```

### The 5 Agents

| Agent | Persona | Absorbs |
|-------|---------|---------|
| **Planner** | Analyzes tasks, creates execution plans | Product Manager, Business Analyst, Engineering Manager |
| **Architect** | Designs systems, APIs, data models, UI | System Architect, Solutions Architect, DB Engineer, UI Designer |
| **Developer** | Writes code, tests, documentation | Senior Dev, Junior Dev, Documentation Writer |
| **Reviewer** | Evaluates quality through multiple lenses | Code Reviewer, QA, Security, Compliance, Perf, A11y |
| **Operator** | Handles deployment and operations | DevOps Engineer, SRE Engineer |

### The 16 Skills

Skills are composable prompt modules injected into agents at runtime:

**Planning**: requirements-analysis, task-decomposition  
**Design**: system-design, api-design, data-modeling, ui-design  
**Build**: code-implementation, test-writing, documentation  
**Review**: code-review, security-audit, performance-analysis, accessibility-audit, test-validation  
**Operations**: ci-cd, deployment, monitoring

### The 6 Pipeline Templates

| Template | Steps | Use Case |
|----------|-------|----------|
| quick-fix | Developer → Reviewer | Bugs, typos, small tweaks |
| feature | Planner → Architect → Developer → Reviewer | Standard features |
| full-feature | feature + Security + Operator | Auth, payments, deployment |
| review-only | Reviewer (multi-skill) | Audits and assessments |
| design-only | Planner → Architect | Architecture spikes |
| deploy | Operator | Shipping existing code |

## Success Metrics

### Cost Reduction

| Task Type | Before | After | Reduction |
|-----------|--------|-------|-----------|
| Fix typo | 22 calls | 2 calls | 91% |
| Utility function | 22 calls | 3 calls | 86% |
| Standard feature | 22 calls | 4 calls | 82% |
| Full feature | 22 calls | 6 calls | 73% |

### Cross-Project Reusability

- Skills use `{language}`, `{framework}`, `{testFramework}` placeholders
- Project analyzer provides context; skills adapt
- Same skill works for TypeScript, Python, Go, Rust

### Time to Add New Capability

| Capability | Before | After |
|------------|--------|-------|
| New review type | Create agent file, wire into stages, update types | Create skill file (~50 lines) |
| New template | Modify stage configs, update orchestrator | Add template definition (~20 lines) |
| Language support | Update all 18 agent prompts | Update project analyzer only |

## Migration Risk

### Breaking Changes

1. **AgentRole enum**: 18 values → 5 values
2. **PipelineStage enum**: Removed in favor of step-based ExecutionPlan
3. **cdm.config.yaml**: `agents` section changes from 18 keys to 5
4. **ArtifactType enum**: Simplified from ~55 to ~25 core types

### Mitigation

1. **Major version bump**: This is a v2.0.0 release
2. **Migration guide**: Document config file changes
3. **Deprecation warnings**: Old config keys log warnings, not errors
4. **Simulation mode**: All changes testable without API key

## Backward Compatibility Plan

### cdm.config.yaml

**Before (v1.x)**:
```yaml
agents:
  product_manager:
    enabled: true
  senior_developer:
    customInstructions: "..."
  # ... 16 more
```

**After (v2.x)**:
```yaml
agents:
  planner:
    enabled: true
  developer:
    customInstructions: "..."
  # ... 3 more

skills:
  disabled:
    - accessibility-audit
  custom:
    - path: ./my-skills/graphql.yaml

pipeline:
  defaultTemplate: feature
```

### CLI Commands

| Command | Change |
|---------|--------|
| `cdm start` | Adds `--template` flag |
| `cdm agents` | Shows 5 agents + skills |
| `cdm skills` | **New command** |
| `cdm resume` | Works with steps, not stages |
| `cdm status` | Shows ExecutionPlan progress |

### MCP Tools

| Tool | Change |
|------|--------|
| `cdm_list_agents` | Returns 5 agents with skills |
| `cdm_list_skills` | **New tool** |
| `cdm_start_pipeline` | Adds `template` param |
| `cdm_get_skill` | **New tool** |

## Implementation Phases

1. **Foundation** (types.ts, skill infrastructure)
2. **Skills** (16 skill definitions)
3. **Agents** (5 new agents, update BaseAgent)
4. **Pipeline** (templates, executor, Planner logic)
5. **Wiring** (orchestrator, bridge, CLI, MCP)
6. **Cleanup** (delete old files, update config)
7. **Testing** (unit + e2e)
8. **Release** (docs, changelog, version bump)

## Decision

Proceed with the redesign. The cost reduction alone justifies the effort, and the improved extensibility makes CDM viable for non-TypeScript projects.
