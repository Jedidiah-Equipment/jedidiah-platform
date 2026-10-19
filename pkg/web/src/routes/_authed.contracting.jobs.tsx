import { webJobReadPermissions } from '@pkg/domain/contracting';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireAnyRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/jobs')({
  beforeLoad: ({ context }) => requireAnyRoutePermission(context, webJobReadPermissions),
  component: Outlet,
  staticData: { pageLabel: 'Jobs' },
});
