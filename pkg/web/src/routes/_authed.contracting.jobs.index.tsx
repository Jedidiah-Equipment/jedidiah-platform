import { hasPermission } from '@pkg/domain';
import { jobQueues } from '@pkg/schema/contracting';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';
import { JobsPage } from '@/contracting/pages/jobs/JobsPage.js';
import { getRouteAccess } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/jobs/')({
  beforeLoad: async ({ context }) => {
    if (!hasPermission(await getRouteAccess(context), 'contracting_job:read'))
      throw redirect({ to: '/contracting/invoicing' });
  },
  /** `stage` and `needsALook` arrive from the Dashboard once; the page applies them to the saved filters and clears them. */
  validateSearch: z.object({ stage: z.enum(jobQueues).optional(), needsALook: z.boolean().optional() }),
  component: JobsRoute,
  staticData: { pageLabel: 'Jobs' },
});

function JobsRoute() {
  const { stage, needsALook } = Route.useSearch();
  const navigate = Route.useNavigate();
  const clearFocus = useCallback(() => void navigate({ search: {}, replace: true }), [navigate]);
  return <JobsPage focus={{ stage, needsALook }} onFocusApplied={clearFocus} />;
}
