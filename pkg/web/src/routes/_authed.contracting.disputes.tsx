import { createFileRoute } from '@tanstack/react-router';
import { DisputesPage } from '@/contracting/pages/readings/DisputesPage.js';
import { requireRoutePermission } from '@/lib/route-auth.js';
export const Route = createFileRoute('/_authed/contracting/disputes')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_reading:update'),
  component: DisputesPage,
  staticData: { pageLabel: 'Disputes' },
});
