import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { JobsPage } from '@/pages/jobs/JobsPage.js';

export const Route = createFileRoute('/_authed/jobs/')({
  validateSearch: z.object({ bay: UUID.optional(), job: UUID.optional() }),
  staticData: {
    pageLabel: 'Jobs',
  },
  component: JobsRoute,
});

function JobsRoute() {
  const { bay, job } = Route.useSearch();

  return <JobsPage selectedBayId={bay} selectedJobId={job} />;
}
