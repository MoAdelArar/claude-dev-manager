Start the Claude Dev Manager pipeline for a new feature.

Use the cdm_start_pipeline tool with:
- projectPath: the current project's absolute root path
- featureDescription: "$ARGUMENTS"
- priority: "medium" (unless the user specified otherwise)
- mode: "claude-cli"

After starting, use cdm_get_status to show the result.
If it fails, explain what went wrong and suggest using cdm_resume_pipeline.
