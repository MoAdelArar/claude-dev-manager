# Claude Dev Manager (CDM)

An AI-powered development manager with an interactive terminal interface. CDM dynamically selects specialized **personas** from [140+ agent definitions](https://github.com/msitarzewski/agency-agents) to match your task, analyzes your project, and executes via Claude — all from a beautiful TUI.

Just type `cdm` to start.

---

## Quick Start

```bash
# Install globally
npm install -g claude-dev-manager

# Launch the TUI
cdm
```

You'll see:

```
───────────────────────────────────────────────────────────
○ Not initialized - run /init                 claude-sonnet
───────────────────────────────────────────────────────────

  CDM - Claude Dev Manager

  Commands:
    /help     Show all commands
    /init     Initialize project
    /status   Show project status
    /clear    Clear screen

  Tab: completions  ↑↓: history  Enter: submit  Esc: cancel
  Ctrl/⌥+←/→: word jump  Ctrl/⌥+⌫: delete word  Ctrl+C: exit

❯ 
```

Type `/init` to initialize, then describe your task in natural language.

---

## Features

### 🖥️ Interactive Terminal Interface

- **Tab Completion** — Type `/` and press Tab to cycle through commands
- **Command History** — Press ↑/↓ to navigate previous inputs
- **Word Editing** — Option/Ctrl + Arrow keys to jump words, Option/Ctrl + Backspace to delete words
- **Real-time Feedback** — Color-coded messages and status indicators

### 🤖 Smart Persona Selection

When you describe a task, CDM:
1. Extracts signals from your description (frameworks, domains, risk indicators)
2. Scores 140+ personas against your project and task
3. Selects the best-fit persona for execution
4. Adds review passes automatically for risky tasks (auth, payments, etc.)

### 📦 Artifact Management

All outputs are versioned and stored in `.cdm/`:
- Specifications and designs
- Code implementations
- Test suites
- Security reports
- Documentation

---

## Commands

All commands start with `/` inside the TUI:

| Command | Description |
|---------|-------------|
| `/help` | Show all available commands |
| `/init` | Initialize CDM in current directory |
| `/status` | Show project and feature status |
| `/analyze` | Re-analyze project structure |
| `/personas [query]` | List personas or search by keyword |
| `/artifacts` | List all produced artifacts |
| `/history` | Show development timeline |
| `/config` | Show current configuration |
| `/clear` | Clear the screen |
| `/exit` | Exit CDM |

### Example Session

```
❯ /init
┌─ System 14:30
│ Project initialized successfully!
│ 
│   Project: my-api
│   Language: typescript
│   Framework: express
│   Personas: 142 indexed
│ 
│ You can now start working. Type a task description to begin.
└

❯ Add user authentication with JWT and refresh tokens
┌─ You 14:31
│ Add user authentication with JWT and refresh tokens
└

┌─ Assistant 14:32
│ I'll implement JWT authentication with refresh tokens for your Express API...
│ [detailed implementation output]
└
```

---

## Keyboard Shortcuts

### All Platforms

| Action | Shortcut |
|--------|----------|
| Submit input | Enter |
| Tab completion | Tab |
| History up/down | ↑ / ↓ |
| Cancel completion | Escape |
| Clear screen | Ctrl+L |
| Exit | Ctrl+C |

### Word Navigation

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Word left | ⌥← | Ctrl+← |
| Word right | ⌥→ | Ctrl+→ |
| Delete word left | ⌥⌫ | Ctrl+Backspace |
| Delete word right | ⌥Delete | Ctrl+Delete |

### Line Editing

| Action | Shortcut |
|--------|----------|
| Start of line | Ctrl+A |
| End of line | Ctrl+E |
| Clear line | Ctrl+U |
| Delete to end | Ctrl+K |

---

## Installation

### npm (Recommended)

```bash
npm install -g claude-dev-manager
```

**Requirements:** Node.js >= 20

### From Source

```bash
git clone https://github.com/MoAdelArar/claude-dev-manager.git
cd claude-dev-manager
npm install
npm run build
npm link
```

### Optional: RTK (60-90% Token Savings)

[RTK](https://github.com/rtk-ai/rtk) compresses CLI outputs before they reach the agent's context.

```bash
# macOS
brew install rtk && rtk init --global

# Linux
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
rtk init --global

# Windows
winget install rtk-ai.rtk
rtk init --global
```

CDM detects RTK automatically.

---

## How It Works

```
You describe a task
       ↓
CDM analyzes your project (structure + code style)
       ↓
PersonaResolver matches task to best-fit persona(s):
  signals extracted → personas scored → primary + supporting selected
       ↓
PromptComposer builds a rich prompt:
  persona identity + project context + task + review checklist
       ↓
Claude executes (+ optional review pass for risky tasks)
       ↓
Artifacts parsed and stored in .cdm/
       ↓
Everything tracked: history, metrics, persona usage
```

### Execution Modes

- **`claude-cli`** (default) — Claude Code executes with the composed persona prompt
- **`simulation`** — Generates template-based output locally (for testing)

### Risk Signals

Tasks mentioning these trigger automatic review passes:
- **Auth**: authentication, password, login, JWT
- **Payments**: payment, billing, credit card, Stripe
- **Encryption**: encrypt, decrypt, TLS
- **PII**: personal data, GDPR, HIPAA

---

## The Persona System

CDM uses 140+ personas from [agency-agents](https://github.com/msitarzewski/agency-agents), organized by division:

| Division | Examples |
|----------|----------|
| **Engineering** | Senior Developer, Security Engineer, Backend Architect |
| **Design** | UX Designer, UI Designer |
| **Testing** | Reality Checker, Accessibility Auditor |
| **Product** | Product Manager, Growth Strategist |
| **DevOps** | DevOps Engineer, SRE |

Use `/personas` to explore, or `/personas react` to search.

---

## Configuration

CDM auto-detects your project during `/init`. Configuration is stored in `cdm.config.yaml`:

```yaml
project:
  language: typescript
  framework: express
  testFramework: jest

execution:
  maxRetries: 2
  timeoutMinutes: 30
  defaultMode: claude-cli
  reviewPass: auto          # auto | always | never

personas:
  repo: msitarzewski/agency-agents
  divisions:
    - engineering
    - design
    - testing
    - product
```

View with `/config`.

---

## Project Structure

```
.cdm/                       # CDM data directory
  project.json              # Project metadata
  personas/
    source/                 # Cloned agency-agents
    catalog-index.json      # Searchable persona index
  features/
    {feature-id}.json       # Feature state + results
  artifacts/
    {artifact-id}.json      # Versioned artifacts
  analysis/
    overview.md             # Project structure
    codestyle.md            # Code conventions
  history/
    events.json             # Development timeline
```

---

## MCP Server (Claude Code Plugin)

CDM includes an MCP server for Claude Code integration:

```bash
./scripts/install.sh
```

Or add to `~/.claude/mcp_servers.json`:

```json
{
  "claude-dev-manager": {
    "command": "node",
    "args": ["/path/to/claude-dev-manager/dist/mcp-server.js"]
  }
}
```

---

## Development

```bash
npm run dev          # Run via tsx
npm run build        # Compile TypeScript
npm test             # Run tests
npm run lint         # Lint code
npm run typecheck    # Type check
```

---

## License

MIT — see [LICENSE](LICENSE) for details.
