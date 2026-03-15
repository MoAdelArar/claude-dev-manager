import React from 'react';
import { Box, Text } from 'ink';
import { colors, getSeverityColor } from '../utils/colors.js';
import { formatTokens } from '../utils/format.js';
import { StatusBadge } from './StatusBadge.js';
import type { DashboardData, ActiveFeature, RecentArtifact, OpenIssue } from '../hooks/useDashboardData.js';

interface DashboardViewProps {
  data: DashboardData;
}

export function DashboardView({ data }: DashboardViewProps): React.ReactElement {
  const { project, weekStats, activeFeatures, recentArtifacts, openIssues, config } = data;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color={colors.info}>🚀 Claude Dev Manager Dashboard</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color={colors.muted}>{'─'.repeat(60)}</Text>
      </Box>

      {project && (
        <Box marginBottom={1}>
          <Text>
            <Text bold>Project: </Text>
            <Text color={colors.info}>{project.name}</Text>
            <Text color={colors.muted}> | </Text>
            <Text>Language: </Text>
            <Text color={colors.info}>{project.config.language}</Text>
            <Text color={colors.muted}> | </Text>
            <Text>Framework: </Text>
            <Text color={colors.info}>{project.config.framework || 'N/A'}</Text>
          </Text>
        </Box>
      )}

      <Box flexDirection="row" marginBottom={1}>
        <Box flexDirection="column" width="50%">
          <Text bold color={colors.info}>📊 This Week</Text>
          <Box marginLeft={2} flexDirection="column">
            <Text>
              <Text color={colors.muted}>Features:     </Text>
              <Text>{weekStats.featuresCreated}</Text>
            </Text>
            <Text>
              <Text color={colors.muted}>Executions:   </Text>
              <Text>{weekStats.executionsRun}</Text>
            </Text>
            <Text>
              <Text color={colors.muted}>Tokens:       </Text>
              <Text>{formatTokens(weekStats.tokensUsed)}</Text>
            </Text>
            <Text>
              <Text color={colors.muted}>Success rate: </Text>
              <Text color={weekStats.successRate >= 80 ? colors.success : weekStats.successRate >= 50 ? colors.warning : colors.error}>
                {weekStats.successRate}%
              </Text>
            </Text>
          </Box>
        </Box>

        <Box flexDirection="column" width="50%">
          <Text bold color={colors.info}>📦 Recent Artifacts</Text>
          <Box marginLeft={2} flexDirection="column">
            {recentArtifacts.length === 0 ? (
              <Text color={colors.muted}>No artifacts yet</Text>
            ) : (
              recentArtifacts.map((artifact) => (
                <ArtifactRow key={artifact.id} artifact={artifact} />
              ))
            )}
          </Box>
        </Box>
      </Box>

      <Box marginBottom={1}>
        <Text color={colors.muted}>{'─'.repeat(60)}</Text>
      </Box>

      <Box flexDirection="row">
        <Box flexDirection="column" width="50%">
          <Text bold color={colors.info}>🔄 Active Features</Text>
          <Box marginLeft={2} flexDirection="column">
            {activeFeatures.length === 0 ? (
              <Text color={colors.muted}>No active features</Text>
            ) : (
              activeFeatures.map((feature) => (
                <FeatureRow key={feature.id} feature={feature} />
              ))
            )}
          </Box>
        </Box>

        <Box flexDirection="column" width="50%">
          <Text bold color={colors.info}>⚠️ Open Issues</Text>
          <Box marginLeft={2} flexDirection="column">
            {openIssues.length === 0 ? (
              <Text color={colors.muted}>No open issues</Text>
            ) : (
              openIssues.map((issue) => (
                <IssueRow key={issue.id} issue={issue} />
              ))
            )}
          </Box>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color={colors.muted}>{'─'.repeat(60)}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={colors.muted}>
          Run `cdm status` for detailed feature info | `cdm artifacts` to see all artifacts
        </Text>
      </Box>
    </Box>
  );
}

function ArtifactRow({ artifact }: { artifact: RecentArtifact }): React.ReactElement {
  const timeAgo = getTimeAgo(artifact.createdAt);
  return (
    <Text>
      <Text color={colors.info}>• </Text>
      <Text>{truncate(artifact.name, 25)}</Text>
      <Text color={colors.muted}> ({timeAgo})</Text>
    </Text>
  );
}

function FeatureRow({ feature }: { feature: ActiveFeature }): React.ReactElement {
  const statusInfo = feature.primaryPersona 
    ? `${feature.currentStep} - ${feature.primaryPersona}`
    : feature.currentStep;
  
  return (
    <Box>
      <Text color={colors.info}>• </Text>
      <Text>{truncate(feature.name, 20)} </Text>
      <StatusBadge status={feature.status} />
      <Text color={colors.muted}> ({statusInfo})</Text>
    </Box>
  );
}

function IssueRow({ issue }: { issue: OpenIssue }): React.ReactElement {
  const severityColor = getSeverityColor(issue.severity);
  return (
    <Text>
      <Text color={severityColor}>• </Text>
      <Text>{truncate(issue.title, 25)}</Text>
      <Text color={colors.muted}> ({issue.severity})</Text>
    </Text>
  );
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
