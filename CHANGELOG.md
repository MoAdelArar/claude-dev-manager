# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-03-14

### Breaking Changes

- **Architecture Redesign**: Replaced 18 specialized agents with 5 broad agents (Planner, Architect, Developer, Reviewer, Operator)
- **Skill-Based System**: Introduced 17 composable skills that can be injected into agents at runtime
- **Step-Based Execution**: Replaced fixed 10-stage pipeline with flexible `ExecutionPlan` composed of `ExecutionStep`s
- **CLI Options**: Changed `--skip <stages>` to `--skip-steps <steps>` (step indices instead of stage names)
- **Environment Variables**: Renamed `CDM_PIPELINE_STAGE` to `CDM_PIPELINE_STEP`

### Added

- **17 Composable Skills**:
  - Planning: `requirements-analysis`, `task-decomposition`
  - Design: `system-design`, `api-design`, `data-modeling`, `ui-design`
  - Build: `code-implementation`, `test-writing`, `documentation`
  - Review: `code-review`, `security-audit`, `performance-analysis`, `accessibility-audit`, `test-validation`
  - Operations: `ci-cd`, `deployment`, `monitoring`

- **6 Pipeline Templates**:
  - `quick-fix` (2 steps): Developer → Reviewer
  - `feature` (4 steps): Planner → Architect → Developer → Reviewer
  - `full-feature` (6 steps): feature + Security + Operator
  - `review-only` (1 step): Reviewer with multiple skills
  - `design-only` (2 steps): Planner → Architect
  - `deploy` (1 step): Operator

- **New CLI Commands**:
  - `cdm skills [--category <cat>]` — List available skills
  - `cdm pipeline [--template <name>]` — List templates or show template details

- **SkillRegistry**: Central registry for skill definitions with `composePrompt()` for building agent prompts
- **PipelineExecutor**: Step-by-step execution engine with retry, gate conditions, and state persistence
- **Context Optimizer**: Role-aware filtering of project context to reduce LLM token usage
- **Intelligent Template Selection**: Planner agent auto-selects template when `--template` not specified

### Changed

- **Agent System**: Agents now receive skills via `setActiveSkills()` instead of having fixed responsibilities
- **Artifact Routing**: Skills define `expectedArtifacts[]`; executor validates outputs against expectations
- **Resume Logic**: `cdm resume` now finds first incomplete or failed step using `feature.stepResults`
- **State Persistence**: Feature state uses `stepResults` Map instead of `stageResults`
- **Development Tracker**: Events now use `STEP_*` types instead of `STAGE_*`

### Fixed

- Date deserialization for `startedAt` and `completedAt` in step results when loading features from disk
- `startFromStep` option now properly skips completed steps when resuming pipelines
- `SKILL_ARTIFACT_MAP` now uses correct skill IDs matching registered skills

### Removed

- **18 Specialized Agents**: Product Manager, Engineering Manager, System Architect, UI/UX Designer, Senior Developer, Junior Developer, Code Reviewer, QA Engineer, Security Engineer, DevOps Engineer, Documentation Writer, etc.
- **10 Fixed Pipeline Stages**: Requirements Gathering, Architecture Design, UI/UX Design, Implementation, Code Review, Testing, Security Review, Documentation, Deployment, Maintenance
- **Stage-Based Types**: `PipelineStage`, `StageResult`, `StageStatus`, `StageConfig`, `StageMetrics`, `StageTransition`, `GateCondition` (old)
- **Stage-Based Methods**: `getForStage()`, `recordStageResult()`, `validateStageTransition()`
- **Backward Compatibility Layer**: No migration path from v1.x data format

## [1.x] - Previous Releases

See git history for changes prior to v2.0.0 architectural redesign.
