View or update the CDM configuration for the current project.

If the user just says "/cdm-config" with no arguments, use the cdm_get_config tool to display the current configuration.

If the user wants to change a setting, use the cdm_set_config tool. Common examples:
- Cloud provider: key="project.cloudProvider" value="gcp"
- Max retries: key="pipeline.maxRetries" value="3"
- Disable an agent: key="agents.ui_designer.enabled" value="false"
- Custom instructions: key="project.customInstructions" value="Use functional programming style"

If the user says "reset config", use the cdm_reset_config tool.

Always use the current project's absolute root path as projectPath.
