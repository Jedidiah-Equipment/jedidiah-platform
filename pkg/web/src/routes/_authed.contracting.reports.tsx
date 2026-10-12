import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/reports')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_report:read'),
  component: Outlet,
  staticData: { pageLabel: 'Reports' },
});
