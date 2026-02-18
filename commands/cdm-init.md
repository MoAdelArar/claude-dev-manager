Initialize Claude Dev Manager in the current project.

Use the cdm_init tool with the current project's absolute root path.

This creates:
- cdm.config.yaml (project configuration)
- Agent instruction files in agents/
- CLAUDE.md (project instructions for Claude Code)
- .cdm/project-analysis.md (codebase analysis)

After initialization, suggest the user run /cdm-start to begin a feature pipeline.
