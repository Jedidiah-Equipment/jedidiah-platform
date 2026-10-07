import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/workshop')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_breakdown:read'),
  component: Outlet,
  staticData: { pageLabel: 'Workshop' },
});
