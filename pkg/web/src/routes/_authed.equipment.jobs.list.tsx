import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { JobListPage } from '@/pages/jobs/JobListPage.js';

export const Route = createFileRoute('/_authed/jobs/list')({
  validateSearch: z.object({ job: UUID.optional() }),
  staticData: {
    pageLabel: 'Job List',
  },
  component: JobListRoute,
});

function JobListRoute() {
  const { job } = Route.useSearch();

  return <JobListPage selectedJobId={job} />;
}
