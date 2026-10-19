import { hasPermission } from '@pkg/domain';
import { jobQueues } from '@pkg/schema/contracting';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { focusJobsOn, JobsPage } from '@/contracting/pages/jobs/JobsPage.js';
import { getRouteAccess } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/jobs/')({
  /** `stage` and `needsALook` arrive from the Dashboard once: written into the saved filters and the URL cleared. */
  validateSearch: z.object({ stage: z.enum(jobQueues).optional(), needsALook: z.boolean().optional() }),
  beforeLoad: async ({ context, search, preload }) => {
    if (!hasPermission(await getRouteAccess(context), 'contracting_job:read'))
      throw redirect({ to: '/contracting/invoicing' });
    // Intent preload runs this on hover; only a committed navigation may touch the saved filters.
    if (preload || !(search.stage || search.needsALook)) return;
    focusJobsOn(search);
    throw redirect({ to: '/contracting/jobs', search: {}, replace: true });
  },
  component: JobsPage,
  staticData: { pageLabel: 'Jobs' },
});
