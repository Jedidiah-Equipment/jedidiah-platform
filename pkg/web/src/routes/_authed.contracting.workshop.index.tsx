import { AuthId } from '@pkg/schema';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { focusWorkshopOnMechanic, WorkshopPage } from '@/contracting/pages/workshop/WorkshopPage.js';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/workshop/')({
  /** `mechanic` arrives from the Reports page once: it is written into the saved filters and the URL cleared. */
  validateSearch: z.object({ mechanic: AuthId.optional() }),
  beforeLoad: async ({ context, search, preload }) => {
    await requireRoutePermission(context, 'contracting_breakdown:read');
    // Intent preload runs this on hover; only a committed navigation may touch the saved filters.
    if (search.mechanic && !preload) {
      focusWorkshopOnMechanic(search.mechanic);
      throw redirect({ to: '/contracting/workshop', search: {}, replace: true });
    }
  },
  component: WorkshopPage,
  staticData: { pageLabel: 'Workshop' },
});
