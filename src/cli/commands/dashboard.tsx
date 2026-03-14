import React from 'react';
import { Box, Text } from 'ink';
import { z } from 'zod';
import { colors } from '../utils/colors.js';
import { Spinner } from '../components/Spinner.js';
import { EnhancedErrorDisplay } from '../components/EnhancedErrorDisplay.js';
import { DashboardView } from '../components/DashboardView.js';
import { useDashboardData } from '../hooks/useDashboardData.js';

export const options = z.object({
  project: z.string().default(process.cwd()).describe('Project path'),
  json: z.boolean().default(false).describe('Output as JSON'),
});

type Props = {
  options: z.infer<typeof options>;
};

export default function DashboardCommand({ options }: Props): React.ReactElement {
  const { data, loading, error } = useDashboardData(options.project);

  if (loading) {
    return (
      <Box padding={1}>
        <Spinner label="Loading dashboard data..." />
      </Box>
    );
  }

  if (error) {
    return <EnhancedErrorDisplay error={error} />;
  }

  if (!data) {
    return (
      <Box padding={1}>
        <Text color={colors.warning}>No dashboard data available.</Text>
        <Text color={colors.muted}> Run `cdm init` to initialize the project.</Text>
      </Box>
    );
  }

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return <></>;
  }

  return <DashboardView data={data} />;
}

export const description = 'Show project dashboard with stats, features, and issues';
