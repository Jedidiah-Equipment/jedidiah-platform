import { createFileRoute } from '@tanstack/react-router';
import { WorkshopPage } from '@/contracting/pages/workshop/WorkshopPage.js';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/workshop/')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_breakdown:read'),
  component: WorkshopPage,
  staticData: { pageLabel: 'Workshop' },
});
