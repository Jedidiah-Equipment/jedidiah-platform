import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireRoutePermission } from '@/lib/route-auth.js';
export const Route = createFileRoute('/_authed/contracting/fleet')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_machine:read'),
  component: Outlet,
  staticData: { pageLabel: 'Fleet' },
});
