import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireAnyRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/jobs')({
  beforeLoad: ({ context }) =>
    requireAnyRoutePermission(context, ['contracting_job:read', 'contracting_job:read-priced']),
  component: Outlet,
  staticData: { pageLabel: 'Jobs' },
});
