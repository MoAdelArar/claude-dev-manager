Resume a failed or paused pipeline from its last incomplete stage.

Use the cdm_resume_pipeline tool with the current project's absolute root path.

If the user specifies a feature ID or name, pass it as featureId. Otherwise, omit it to resume the most recent failed/paused feature.

After resuming, use cdm_get_status to show the updated pipeline state. If it fails again, explain the issue and suggest fixes.
