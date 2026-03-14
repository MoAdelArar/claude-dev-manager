export const colors = {
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'cyan',
  muted: 'gray',
  primary: 'blue',
  accent: 'magenta',
} as const;

export type SemanticColor = typeof colors[keyof typeof colors];

export function getStatusColor(status: string): SemanticColor {
  switch (status) {
    case 'completed':
    case 'success':
    case 'approved':
    case 'final':
      return colors.success;
    case 'in_progress':
    case 'working':
    case 'in_review':
      return colors.info;
    case 'on_hold':
    case 'pending':
    case 'waiting_for_input':
    case 'draft':
      return colors.warning;
    case 'failed':
    case 'error':
    case 'rejected':
    case 'blocked':
    case 'cancelled':
      return colors.error;
    default:
      return colors.muted;
  }
}

export function getSeverityColor(severity: string): SemanticColor {
  switch (severity) {
    case 'critical':
      return colors.error;
    case 'high':
      return colors.warning;
    case 'medium':
      return colors.info;
    case 'low':
    case 'info':
      return colors.muted;
    default:
      return colors.muted;
  }
}
