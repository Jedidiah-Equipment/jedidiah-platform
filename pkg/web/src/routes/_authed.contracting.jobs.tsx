import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/jobs')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_job:read'),
  component: Outlet,
  staticData: { pageLabel: 'Jobs' },
});
