# Claude Dev Manager (CDM)

An AI-powered development management system that orchestrates **18 specialized agents** through a **10-stage pipeline** — from business analysis to production deployment. CDM works on **new and existing projects**, respects your code style, and generates production-ready artifacts for **AWS, GCP, and Azure**.

Think of it as a virtual engineering organization that you manage through a single CLI.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Installation](#installation)
- [Quick Start (5 minutes)](#quick-start-5-minutes)
- [Using CDM on an Existing Project](#using-cdm-on-an-existing-project)
- [Real-World Examples](#real-world-examples)
- [All Commands](#all-commands)
- [The 18 Agents](#the-18-agents)
- [The 10-Stage Pipeline](#the-10-stage-pipeline)
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
18 agents execute a 10-stage pipeline:
  📋 Requirements → 🏗️ Architecture → 🎨 UI/UX → 📝 Tasks
  → 💻 Implementation → 🔍 Code Review → 🧪 Testing
  → 🔒 Security & Compliance → 📚 Documentation → 🚀 Deployment
       ↓
Each stage produces versioned artifacts:
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

**Verify it works:**

```bash
cdm --version
# 1.0.0

cdm agents
# Lists all 18 agents
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
- `.cdm/project-analysis.md` — structural analysis of your codebase
- `.cdm/codestyle-profile.md` — your project's conventions (naming, patterns, formatting)
- `agents/` — instruction files for each of the 18 agents
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

Watch the pipeline execute through all 10 stages:

```
🚀 Claude Dev Manager v1.0.0

Project: my-project
Language: typescript | Framework: express
Feature: Add user authentication with JWT and refresh tokens

──────────────────────────────────────────────────────────

📋 Pipeline Execution

✔ 📋 Requirements Gathering — 5 artifacts, 0 issues
✔ 🏗️ Architecture Design — 9 artifacts, 2 issues
✔ 🎨 Ui Ux Design — Skipped
✔ 📝 Task Breakdown — 3 artifacts, 1 issues
✔ 💻 Implementation — 3 artifacts, 1 issues
✔ 🔍 Code Review — 1 artifacts, 3 issues
✔ 🧪 Testing — 10 artifacts, 2 issues
✔ 🔒 Security & Compliance Review — 2 artifacts, 5 issues
✔ 📚 Documentation — 3 artifacts, 0 issues
✔ 🚀 Deployment & NFR — 14 artifacts, 1 issues

──────────────────────────────────────────────────────────

✅ Pipeline Completed Successfully!

Summary:
  Execution mode:   claude-cli
  Stages completed: 9
  Stages skipped:   1
  Artifacts:        50
  Issues:           15
  Tokens used:      127,340
  Duration:         4m 23s
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

This produces two files that agents read instead of scanning every source file:

| File | Purpose | Example detection |
|---|---|---|
| `.cdm/project-analysis.md` | Codebase map | "42 modules, Express + Prisma, 15K lines" |
| `.cdm/codestyle-profile.md` | Convention rules | "kebab-case files, Zod validation, describe/it tests, strict TS" |

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

What gets produced:
- **Business Analyst**: ROI analysis, pricing model business case
- **Product Manager**: Requirements doc, user stories, acceptance criteria
- **Solutions Architect**: Technology decision record (Stripe vs Paddle vs custom), integration plan
- **System Architect**: API design, webhook architecture, data model
- **Database Engineer**: Payment schema, migration scripts
- **Developers**: Implementation code
- **QA + Performance**: Test suite, load test plan for payment endpoints
- **Security + Compliance**: PCI-DSS compliance report, PII handling assessment
- **DevOps + SRE**: Deployment plan, monitoring, alerting, runbook

### Example 2: Greenfield microservice

```bash
cdm init --project ~/new-service
cdm config --set project.cloudProvider=gcp
cdm start "Build a notification service supporting email, SMS, and push" --priority high
```

### Example 3: Quick bug fix (skip unnecessary stages)

```bash
cdm start "Fix race condition in order processing" \
  --skip ui_ux_design,documentation,deployment
```

### Example 4: Resume a failed pipeline

```bash
# Pipeline failed at Testing stage? Fix the issue, then:
cdm resume

# Or resume a specific feature:
cdm resume abc123-feature-id
```

### Example 5: Dry run (see what would happen)

```bash
cdm start "Add real-time chat with WebSocket" --dry-run
```

```
📋 DRY RUN — Pipeline stages that would execute:

  1.  📋 Requirements Gathering — Product Manager
      │
  2.  🏗️ Architecture Design — System Architect
      │
  3.  🎨 Ui Ux Design — UI/UX Designer
      │
  ...
```

### Example 6: Use simulation mode (no API key needed)

```bash
cdm start "Add search API" --mode simulation
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
cdm start "Add caching layer" --skip ui_ux_design,documentation
cdm start "Add search" --mode simulation
cdm start "Add payments" --model claude-sonnet-4-20250514
cdm start "Add API v2" --max-retries 3
cdm start "Refactor auth" --dry-run
cdm start "Quick fix" --no-interactive
```

| Option | Description | Default |
|---|---|---|
| `-p, --priority` | `low`, `medium`, `high`, `critical` | `medium` |
| `--skip` | Comma-separated stages to skip | none |
| `--mode` | `claude-cli` or `simulation` | `claude-cli` |
| `--model` | Claude model override | system default |
| `--max-retries` | Retries per stage | `2` |
| `--dry-run` | Show plan without executing | `false` |
| `--no-interactive` | Skip prompts | `false` |
| `-v, --verbose` | Debug output | `false` |

### `cdm resume [feature-id]`

Resume a failed or paused pipeline from its last incomplete stage.

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
cdm config --reset                               # Reset to defaults
```

### `cdm agents`

List all 18 agents with their roles and pipeline stages.

### `cdm pipeline`

Show the 10-stage pipeline configuration.

---

## The 18 Agents

### Business & Strategy

| Agent | What they do |
|---|---|
| **Product Manager** | Requirements docs, user stories, acceptance criteria, stakeholder analysis |
| **Business Analyst** | ROI analysis, business cases, KPIs, competitive analysis, RICE prioritization |

### Architecture & Design

| Agent | What they do |
|---|---|
| **Solutions Architect** | Technology decision records, integration plans, migration strategies, build-vs-buy |
| **System Architect** | System architecture, API specs, data models, system diagrams |
| **Database Engineer** | Schema design, migration scripts, query optimization, indexing strategy |
| **UI/UX Designer** | Interface specs, wireframes, component designs |

### Implementation

| Agent | What they do |
|---|---|
| **Engineering Manager** | Task breakdown, sprint planning, estimation, coordination |
| **Senior Developer** | Complex features, core architecture implementation |
| **Junior Developer** | Utilities, simpler features, unit tests |

### Quality & Compliance

| Agent | What they do |
|---|---|
| **Code Reviewer** | Code quality, patterns, best practices, standards enforcement |
| **QA Engineer** | Test plans, unit/integration/e2e tests, test reports |
| **Performance Engineer** | Load testing (k6), profiling, bottleneck analysis, capacity modeling |
| **Security Engineer** | OWASP Top 10 audit, vulnerability assessment, threat modeling |
| **Compliance Officer** | GDPR, HIPAA, SOC2, PCI-DSS, privacy impact assessments |
| **Accessibility Specialist** | WCAG 2.1/2.2 Level AA, screen reader support, a11y test suites |

### Operations

| Agent | What they do |
|---|---|
| **SRE Engineer** | SLO/SLI management, incident response, chaos engineering, capacity planning |
| **DevOps Engineer** | CI/CD, infrastructure, monitoring, scaling, DR, cost analysis (AWS/GCP/Azure) |
| **Documentation Writer** | API docs, developer guides, changelogs |

---

## The 10-Stage Pipeline

```
 1. 📋 Requirements Gathering        Product Manager + Business Analyst
    │
 2. 🏗️ Architecture Design           System Architect + Solutions Architect + Database Engineer
    │
 3. 🎨 UI/UX Design (skippable)      UI/UX Designer + Accessibility Specialist
    │
 4. 📝 Task Breakdown                Engineering Manager + Senior Developer
    │
 5. 💻 Implementation                Senior Developer + Junior Developer
    │
 6. 🔍 Code Review                   Code Reviewer (reviewed by Senior Developer)
    │
 7. 🧪 Testing                       QA Engineer + Performance Engineer + Accessibility Specialist
    │
 8. 🔒 Security & Compliance         Security Engineer + Compliance Officer
    (skippable)
    │
 9. 📚 Documentation (skippable)     Documentation Writer
    │
10. 🚀 Deployment & NFR (skippable)  DevOps Engineer + SRE Engineer
```

Each stage:
- Produces **artifacts** (requirements, schemas, code, tests, reports, runbooks)
- May identify **issues** (bugs, design flaws, security vulnerabilities, compliance violations)
- Must pass **gate conditions** before the pipeline advances
- Can be **retried** if revision is needed
- Can be **skipped** if marked as optional

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
  product_manager:
    enabled: true
  business_analyst:
    enabled: true
  ui_designer:
    enabled: false            # Disable for backend-only projects
  accessibility_specialist:
    enabled: false            # Disable if no UI
  compliance_officer:
    enabled: true
    customInstructions: "Focus on GDPR and SOC2 compliance"
```

**Quick config changes:**

```bash
cdm config --set project.cloudProvider=gcp
cdm config --set agents.ui_designer.enabled=false
cdm config --set pipeline.maxRetries=5
cdm config --reset   # Back to defaults
```

---

## Cloud Provider Support

CDM generates production-grade NFR (Non-Functional Requirements) artifacts tailored to your cloud provider:

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
  Stages run:   27
  Artifacts:    142
  Issues:       38 found, 12 resolved
  Tokens:       384,210
  Duration:     12m 45s

Agent Activity:
  Product Manager: 3 tasks, 24,100 tokens, 1.2s
  System Architect: 3 tasks, 31,400 tokens, 2.1s
  Senior Developer: 6 tasks, 89,200 tokens, 4.5s
  ...

Timeline (last 30 events):
  10:23:01 Pipeline started for "Add payments" (mode: claude-cli)
  10:23:02 Stage started: requirements_gathering (primary: product_manager)
  10:23:15 Stage completed: requirements_gathering [approved] — 5 artifacts
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

This registers the MCP server and installs 12 slash commands. Restart Claude Code, then:

```
You: /cdm-init
You: /cdm-start Add user authentication with OAuth2
You: /cdm-status
You: /cdm-history
You: /cdm-codestyle
You: /cdm-artifacts
You: /cdm-config
You: /cdm-pipeline
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

### 17 MCP tools exposed

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
  agents/           # 18 specialized agent implementations
  analyzer/         # Project analyzer + code style profiler
  cloud/            # AWS, GCP, Azure NFR providers
  communication/    # Agent message bus and handoff protocol
  orchestrator/     # Pipeline orchestrator, context, Claude Code bridge
  pipeline/         # Stage configs and transition engine
  tracker/          # Development history tracking
  utils/            # Config, logger, validators
  workspace/        # Artifact persistence
  types.ts          # Core type definitions
  cli.ts            # CLI entry point (npm/terminal)
  mcp-server.ts     # MCP server entry point (Claude Code plugin)
commands/           # Slash commands for Claude Code (/cdm-start, etc.)
scripts/            # install.sh for Claude Code registration
templates/          # Markdown artifact templates
tests/
  unit/             # Unit tests
  e2e/              # End-to-end tests (CLI + programmatic)
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
