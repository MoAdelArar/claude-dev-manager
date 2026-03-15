# Claude Dev Manager (CDM)

An AI-powered development manager that dynamically selects specialized **personas** from [140+ agent definitions](https://github.com/msitarzewski/agency-agents) to match your task. CDM analyzes your project, picks the best-fit persona(s), composes a rich prompt, and executes via Claude — producing versioned artifacts from a single intelligent session.

Built with **React + Ink** for a rich terminal UI experience.

Think of it as hiring the right specialist for every task, automatically.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Using CDM on an Existing Project](#using-cdm-on-an-existing-project)
- [Real-World Examples](#real-world-examples)
- [All Commands](#all-commands)
- [The Persona System](#the-persona-system)
- [Configuration](#configuration)
- [Development History & Tracking](#development-history--tracking)
- [Claude Code Plugin (MCP)](#claude-code-plugin-mcp)
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
PersonaResolver matches task to best-fit persona(s):
  signals extracted → personas scored → primary + supporting selected
       ↓
PromptComposer builds a single rich prompt:
  persona identity + project context + task + self-review checklist
       ↓
Claude executes in one session (+ optional review pass)
       ↓
Artifacts parsed and stored:
  specs, schemas, code, tests, security reports, etc.
       ↓
Everything is tracked: history, metrics, persona usage
```

**Two execution modes:**
- **`claude-cli`** (default) — Claude Code executes with the composed persona prompt. This is the production mode.
- **`simulation`** — Generates template-based output locally. Useful for testing without an API key.

**Why personas over pipelines?**

The old approach ran 5 fixed agents through a multi-step pipeline with handoffs. The new approach puts the right expertise into a single Claude session — fewer LLM calls, richer context, better results. A secondary review pass activates automatically for risky tasks (auth, payments, security).

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

[RTK](https://github.com/rtk-ai/rtk) compresses CLI command outputs before they reach the agent's context window.

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

CDM detects RTK automatically. If not installed, CDM works fine — you'll just see a tip suggesting installation.

**Verify it works:**

```bash
cdm --version
# 3.0.0

cdm personas list
# Lists all available personas by division

cdm dashboard
# Shows project overview with stats, artifacts, and issues
```

---

## Quick Start

### Step 1: Initialize CDM in your project

```bash
cd ~/my-project
cdm init
```

This:
- Creates `cdm.config.yaml` — project configuration (auto-detects language, framework, cloud)
- Fetches 140+ personas from [agency-agents](https://github.com/msitarzewski/agency-agents)
- Builds a searchable persona catalog in `.cdm/personas/catalog-index.json`
- Generates `.cdm/analysis/` — structured project analysis
- Creates `CLAUDE.md` — instructions for Claude Code

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

Execution:
  Max retries:    2
  Timeout (min):  30
  Default mode:   claude-cli

Personas:
  Divisions:      engineering, design, testing, product, project-management, support, specialized
  Overrides:      none
```

### Step 3: Start a feature

**Option A: Interactive wizard (recommended for new users)**

```bash
cdm start
```

The wizard guides you through:
1. Feature description (free text)
2. Priority level (low, medium, high, critical)
3. Confirmation

**Option B: Direct command**

```bash
cdm start "Add user authentication with JWT and refresh tokens"
```

**Option C: Preview persona selection first**

```bash
cdm start "Add user authentication" --dry-run
```

Watch CDM resolve personas and execute:

```
🚀 Claude Dev Manager v3.0.0

Project: my-project
Language: typescript | Framework: express
Feature: Add user authentication with JWT and refresh tokens

──────────────────────────────────────────────────────────

🔍 Resolving personas...
  Primary:    🔐 Security Engineer (engineering-security-engineer)
  Supporting: 🧪 Reality Checker (testing-reality-checker)
  Review:     enabled (risk signals: auth)

💬 Executing with Security Engineer persona...
✅ Main pass completed

🔍 Running review pass...
✅ Review pass completed

──────────────────────────────────────────────────────────

✅ Execution Completed!

Summary:
  Primary persona:  Security Engineer
  Review pass:      yes
  Artifacts:        12
  Issues:           2
  Tokens used:      42,100
  Duration:         1m 48s
```

### Step 4: Explore what was produced

```bash
# See all artifacts
cdm artifacts

# View a specific artifact
cdm show "Security Report"

# Check feature status
cdm status

# See the full development timeline
cdm history
```

---

## Using CDM on an Existing Project

CDM is designed to work on already-built projects. When you run `cdm init` or `cdm analyze`, it:

1. **Scans your file structure** — builds a file map with every module's exports, imports, and descriptions
2. **Profiles your code style** — detects naming conventions, architecture patterns, error handling, import style, formatting, testing patterns, and TypeScript strictness
3. **Detects your stack** — language, framework, test runner, build tool, cloud provider

This context is injected into every persona prompt, so the output matches your project's conventions.

```bash
# Analyze any existing project
cdm analyze --project ~/existing-api

# Then start a feature — personas respect your style
cdm start "Add webhook delivery system" --project ~/existing-api
```

---

## Real-World Examples

### Example 1: Backend API feature

```bash
cdm start "Add Stripe payment integration with subscriptions and invoicing"
```

CDM detects payment/billing risk signals, selects a backend-focused persona with security review enabled. Produces: API design, implementation code, tests, security audit, and deployment config.

### Example 2: Frontend component

```bash
cdm start "Build an accessible date picker component with keyboard navigation"
```

CDM selects a frontend/UI persona. If accessibility signals are detected, an accessibility auditor persona is added to the review lens.

### Example 3: Quick bug fix

```bash
cdm start "Fix race condition in order processing"
```

CDM recognizes the "fix" action signal and selects a debugging-oriented persona.

### Example 4: Force a specific persona

```bash
cdm start "Redesign the API layer" --persona engineering-backend-architect
```

### Example 5: Force a review pass

```bash
cdm start "Add caching layer" --review
```

### Example 6: Resume a failed execution

```bash
# Last execution failed? Fix the issue, then:
cdm resume

# Or resume a specific feature:
cdm resume abc123-feature-id
```

### Example 7: Dry run (preview persona selection)

```bash
cdm start "Add real-time chat with WebSocket" --dry-run
```

```
📋 DRY RUN — Persona Resolution Preview

Task: Add real-time chat with WebSocket

Signals:
  Frameworks: websocket
  Domains:    api, frontend
  Actions:    build
  Risks:      (none)

Selected Personas:
  Primary:    💻 Senior Developer (engineering-senior-developer)
  Supporting: 🎨 Frontend Developer (engineering-frontend-developer)
  Review:     none (no risk signals)
```

### Example 8: Use simulation mode (no API key needed)

```bash
cdm start "Add search API" --mode simulation
```

### Example 9: Preview persona selection for a task

```bash
cdm personas resolve "Implement OAuth2 with PKCE flow"
```

---

## All Commands

### `cdm init`

Initialize CDM in a project. Creates config, fetches personas, builds catalog, generates project analysis.

```bash
cdm init                          # Current directory
cdm init --project ~/my-app       # Specific project
```

### `cdm analyze`

Re-scan the project. Updates the structural analysis and code style profile. Run this after major refactors.

```bash
cdm analyze
cdm analyze --json
cdm analyze -o custom-path.md
```

### `cdm start [description]`

Start a new feature. Launches an **interactive wizard** if no description is provided.

```bash
cdm start                                   # Interactive wizard
cdm start "Add user authentication"
cdm start "Add OAuth2 login" --priority critical
cdm start "Add search" --mode simulation
cdm start "Fix auth" --persona engineering-security-engineer
cdm start "Add payments" --review            # Force review pass
cdm start "Add feature" --dry-run            # Preview personas
cdm start "Quick fix" --no-interactive
cdm start "Add feature" --estimate           # Show cost estimate
```

| Option | Description | Default |
|---|---|---|
| `-p, --priority` | `low`, `medium`, `high`, `critical` | `medium` |
| `--persona` | Force a specific primary persona by ID | auto-resolved |
| `--review` | Force a review pass regardless of risk signals | `false` |
| `--mode` | `claude-cli` or `simulation` | `claude-cli` |
| `--model` | Claude model override | system default |
| `--dry-run` | Show persona selection without executing | `false` |
| `--estimate` | Show cost estimate without running | `false` |
| `--no-interactive` | Skip prompts | `false` |
| `-v, --verbose` | Debug output | `false` |
| `--json` | Output result as JSON | `false` |

### `cdm resume [feature-id]`

Resume a failed or incomplete feature execution.

```bash
cdm resume                        # Resume most recent feature
cdm resume abc-123                # Resume specific feature
cdm resume --review               # Resume with review pass
cdm resume --mode simulation      # Resume in simulation mode
```

### `cdm personas`

Manage the persona catalog.

```bash
cdm personas list                             # List all personas
cdm personas list --division engineering      # Filter by division
cdm personas update                           # Re-fetch from GitHub
cdm personas resolve "Add auth with JWT"      # Preview persona selection
cdm personas info engineering-security-engineer  # Show persona details
```

### `cdm status`

Show all features and their execution status.

```bash
cdm status
cdm status --json
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
cdm artifacts --json
```

### `cdm history`

View the development timeline — every event, execution, and metric.

```bash
cdm history                       # Summary + last 30 events
cdm history --last 100            # Last 100 events
cdm history --feature abc-123     # Filter by feature
cdm history --export              # Export to markdown + JSON
```

### `cdm config`

View or modify CDM configuration.

```bash
cdm config                                      # View all
cdm config --set execution.maxRetries=3          # Change retries
cdm config --set personas.overrides.react=engineering-frontend-developer
cdm config --reset                               # Back to defaults
```

### `cdm dashboard`

Display a TUI dashboard with project overview, stats, recent artifacts, and open issues.

```bash
cdm dashboard
cdm dashboard --json
```

### `cdm completion <shell>`

Generate shell completion scripts for bash, zsh, or fish.

```bash
cdm completion bash > /etc/bash_completion.d/cdm
cdm completion zsh > ~/.zsh/completions/_cdm
cdm completion fish > ~/.config/fish/completions/cdm.fish
```

---

## The Persona System

### How Persona Resolution Works

When you run `cdm start "description"`, CDM:

1. **Extracts signals** from your description: frameworks, domains, actions, risk indicators, keywords
2. **Scores every persona** in the catalog against those signals + your project config
3. **Selects a primary persona** (highest score) for the main execution
4. **Selects supporting personas** (1-2 from different divisions if they score well)
5. **Selects review personas** if risk signals are detected (auth, payments, encryption, PII)
6. **Decides on a review pass** — automatic for risky tasks, or forced with `--review`

### Signal Extraction

| Signal Type | Examples | Weight |
|---|---|---|
| Frameworks | React, Vue, Express, Django, Flutter | +10 per match |
| Domains | API, database, auth, frontend, mobile | +5 per match |
| Actions | build, fix, refactor, test, deploy | +3 per match |
| Project match | Language/framework from your config | +2 per match |
| Keywords | General term matches from tags | +1 per match |

### Risk Signals (Trigger Review Pass)

Tasks mentioning any of these automatically get a review pass:
- **Auth**: authentication, password, login, JWT
- **Payments**: payment, billing, credit card, Stripe
- **Encryption**: encrypt, decrypt, TLS
- **PII**: personal data, GDPR, HIPAA
- **Sensitive**: secrets, tokens, credentials

### Persona Divisions

Personas are organized by division, fetched from the [agency-agents](https://github.com/msitarzewski/agency-agents) repo:

| Division | Examples |
|---|---|
| **Engineering** | Senior Developer, Frontend Developer, Backend Architect, Security Engineer, Code Reviewer |
| **Design** | UX Designer, UI Designer, Brand Designer |
| **Testing** | Reality Checker, Accessibility Auditor |
| **Product** | Product Manager, Growth Strategist |
| **Project Management** | Scrum Master, Technical Project Manager |
| **Support** | Customer Support, Technical Writer |
| **Specialized** | Data Engineer, ML Engineer, DevOps Engineer |

```bash
# List all personas
cdm personas list

# Preview selection for a task
cdm personas resolve "Build a React dashboard with charts"

# See details of a specific persona
cdm personas info engineering-frontend-developer
```

### Config Overrides

Force specific personas for certain domains in `cdm.config.yaml`:

```yaml
personas:
  divisions:
    - engineering
    - design
    - testing
    - product
  overrides:
    react: engineering-frontend-developer
    security: engineering-security-engineer
    database: engineering-backend-architect
```

---

## Configuration

CDM auto-detects your project setup during `cdm init`. Override anything in `cdm.config.yaml`:

```yaml
project:
  language: typescript
  framework: express
  testFramework: jest
  buildTool: tsc
  cloudProvider: aws        # aws | gcp | azure | none
  ciProvider: github
  deployTarget: docker
  branchStrategy: main
  customInstructions: ""    # Free-text instructions injected into every prompt

execution:
  maxRetries: 2
  timeoutMinutes: 30
  defaultMode: claude-cli   # claude-cli | simulation
  reviewPass: auto          # auto | always | never

personas:
  source: github
  repo: msitarzewski/agency-agents
  branch: main
  divisions:
    - engineering
    - design
    - testing
    - product
    - project-management
    - support
    - specialized
  autoResolve: true
  overrides: {}
```

**Quick config changes:**

```bash
cdm config --set execution.maxRetries=5
cdm config --set execution.defaultMode=simulation
cdm config --set personas.overrides.react=engineering-frontend-developer
cdm config --reset   # Back to defaults
```

---

## Development History & Tracking

CDM records a complete timeline of every development action:

```bash
cdm history
```

```
📜 Development History: my-project

Summary:
  Features:      3 (2 completed, 1 failed)
  Executions:    5
  Artifacts:     28
  Issues:        6 found, 4 resolved
  Tokens:        98,400
  Duration:      5m 12s

Persona Usage:
  engineering-security-engineer:    2 tasks, 42,100 tokens
  engineering-senior-developer:     2 tasks, 38,200 tokens
  testing-reality-checker:          1 task,  18,100 tokens

Timeline (last 30 events):
  10:23:01 Execution started for "Add payments" (persona: engineering-security-engineer)
  10:23:02 Main pass started
  10:24:50 Main pass completed — 8 artifacts
  10:24:51 Review pass started (risk: auth, payment)
  10:25:30 Review pass completed — 2 issues found
  ...
```

Export to files:

```bash
cdm history --export
# Creates .cdm/history/development-history.md and .json
```

---

## Claude Code Plugin (MCP)

CDM includes a built-in MCP server. Register it with Claude Code:

```bash
./scripts/install.sh
```

Or add manually to `~/.claude/mcp_servers.json`:

```json
{
  "claude-dev-manager": {
    "command": "node",
    "args": ["/absolute/path/to/claude-dev-manager/dist/mcp-server.js"]
  }
}
```

### MCP Tools

| Tool | CLI Equivalent |
|---|---|
| `cdm_init` | `cdm init` |
| `cdm_analyze` | `cdm analyze` |
| `cdm_start` | `cdm start` |
| `cdm_resume` | `cdm resume` |
| `cdm_list_personas` | `cdm personas list` |
| `cdm_resolve_personas` | `cdm personas resolve` |
| `cdm_update_personas` | `cdm personas update` |
| `cdm_persona_info` | `cdm personas info` |
| `cdm_get_status` | `cdm status` |
| `cdm_list_artifacts` | `cdm artifacts` |
| `cdm_show_artifact` | `cdm show` (artifact) |
| `cdm_show_feature` | `cdm show` (feature) |
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
  personas/         # Dynamic persona system
    fetcher.ts      # Git sparse-checkout of agency-agents repo
    catalog.ts      # Parse, index, and search personas
    resolver.ts     # Signal extraction + scored persona matching
    composer.ts     # Build prompts from personas + project context
    types.ts        # Persona-specific type definitions
  executor/         # DynamicExecutor (single/dual-pass execution)
  orchestrator/     # ProjectContext, ClaudeCodeBridge
  analyzer/         # ProjectAnalyzer + CodeStyleProfiler
  context/          # Context optimizer for summarization
  tracker/          # Event log, metrics, token usage
  workspace/        # ArtifactStore (versioned CRUD in .cdm/)
  utils/            # Config (YAML), logger, validators (Zod)
  cli/
    commands/       # Pastel commands (start, personas, status, etc.)
    components/     # Ink components (Spinner, Header, StatusBadge, etc.)
    hooks/          # React hooks (useProject, useConfig, useArtifacts)
    utils/          # CLI formatting, colors, completions
    index.tsx       # Pastel CLI entry point
  types.ts          # All shared types — single source of truth
  mcp-server.ts     # MCP server entry point (Claude Code plugin)
scripts/            # install.sh for Claude Code registration
tests/
  unit/             # Unit tests (catalog, resolver, composer, validators)
  e2e/              # End-to-end tests (CLI invocation)
```

### .cdm/ Directory (per project)

```
.cdm/
  project.json              # Project metadata
  personas/
    source/                 # Cloned agency-agents repo
    catalog-index.json      # Searchable persona index
  features/
    {feature-id}.json       # Feature state + results
  artifacts/
    {artifact-id}.json      # Versioned artifact storage
  analysis/
    overview.md             # Project structure analysis
    codestyle.md            # Code convention profile
  history/
    events.json             # Development timeline
```

---

## Development

```bash
npm run dev          # Run CLI via tsx (no build needed)
npm run build        # Compile TypeScript
npm run mcp          # Start MCP server (for testing)
npm test             # Run all tests with coverage (requires Bun)
npm run test:unit    # Unit tests only
npm run test:e2e     # E2E tests only
npm run lint         # Lint source code
npm run lint:fix     # Auto-fix lint issues
npm run typecheck    # Type-check without building
```

**Tech Stack:**
- **CLI Framework:** React + Ink (terminal UI) + Pastel (command routing)
- **Type Safety:** TypeScript strict + Zod for runtime validation
- **Persona Source:** [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) (140+ personas)
- **Build:** TypeScript compiler (tsc)
- **Testing:** Bun test runner

---

## License

MIT — see [LICENSE](LICENSE) for details.
