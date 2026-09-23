import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/invoicing')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_job:read-priced'),
  component: Outlet,
  staticData: { pageLabel: 'Invoicing' },
});
