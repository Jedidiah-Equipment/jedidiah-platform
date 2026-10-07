import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireAnyRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/workshop')({
  beforeLoad: ({ context }) =>
    requireAnyRoutePermission(context, ['contracting_breakdown:read', 'contracting_breakdown:report']),
  component: Outlet,
  staticData: { pageLabel: 'Workshop' },
});
