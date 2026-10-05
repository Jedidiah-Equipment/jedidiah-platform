import { hasPermission } from '@pkg/domain';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { JobsPage } from '@/contracting/pages/jobs/JobsPage.js';
import { getRouteAccess } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/jobs/')({
  beforeLoad: async ({ context }) => {
    if (!hasPermission(await getRouteAccess(context), 'contracting_job:read'))
      throw redirect({ to: '/contracting/invoicing' });
  },
  component: JobsPage,
  staticData: { pageLabel: 'Jobs' },
});
