import { createFileRoute } from '@tanstack/react-router';

import { JobListPage } from '@/pages/jobs/JobListPage.js';

export const Route = createFileRoute('/_authed/jobs/list')({
  staticData: {
    pageLabel: 'Job List',
  },
  component: JobListRoute,
});

function JobListRoute() {
  return <JobListPage />;
}
