import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireRoutePermission } from '@/lib/route-auth.js';
export const Route = createFileRoute('/_authed/contracting/work-types')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_directory:read'),
  component: Outlet,
  staticData: { pageLabel: 'Work types' },
});
