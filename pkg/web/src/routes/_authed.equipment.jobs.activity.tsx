import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { JobActivityPage } from '@/equipment/pages/jobs/JobActivityPage.js';

export const Route = createFileRoute('/_authed/equipment/jobs/activity')({
  validateSearch: z.object({ job: UUID.optional() }),
  staticData: {
    pageLabel: 'Job Activity',
  },
  component: JobActivityRoute,
});

function JobActivityRoute() {
  const { job } = Route.useSearch();

  return <JobActivityPage selectedJobId={job} />;
}
