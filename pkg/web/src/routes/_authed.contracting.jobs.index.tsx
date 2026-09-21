import { jobQueues } from '@pkg/schema/contracting';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { JobsPage } from '@/contracting/pages/jobs/JobsPage.js';

export const Route = createFileRoute('/_authed/contracting/jobs/')({
  validateSearch: z.object({ queue: z.enum(jobQueues).catch('upcoming').default('upcoming') }),
  component: JobsRoute,
  staticData: { pageLabel: 'Jobs' },
});

function JobsRoute() {
  return <JobsPage queue={Route.useSearch().queue} />;
}
