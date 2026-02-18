# Claude Dev Manager (CDM)

A multi-agent development management system powered by Claude Code. CDM orchestrates a team of 11 specialized AI agents through a 10-stage software development pipeline — from requirements gathering to production deployment — with built-in support for monitoring, alerting, scaling, DR, and cost management across AWS, GCP, and Azure.

## Features

- **11 specialized agents** — Product Manager, System Architect, UI Designer, Engineering Manager, Senior/Junior Developers, Code Reviewer, QA Engineer, Security Engineer, DevOps Engineer, Documentation Writer
- **10-stage pipeline** — Requirements → Architecture → UI/UX → Task Breakdown → Implementation → Code Review → Testing → Security Review → Documentation → Deployment
- **Claude Code CLI integration** — Agents run as Claude Code subprocesses with automatic simulation fallback
- **Multi-cloud NFR support** — Production-grade monitoring, alerting, scaling, SLA, DR, cost analysis, and runbooks for AWS, GCP, and Azure
- **Project analyzer** — Generates a compact codebase analysis that reduces agent context by ~97%
- **Artifact tracking** — 35 artifact types with versioning, review status, and persistent storage
- **Pipeline resume** — Resume failed pipelines from the last incomplete stage

## Installation

```bash
# Clone and install
git clone https://github.com/MoAdelArar/claude-dev-manager.git
cd claude-dev-manager
npm install

# Build
npm run build

# Link globally (optional)
npm link
```

**Requirements:** Node.js >= 18.0.0

## Quick Start

```bash
# Initialize CDM in your project
cdm init --project /path/to/your/project

# Analyze the project (generates context for agents)
cdm analyze --project /path/to/your/project

# Start a feature pipeline
cdm start "Add user authentication with OAuth2" --project /path/to/your/project

# Check status
cdm status --project /path/to/your/project
```

## Commands

| Command | Description |
|---|---|
| `cdm init` | Initialize CDM in a project (creates config, agent files, CLAUDE.md, analysis) |
| `cdm analyze` | Scan project and generate structured analysis for agent context |
| `cdm start <desc>` | Start the development pipeline for a new feature |
| `cdm resume [id]` | Resume a failed or paused pipeline from the last stage |
| `cdm status` | Show the status of all features |
| `cdm show <target>` | Display details of a specific artifact or feature |
| `cdm artifacts` | List all artifacts produced during development |
| `cdm agents` | List all available agents and their roles |
| `cdm pipeline` | Show the pipeline stage configuration |
| `cdm config` | View or update CDM configuration |

### Common Options

```bash
--project <path>    # Target project path (default: current directory)
--mode <mode>       # Execution mode: claude-cli or simulation
--model <model>     # Claude model to use
--skip <stages>     # Comma-separated stages to skip
--dry-run           # Show pipeline plan without executing
-v, --verbose       # Verbose output
```

## Configuration

CDM creates a `cdm.config.yaml` in your project root during `cdm init`:

```yaml
project:
  language: typescript
  framework: node
  testFramework: jest
  buildTool: npm
  cloudProvider: aws        # aws | gcp | azure

pipeline:
  maxRetries: 2
  timeoutMinutes: 30

agents:
  product_manager:
    enabled: true
  ui_designer:
    enabled: false          # Disable agents you don't need
  security_engineer:
    enabled: true
```

Edit with: `cdm config --set pipeline.maxRetries=3`

## Cloud Provider Support

CDM generates production-grade NFR artifacts for your target cloud provider:

| Artifact | AWS | GCP | Azure |
|---|---|---|---|
| Monitoring | CloudWatch + X-Ray | Cloud Monitoring + Trace | App Insights |
| Alerting | CloudWatch Alarms + SNS | Alerting Policies | Azure Alerts + Action Groups |
| Scaling | ECS/EKS Auto Scaling | GKE HPA + Cluster Autoscaler | AKS HPA |
| Cost Analysis | Cost Explorer + Savings Plans | Billing + CUDs | Cost Management + Reservations |
| SLA/SLO/SLI | Error budgets + burn-rate alerts | SLO Monitoring Service | Application Insights SLOs |
| Disaster Recovery | Multi-AZ + Cross-Region Aurora | Multi-Region GCS + SQL | Geo-Replication + Front Door |
| Performance | k6/Artillery benchmarks | k6/Locust benchmarks | Azure Load Testing |
| Runbook | Incident response procedures | GKE operational guides | AKS operational guides |

Set your provider: `cdm config --set project.cloudProvider=gcp`

## Project Structure

```
src/
  agents/          # 11 specialized agent implementations
  analyzer/        # Project analysis engine
  cloud/           # AWS, GCP, Azure NFR providers
  communication/   # Agent message bus and handoff protocol
  orchestrator/    # Pipeline orchestrator, context, Claude Code bridge
  pipeline/        # Stage configs and transition engine
  utils/           # Config, logger, validators
  workspace/       # Artifact persistence
  types.ts         # Core type definitions (enums, interfaces)
  cli.ts           # CLI entry point
templates/         # Markdown artifact templates
tests/
  unit/            # Unit tests
  e2e/             # End-to-end tests (CLI + programmatic)
```

## Development

```bash
npm run dev          # Run CLI via ts-node
npm run build        # Compile TypeScript
npm test             # Run all tests with coverage
npm run test:unit    # Unit tests only
npm run test:e2e     # E2E tests only
npm run lint         # Lint source code
npm run lint:fix     # Auto-fix lint issues
```

## License

MIT
