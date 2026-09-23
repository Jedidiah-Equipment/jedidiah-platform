import { hasPermission } from '@pkg/domain';
import { jobQueues } from '@pkg/schema/contracting';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { JobsPage } from '@/contracting/pages/jobs/JobsPage.js';
import { getRouteAccess } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/jobs/')({
  validateSearch: z.object({ queue: z.enum(jobQueues).catch('upcoming').default('upcoming') }),
  beforeLoad: async ({ context }) => {
    if (!hasPermission(await getRouteAccess(context), 'contracting_job:read'))
      throw redirect({ to: '/contracting/invoicing' });
  },
  component: JobsRoute,
  staticData: { pageLabel: 'Jobs' },
});

function JobsRoute() {
  return <JobsPage queue={Route.useSearch().queue} />;
}
