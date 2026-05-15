import { JobListStatusFilter } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { JobsPage } from '@/pages/jobs/JobsPage.js';

const JobListStatusSearch = z.object({
  status: JobListStatusFilter.catch('active').optional(),
});

export const Route = createFileRoute('/_authed/jobs/')({
  validateSearch: (search) => JobListStatusSearch.parse(search),
  staticData: {
    pageLabel: 'Jobs',
  },
  component: JobsRoute,
});

function JobsRoute() {
  const search = Route.useSearch();

  return <JobsPage status={search.status ?? 'active'} />;
}
