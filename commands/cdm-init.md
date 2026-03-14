Initialize Claude Dev Manager in the current project.

Use the cdm_init tool with the current project's absolute root path.

This creates:
- cdm.config.yaml (project configuration)
- Agent instruction files in .cdm/agents/
- CLAUDE.md (project instructions for Claude Code)
- .cdm/analysis/ (codebase analysis and code style profile)
- RTK hook activation (if rtk is installed) for 60-90% token savings

After initialization, suggest the user run /cdm-start to begin a feature pipeline.
