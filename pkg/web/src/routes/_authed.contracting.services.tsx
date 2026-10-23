import { createFileRoute } from '@tanstack/react-router';
import { ServicesPage } from '@/contracting/pages/services/ServicesPage.js';
import { requireRoutePermission } from '@/lib/route-auth.js';
export const Route = createFileRoute('/_authed/contracting/services')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_service:read'),
  component: ServicesPage,
  staticData: { pageLabel: 'Services' },
});
