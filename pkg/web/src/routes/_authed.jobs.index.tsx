import { createFileRoute } from '@tanstack/react-router';

import { JobsPage } from '@/pages/jobs/JobsPage.js';

export const Route = createFileRoute('/_authed/jobs/')({
  staticData: {
    pageLabel: 'Jobs',
  },
  component: JobsRoute,
});

function JobsRoute() {
  return <JobsPage />;
}
