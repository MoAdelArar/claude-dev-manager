# AdelBot - Mobile Development with Claude Code

A full-stack platform that lets you develop software from your Android phone. Connect to a GitHub repo, describe what you need, and **Claude Code** builds it inside a cloud container — then pushes the changes back to GitHub.

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│   Android App    │────▶│   Backend API    │────▶│  Docker Container    │
│  (Kotlin/Compose)│◀────│   (FastAPI)      │◀────│  ┌────────────────┐  │
└──────────────────┘     └──────────────────┘     │  │  Claude Code   │  │
        │                    │          │          │  │  (AI Agent)    │  │
        │ OAuth              │ DB       │ Stream   │  └────────────────┘  │
        ▼                    ▼          ▼          │  /workspace (repo)   │
   ┌─────────┐       ┌──────────┐ ┌─────────┐    └──────────────────────┘
   │ GitHub  │       │PostgreSQL│ │WebSocket│              │
   │  OAuth  │       │  + Redis │ │ events  │              │ git push
   └─────────┘       └──────────┘ └─────────┘              ▼
                                                    ┌──────────────┐
                                                    │ GitHub Repos │
                                                    └──────────────┘
```

## How It Works

1. **Sign in** with GitHub on the Android app
2. **Select a repository** and describe the development task
3. **Backend provisions** a Docker container with the repo cloned and Claude Code installed
4. **Claude Code** (`claude -p`) runs autonomously — reads code, makes edits, runs tests, installs deps
5. **Changes are committed** and pushed to GitHub
6. **Container is destroyed**, session is tracked and billed

## Why Claude Code?

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) is Anthropic's official CLI tool for agentic coding. Unlike a custom LLM loop, Claude Code:

- Has **built-in tool use** — file I/O, bash execution, search, etc.
- **Understands project context** automatically (reads files, follows imports)
- Runs **tests and fixes failures** in a loop until they pass
- Handles **multi-file refactoring** across large codebases
- Outputs **structured streaming JSON** for real-time UI updates
- Is always up to date with the latest Claude model capabilities

## Components

### Backend (`/backend`)
- **FastAPI** REST API + WebSocket for real-time streaming
- **SQLAlchemy** async ORM with PostgreSQL
- **Docker SDK** — provisions containers, streams Claude Code output, handles git push
- **Claude Code integration** — `claude -p --output-format stream-json --dangerously-skip-permissions`
- **JWT authentication** via GitHub OAuth
- **Session tracking** with per-minute billing
- **Subscription tiers**: Free (60 min/mo), Pro, Team, Enterprise

### Android App (`/android`)
- **Kotlin + Jetpack Compose** with Material 3
- **MVVM architecture** with Hilt DI
- **GitHub OAuth** login with deep linking
- **Repository browser** with search/sync
- **Live session view** — real-time Claude Code output via WebSocket
  - Tool use visualization (bash, file read/write, search)
  - Streaming agent messages
  - Command output with monospace rendering
- **Session history** with event logs
- **Billing dashboard** with usage tracking

### Dev Containers (`/docker`)
Each container ships with **Claude Code pre-installed** (`@anthropic-ai/claude-code`):
- **Universal**: Python, Node.js, Java, Go, Rust, Ruby + Claude Code
- **Python**: Python 3.12 optimized + Claude Code
- **Node.js**: Node 20 optimized + Claude Code

Resource limits: 2GB RAM, 2 CPU cores (configurable). Auto-cleanup after 8 hours.

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Python 3.12+
- Android Studio (for the app)
- GitHub OAuth App credentials
- **Anthropic API key** (required — Claude Code needs it)

### 1. Configure Environment

```bash
cp .env.example .env
# Edit .env — you MUST set ANTHROPIC_API_KEY and GITHUB_CLIENT_ID/SECRET
```

### 2. Build Dev Container Images

```bash
cd docker/dev-environments
bash build.sh
cd ../..
```

This installs Claude Code inside each image so containers start fast.

### 3. Start the Backend

```bash
# Option A: Docker Compose (recommended)
docker compose up -d

