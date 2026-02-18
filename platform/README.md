# AdelBot Platform

Cloud platform for running CDM and Claude Code from mobile devices and web browsers.

## Components

- **`backend/`** — FastAPI REST API + WebSocket (Python)
- **`android/`** — Android app (Kotlin + Jetpack Compose)
- **`web/`** — Web dashboard with user + admin panels (React + TypeScript)
- **`docker/`** — Dev container images with Claude Code + CDM pre-installed

## Quick Start

```bash
cp .env.example .env   # Configure credentials
docker compose up -d   # Start everything
```

Web dashboard: http://localhost:3000
API: http://localhost:8000

## Execution Modes

Sessions support two modes:

- **`claude`** — Claude Code quick mode (`claude -p`). Single agent, fast.
- **`cdm`** — CDM 18-agent pipeline (`cdm start`). Full development lifecycle.

## Admin Tools

```bash
python -m backend.manage promote-admin <username>
python -m backend.manage list-users
python -m backend.manage set-tier <username> pro
python -m backend.manage stats
```

Or use the web admin dashboard at `/admin`.

See the root [README.md](../README.md) for full documentation.
