import { AuthId } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';
import { WorkshopPage } from '@/contracting/pages/workshop/WorkshopPage.js';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/workshop/')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_breakdown:read'),
  /** `mechanic` arrives from the Reports page once; the page applies it to the saved filters and clears it. */
  validateSearch: z.object({ mechanic: AuthId.optional() }),
  component: WorkshopRoute,
  staticData: { pageLabel: 'Workshop' },
});

function WorkshopRoute() {
  const { mechanic } = Route.useSearch();
  const navigate = Route.useNavigate();
  const clearMechanic = useCallback(() => void navigate({ search: {}, replace: true }), [navigate]);
  return <WorkshopPage mechanic={mechanic} onMechanicApplied={clearMechanic} />;
}
