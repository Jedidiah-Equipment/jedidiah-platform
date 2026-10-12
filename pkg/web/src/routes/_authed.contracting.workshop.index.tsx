import { AuthId } from '@pkg/schema';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import {
  focusWorkshopOnMechanic,
  focusWorkshopOnUnsolved,
  WorkshopPage,
} from '@/contracting/pages/workshop/WorkshopPage.js';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/workshop/')({
  /** `mechanic` (Reports) and `unsolved` (Dashboard) arrive once: written into the saved filters and the URL cleared. */
  validateSearch: z.object({ mechanic: AuthId.optional(), unsolved: z.boolean().optional() }),
  beforeLoad: async ({ context, search, preload }) => {
    await requireRoutePermission(context, 'contracting_breakdown:read');
    // Intent preload runs this on hover; only a committed navigation may touch the saved filters.
    if (preload || !(search.mechanic || search.unsolved)) return;
    if (search.mechanic) focusWorkshopOnMechanic(search.mechanic);
    else focusWorkshopOnUnsolved();
    throw redirect({ to: '/contracting/workshop', search: {}, replace: true });
  },
  component: WorkshopPage,
  staticData: { pageLabel: 'Workshop' },
});
