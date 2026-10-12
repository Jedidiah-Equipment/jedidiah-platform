import { AuthId } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';
import { WorkshopPage } from '@/contracting/pages/workshop/WorkshopPage.js';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/workshop/')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_breakdown:read'),
  /** `mechanic` (Reports) and `unsolved` (Dashboard) arrive once; the page applies them to the saved filters and clears them. */
  validateSearch: z.object({ mechanic: AuthId.optional(), unsolved: z.boolean().optional() }),
  component: WorkshopRoute,
  staticData: { pageLabel: 'Workshop' },
});

function WorkshopRoute() {
  const { mechanic, unsolved } = Route.useSearch();
  const navigate = Route.useNavigate();
  const clearFocus = useCallback(() => void navigate({ search: {}, replace: true }), [navigate]);
  return <WorkshopPage mechanic={mechanic} unsolved={unsolved} onFocusApplied={clearFocus} />;
}