# Option B: Run locally
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Build the Android App

```bash
cd android
# Update app/build.gradle.kts:
#   - API_BASE_URL → your server
#   - GITHUB_CLIENT_ID → your OAuth app
./gradlew assembleDebug
```

### 5. Create GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Set:
   - Application name: `AdelBot`
   - Homepage URL: `https://adelbot.dev`
   - Authorization callback URL: `adelbot://callback`
4. Copy Client ID and Client Secret to `.env`

## Claude Code Execution

Each session runs Claude Code like this inside the container:

```bash
claude -p \
  --output-format stream-json \
  --dangerously-skip-permissions \
  --verbose \
  --system-prompt "You are working inside an AdelBot dev container..." \
  "Add user authentication with JWT tokens and write tests"
```

The `stream-json` output is parsed line-by-line and forwarded to the app via WebSocket:

| Event Type | Description |
|-----------|-------------|
| `assistant` | Claude's thinking/response text |
| `tool_use` | Tool invocation (Bash, Read, Write, Search, etc.) |
| `tool_result` | Output from tool execution |
| `result` | Final summary with token/cost stats |
| `error` | Error messages |

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/auth/github/url` | Get GitHub OAuth URL |
| POST | `/api/v1/auth/github/callback` | Exchange code for token |
| GET | `/api/v1/auth/me` | Get current user |

### Repositories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/repositories/` | List user repos |
| POST | `/api/v1/repositories/sync` | Sync from GitHub |
| GET | `/api/v1/repositories/{id}/branches` | List branches |

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/sessions/` | Create & start session |
| GET | `/api/v1/sessions/` | List sessions |
| GET | `/api/v1/sessions/{id}` | Get session details |
| GET | `/api/v1/sessions/{id}/events` | Get session event log |
| POST | `/api/v1/sessions/{id}/cancel` | Cancel session |
| WS | `/api/v1/ws/session/{id}` | Live session WebSocket |

### Billing
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/billing/usage` | Get usage summary |
| GET | `/api/v1/billing/history` | Get billing history |
| GET | `/api/v1/billing/plans` | Get available plans |

## Session Lifecycle

```
PENDING → PROVISIONING → RUNNING → AGENT_WORKING → PUSHING → COMPLETED
                                                              ↓
                                                           FAILED
```

1. **PENDING**: Session created, waiting to start
2. **PROVISIONING**: Docker container being created, repo cloned, Claude Code ready
3. **RUNNING**: Container ready, Claude Code launching
4. **AGENT_WORKING**: Claude Code executing — reading files, making changes, running tests
5. **PUSHING**: Committing and pushing changes to GitHub
6. **COMPLETED**: Changes pushed, container destroyed
7. **FAILED**: Error occurred, container destroyed, error logged

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude Code | Yes |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID | Yes |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret | Yes |
| `SECRET_KEY` | JWT signing key | Yes (change default) |
| `CLAUDE_CODE_MODEL` | Override Claude Code's model | No |
| `CLAUDE_CODE_MAX_TURNS` | Limit agent turns (0=unlimited) | No |
| `CONTAINER_MEMORY_LIMIT` | Container RAM limit | No (default: 2g) |
| `CONTAINER_CPU_LIMIT` | Container CPU cores | No (default: 2.0) |
| `RATE_PER_MINUTE` | Billing rate per minute ($) | No (default: 0.01) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | Kotlin, Jetpack Compose, Material 3, Hilt, Retrofit |
| Backend | Python, FastAPI, SQLAlchemy, WebSockets |
| AI Agent | **Claude Code** (`@anthropic-ai/claude-code`) |
| Database | PostgreSQL, Redis |
| Containers | Docker |
| Auth | GitHub OAuth, JWT |
| Billing | Stripe (optional) |

## License

MIT
