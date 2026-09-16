import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireRoutePermission } from '@/lib/route-auth.js';
export const Route = createFileRoute('/_authed/contracting/rates')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_rate:read'),
  component: Outlet,
  staticData: { pageLabel: 'Rate Card' },
});
