# Claude Dev Manager (CDM)

An AI-powered development management system that orchestrates **5 versatile agents** with **17 composable skills** through **adaptive pipeline templates** — from requirements to production deployment. CDM works on **new and existing projects**, respects your code style, and generates production-ready artifacts for **AWS, GCP, and Azure**.

Think of it as a virtual engineering team you manage through a single CLI.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Installation](#installation)
- [Quick Start (5 minutes)](#quick-start-5-minutes)
- [Using CDM on an Existing Project](#using-cdm-on-an-existing-project)
- [Real-World Examples](#real-world-examples)
- [All Commands](#all-commands)
- [The 5 Agents](#the-5-agents)
- [The 17 Skills](#the-17-skills)
- [The 6 Pipeline Templates](#the-6-pipeline-templates)
- [Configuration](#configuration)
- [Cloud Provider Support](#cloud-provider-support)
- [Development History & Tracking](#development-history--tracking)
- [Claude Code Plugin](#claude-code-plugin)
- [Project Structure](#project-structure)
- [Development](#development)
- [License](#license)

---

## How It Works

```
You describe a feature
       ↓
CDM analyzes your project (structure + code style)
       ↓
Planner agent selects a template (or you pick one):
  quick-fix · feature · full-feature · review-only · design-only · deploy
       ↓
Agents execute steps with injected skills:
  📋 Planner → 🏗️ Architect → 💻 Developer → 🔍 Reviewer → 🚀 Operator
       ↓
Each step produces versioned artifacts:
  specs, schemas, code, tests, security reports, runbooks, etc.
       ↓
Everything is tracked: history, metrics, agent activity
```

**Two execution modes:**
- **`claude-cli`** (default) — Each agent runs as a real Claude Code subprocess with its specialized system prompt. This is the production mode.
- **`simulation`** — Agents produce template-based output locally. Useful for testing pipelines without an API key.

---

## Installation

```bash
git clone https://github.com/MoAdelArar/claude-dev-manager.git
cd claude-dev-manager
npm install
npm run build
npm link   # Makes 'cdm' available globally
```

**Requirements:** Node.js >= 20

### Optional: Install RTK (60-90% token savings)

[RTK](https://github.com/rtk-ai/rtk) compresses CLI command outputs before they reach the agent's context window. When installed, CDM agent subprocesses automatically benefit from reduced token consumption.

```bash
# macOS (Homebrew)
brew install rtk && rtk init --global

# Linux (install script)
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
rtk init --global

# Windows
winget install rtk-ai.rtk
rtk init --global
```

**Auto-install during npm install:**
```bash
CDM_AUTO_INSTALL_RTK=1 npm install
```

CDM will detect RTK automatically. If not installed, CDM works fine — you'll just see a tip suggesting installation.

**Verify it works:**

```bash
cdm --version
# 2.0.0

cdm agents
# Lists all 5 agents with their skills

cdm skills
# Lists all 17 skills by category
```

---

## Quick Start (5 minutes)

### Step 1: Initialize CDM in your project

```bash
cd ~/my-project
cdm init
```

This creates:
- `cdm.config.yaml` — project configuration (auto-detects language, framework, cloud)
- `.cdm/analysis/` — structured project analysis (overview, structure, code style, per-entity)
- `.cdm/agents/` — instruction files for each of the 5 agents
- `CLAUDE.md` — instructions for Claude Code

### Step 2: Review what CDM detected

```bash
cdm config
```

```
⚙️  CDM Configuration

Project:
  Language:       typescript
  Framework:      express
  Test framework: jest
  Build tool:     tsc
  Cloud provider: aws

Pipeline:
  Max retries:    2
  Timeout (min):  30
```

### Step 3: Start a feature pipeline

```bash
cdm start "Add user authentication with JWT and refresh tokens"
```

Watch the pipeline execute — the Planner selects the `feature` template automatically:

```
🚀 Claude Dev Manager v2.0.0

Project: my-project
Language: typescript | Framework: express
Feature: Add user authentication with JWT and refresh tokens

──────────────────────────────────────────────────────────

📋 Pipeline Execution

✔ Step 0: Analyze requirements and acceptance criteria
✔ Step 1: Design system architecture
✔ Step 2: Implement feature with tests
✔ Step 3: Review implementation quality

──────────────────────────────────────────────────────────

✅ Pipeline Completed Successfully!

Summary:
  Execution mode:   claude-cli
  Template used:    feature
  Steps completed:  4
  Steps failed:     0
  Steps skipped:    0
  Artifacts:        18
  Issues:           3
  Tokens used:      84,210
  Duration:         3m 12s
```

### Step 4: Explore what was produced

```bash
# See all artifacts
cdm artifacts

# View a specific artifact
cdm show "Security Report"

# Check pipeline status
cdm status

# See the full development timeline
cdm history
```

---

## Using CDM on an Existing Project

CDM is designed to work on already-built projects. When you run `cdm init` or `cdm analyze` on an existing codebase, it:

1. **Scans your file structure** — builds a file map with every module's exports, imports, and descriptions
2. **Profiles your code style** — detects naming conventions (kebab-case files, camelCase vars), architecture pattern (MVC, Clean, Feature-based), error handling strategy, import style, formatting, testing patterns, TypeScript strictness, and API patterns
3. **Detects your stack** — language, framework, test runner, build tool, cloud provider (from SDK imports and config files)

This produces structured analysis files that agents read instead of scanning every source file:

| File | Purpose | Example detection |
|---|---|---|
| `.cdm/analysis/overview.md` | Stack, dependencies, patterns | "42 modules, Express + Prisma, 15K lines" |
| `.cdm/analysis/codestyle.md` | Convention rules | "kebab-case files, Zod validation, describe/it tests, strict TS" |
| `.cdm/analysis/structure.md` | Project file tree | Directory layout and module map |

**Agents are instructed to follow your conventions.** If your project uses snake_case, Repository pattern, and Vitest — agents will match that.

```bash
# Analyze any existing project
cdm analyze --project ~/existing-api

# Then start a feature — agents respect your style
cdm start "Add webhook delivery system" --project ~/existing-api
```

---

## Real-World Examples

### Example 1: Backend API feature

```bash
cdm start "Add Stripe payment integration with subscriptions and invoicing"
```

The Planner selects `full-feature` (6 steps). What gets produced:
- **Planner**: Requirements doc, user stories, acceptance criteria
- **Architect**: API design, webhook architecture, data model, technology decision record
- **Developer**: Implementation code, unit tests, integration tests
- **Reviewer**: Code review report, security audit (PCI-DSS), performance analysis
- **Operator**: CI/CD config, deployment plan, monitoring, runbook

### Example 2: Greenfield microservice

```bash
cdm init --project ~/new-service
cdm config --set project.cloudProvider=gcp
cdm start "Build a notification service supporting email, SMS, and push" --priority high
```

### Example 3: Quick bug fix (skip design steps)

```bash
cdm start "Fix race condition in order processing" --template quick-fix
```

The `quick-fix` template runs only 2 steps: Developer → Reviewer.

### Example 4: Resume a failed pipeline

```bash
# Pipeline failed at step 2? Fix the issue, then:
cdm resume

# Or resume a specific feature:
cdm resume abc123-feature-id
```

### Example 5: Dry run (see what would happen)

```bash
cdm start "Add real-time chat with WebSocket" --dry-run
```

```
📋 DRY RUN — Pipeline will analyze task and show plan:

--- Execution Plan Summary ---
Template: feature
Steps:
  0. planner [requirements-analysis]
     Analyze requirements and acceptance criteria
  1. architect [system-design] (depends on: 0)
     Design system architecture
  2. developer [code-implementation, test-writing] (depends on: 1)
     Implement feature with tests
  3. reviewer [code-review] (depends on: 2)
     Review implementation quality
--- End Summary ---
```

### Example 6: Use simulation mode (no API key needed)

```bash
cdm start "Add search API" --mode simulation
```

### Example 7: Security and design audits

```bash
# Review-only: run all review skills on existing code
cdm start "Audit the payments module" --template review-only

# Design-only: generate architecture without implementing
cdm start "Design the event sourcing layer" --template design-only
```

---

## All Commands

### `cdm init`

Initialize CDM in a project. Creates config, agent instruction files, project analysis, and code style profile.

```bash
cdm init                          # Current directory
cdm init --project ~/my-app       # Specific project
```

### `cdm analyze`

Re-scan the project. Updates the structural analysis and code style profile. Run this after major refactors.

```bash
cdm analyze
cdm analyze --json                # Also output raw JSON
cdm analyze -o custom-path.md     # Custom output path
```

### `cdm start <description>`

Start a new feature pipeline.

```bash
cdm start "Add user authentication"
cdm start "Add OAuth2 login" --priority critical
cdm start "Fix typo in header" --template quick-fix
cdm start "Add caching layer" --skip-steps 0,1
cdm start "Add search" --mode simulation
cdm start "Add payments" --model claude-sonnet-4-20250514
cdm start "Add API v2" --max-retries 3
cdm start "Refactor auth" --dry-run
cdm start "Quick fix" --no-interactive
```

| Option | Description | Default |
|---|---|---|
| `-t, --template` | `quick-fix`, `feature`, `full-feature`, `review-only`, `design-only`, `deploy` | auto-selected |
| `-p, --priority` | `low`, `medium`, `high`, `critical` | `medium` |
| `--skip-steps` | Comma-separated step indices to skip | none |
| `--mode` | `claude-cli` or `simulation` | `claude-cli` |
| `--model` | Claude model override | system default |
| `--max-retries` | Retries per step | `2` |
| `--dry-run` | Show plan without executing | `false` |
| `--no-interactive` | Skip prompts | `false` |
| `-v, --verbose` | Debug output | `false` |
| `--json` | Output result as JSON | `false` |

### `cdm resume [feature-id]`

Resume a failed or paused pipeline from its last incomplete step.

```bash
cdm resume                        # Resume most recent feature
cdm resume abc-123                # Resume specific feature
cdm resume --mode simulation      # Resume in simulation mode
```

### `cdm status`

Show all features and their pipeline progress.

```bash
cdm status
```

### `cdm show <target>`

View details of an artifact (by ID or name) or a feature.

```bash
cdm show "Security Report"
cdm show abc-123-artifact-id
cdm show abc-123-feature-id
```

### `cdm artifacts`

List all produced artifacts with summaries by type and status.

```bash
cdm artifacts
cdm artifacts --type security_report
```

### `cdm agents`

List the 5 agents and their compatible skills.

### `cdm skills`

List all 17 skills organized by category.

```bash
cdm skills
cdm skills --category review
```

### `cdm pipeline`

Show the 6 available pipeline templates.

```bash
cdm pipeline
cdm pipeline --template feature   # Show template details
```

### `cdm history`

View the development timeline — every event, agent action, and metric.

```bash
cdm history                       # Summary + last 30 events
cdm history --last 100            # Last 100 events
cdm history --feature abc-123     # Filter by feature
cdm history --export              # Export to .cdm/history/ as markdown + JSON
```

### `cdm config`

View or modify CDM configuration.

```bash
cdm config                                      # View all
cdm config --set project.cloudProvider=gcp       # Change cloud provider
cdm config --set pipeline.maxRetries=3           # Change retries
cdm config --reset                               # Back to defaults
```

---

## The 5 Agents

CDM uses 5 broad agents instead of many specialized ones. Each agent receives **skills** at runtime that define what it does for a given step.

| Agent | Role | Compatible Skills |
|---|---|---|
| **Planner** | Planning, decomposition, classification | `requirements-analysis`, `task-decomposition` |
| **Architect** | Design, structure, contracts | `system-design`, `api-design`, `data-modeling`, `ui-design` |
| **Developer** | Implementation, testing, documentation | `code-implementation`, `test-writing`, `documentation` |
| **Reviewer** | Quality assurance, audits | `code-review`, `security-audit`, `performance-analysis`, `accessibility-audit`, `test-validation` |
| **Operator** | Deployment, infrastructure, monitoring | `ci-cd`, `deployment`, `monitoring` |

Skills are injected at runtime via `agent.setActiveSkills(skills)`. An agent's prompt is composed from its base system prompt plus the active skill templates. This means fewer LLM calls with richer context.

---

## The 17 Skills

Skills are composable capabilities that can be assigned to agents. Each skill defines a prompt template and expected artifact types.

| Category | Skills |
|---|---|
| **Planning** (2) | `requirements-analysis`, `task-decomposition` |
| **Design** (4) | `system-design`, `api-design`, `data-modeling`, `ui-design` |
| **Build** (3) | `code-implementation`, `test-writing`, `documentation` |
| **Review** (5) | `code-review`, `security-audit`, `performance-analysis`, `accessibility-audit`, `test-validation` |
| **Operations** (3) | `ci-cd`, `deployment`, `monitoring` |

```bash
# List all skills
cdm skills

# Filter by category
cdm skills --category design
```

---

## The 6 Pipeline Templates

Templates define how many steps to run and which agents/skills to use. The Planner agent auto-selects a template based on task analysis, or you can force one with `--template`.

| Template | Steps | Flow | Best for |
|---|---|---|---|
| `quick-fix` | 2 | Developer → Reviewer | Bugs, typos, small tweaks |
| `feature` | 4 | Planner → Architect → Developer → Reviewer | Standard feature work |
| `full-feature` | 6 | feature + Security + Operator | Features needing security review and deployment |
| `review-only` | 1 | Reviewer (multi-skill) | Audits and assessments |
| `design-only` | 2 | Planner → Architect | Architecture spikes, RFCs |
| `deploy` | 1 | Operator | Deploy existing code |

Each step:
- Produces **artifacts** (requirements, schemas, code, tests, reports, runbooks)
- May identify **issues** (bugs, design flaws, security vulnerabilities)
- Must pass **gate conditions** before the pipeline advances
- Can be **retried** if it fails (up to `maxRetries`)
- Can be **skipped** via `--skip-steps`

```bash
# See all templates
cdm pipeline

# See details for a specific template
cdm pipeline --template full-feature

# Force a specific template
cdm start "Fix login bug" --template quick-fix
```

---

## Configuration

CDM auto-detects your project setup during `cdm init`. Override anything in `cdm.config.yaml`:

```yaml
project:
  language: typescript        # Auto-detected from tsconfig.json, package.json, etc.
  framework: express          # Auto-detected from dependencies
  testFramework: jest         # Auto-detected from dependencies
  buildTool: tsc              # Auto-detected from build scripts
  cloudProvider: aws          # aws | gcp | azure | none
  ciProvider: github-actions
  deployTarget: docker
  branchStrategy: gitflow
  customInstructions: ""      # Free-text instructions injected into all agents

pipeline:
  maxRetries: 2
  timeoutMinutes: 30
  requireApprovals: false
  parallelExecution: false

agents:
  planner:
    enabled: true
  architect:
    enabled: true
  developer:
    enabled: true
  reviewer:
    enabled: true
    customInstructions: "Focus on GDPR and SOC2 compliance"
  operator:
    enabled: true
```

**Quick config changes:**

```bash
cdm config --set project.cloudProvider=gcp
cdm config --set agents.reviewer.customInstructions="Focus on HIPAA"
cdm config --set pipeline.maxRetries=5
cdm config --reset   # Back to defaults
```

---

## Cloud Provider Support

CDM generates production-grade infrastructure artifacts tailored to your cloud provider:

| Artifact | AWS | GCP | Azure |
|---|---|---|---|
| **Monitoring** | CloudWatch + X-Ray | Cloud Monitoring + Trace | Application Insights |
| **Alerting** | CloudWatch Alarms + SNS | Alerting Policies | Azure Alerts + Action Groups |
| **Scaling** | ECS/EKS Auto Scaling, Karpenter | GKE HPA, Node Auto-Provisioning | AKS HPA, Cluster Autoscaler |
| **Cost** | Cost Explorer, Savings Plans | Billing, Committed Use Discounts | Cost Management, Reservations |
| **SLA/SLO** | Error budgets, burn-rate alerts | SLO Monitoring Service | App Insights SLOs |
| **DR** | Multi-AZ, Cross-Region Aurora | Multi-Region GCS + SQL | Geo-Replication, Front Door |
| **Performance** | k6/Artillery benchmarks | k6/Locust benchmarks | Azure Load Testing |
| **Runbook** | ECS/EKS incident procedures | GKE operational guides | AKS operational guides |

---

## Development History & Tracking

CDM automatically records a complete timeline of every development action:

```bash
cdm history
```

```
📜 Development History: my-project

Summary:
  Features:     3 (2 completed, 1 failed)
  Steps run:    14
  Artifacts:    52
  Issues:       12 found, 8 resolved
  Tokens:       184,210
  Duration:     8m 30s

Agent Activity:
  Planner:   3 tasks, 12,100 tokens, 0.8s
  Architect: 3 tasks, 18,400 tokens, 1.5s
  Developer: 4 tasks, 89,200 tokens, 4.2s
  Reviewer:  6 tasks, 42,100 tokens, 2.1s
  Operator:  2 tasks, 22,410 tokens, 1.2s

Timeline (last 30 events):
  10:23:01 Pipeline started for "Add payments" (mode: claude-cli)
  10:23:02 Step started: 0 — planner [requirements-analysis]
  10:23:15 Step completed: 0 — 3 artifacts
  ...
```

Export to files:
```bash
cdm history --export
# Creates .cdm/history/development-history.md and .json
```

---

## Claude Code Plugin (built-in)

CDM includes a built-in MCP server — no separate plugin repo needed. Register it with Claude Code once:

```bash
# One-command setup
./scripts/install.sh
```

This registers the MCP server and installs slash commands. Restart Claude Code, then:

```
You: /cdm-init
You: /cdm-start Add user authentication with OAuth2
You: /cdm-status
You: /cdm-history
You: /cdm-skills
You: /cdm-pipeline
You: /cdm-artifacts
You: /cdm-config
```

### Manual MCP registration

If you prefer to register manually, add to `~/.claude/mcp_servers.json`:

```json
{
  "claude-dev-manager": {
    "command": "node",
    "args": ["/absolute/path/to/claude-dev-manager/dist/mcp-server.js"]
  }
}
```

### MCP tools exposed

| Tool | CLI Equivalent |
|---|---|
| `cdm_init` | `cdm init` |
| `cdm_analyze` | `cdm analyze` |
| `cdm_start_pipeline` | `cdm start` |
| `cdm_resume_pipeline` | `cdm resume` |
| `cdm_get_status` | `cdm status` |
| `cdm_list_artifacts` | `cdm artifacts` |
| `cdm_show_artifact` | `cdm show` (artifact) |
| `cdm_show_feature` | `cdm show` (feature) |
| `cdm_list_agents` | `cdm agents` |
| `cdm_list_skills` | `cdm skills` |
| `cdm_get_skill` | `cdm skills --id <id>` |
| `cdm_pipeline` | `cdm pipeline` |
| `cdm_get_config` | `cdm config` |
| `cdm_set_config` | `cdm config --set` |
| `cdm_reset_config` | `cdm config --reset` |
| `cdm_get_history` | `cdm history` |
| `cdm_export_history` | `cdm history --export` |
| `cdm_get_analysis` | *(direct read)* |
| `cdm_get_codestyle` | *(direct read)* |

---

## Project Structure

```
src/
  agents/           # 5 agents: planner, architect, developer, reviewer, operator
  skills/           # 17 skill definitions + SkillRegistry
  analyzer/         # ProjectAnalyzer + CodeStyleProfiler
  cloud/            # AWS, GCP, Azure infrastructure providers
  communication/    # AgentMessageBus (typed events for inter-agent handoff)
  context/          # Context optimizer for token reduction
  orchestrator/     # PipelineOrchestrator, ProjectContext, Claude Code bridge
  pipeline/         # templates.ts (6 templates), executor.ts (step runner)
  tracker/          # Event log, metrics, token usage
  workspace/        # ArtifactStore (versioned CRUD in .cdm/)
  utils/            # Config (YAML), logger, validators (Zod)
  types.ts          # All shared types — single source of truth
  cli.ts            # CLI entry point (npm/terminal)
  mcp-server.ts     # MCP server entry point (Claude Code plugin)
commands/           # Slash commands for Claude Code (/cdm-*)
scripts/            # install.sh for Claude Code registration
templates/          # Markdown artifact templates
tests/
  unit/             # Unit tests per module
  e2e/              # End-to-end tests (CLI invocation)
```

---

## Development

```bash
npm run dev          # Run CLI via ts-node (no build needed)
npm run build        # Compile TypeScript
npm run mcp          # Start MCP server (for testing)
npm test             # Type-check + run all tests with coverage
npm run test:unit    # Unit tests only
npm run test:e2e     # E2E tests only
npm run lint         # Lint source code
npm run lint:fix     # Auto-fix lint issues
npm run typecheck    # Type-check without building
```

---

## License

MIT — see [LICENSE](LICENSE) for details.
