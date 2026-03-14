import React from 'react';
import { Text } from 'ink';
import { getStatusColor } from '../utils/colors.js';

interface StatusBadgeProps {
  status: string;
  showIcon?: boolean;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed':
    case 'success':
    case 'approved':
      return '✓';
    case 'in_progress':
    case 'working':
      return '●';
    case 'on_hold':
    case 'pending':
    case 'waiting':
      return '○';
    case 'failed':
    case 'error':
    case 'rejected':
      return '✗';
    case 'skipped':
      return '−';
    default:
      return '○';
  }
}

export function StatusBadge({ status, showIcon = true }: StatusBadgeProps): React.ReactElement {
  const color = getStatusColor(status);
  const icon = showIcon ? getStatusIcon(status) + ' ' : '';
  
  return (
    <Text color={color}>
      {icon}{status}
    </Text>
  );
}
