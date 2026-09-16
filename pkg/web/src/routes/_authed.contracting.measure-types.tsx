import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireRoutePermission } from '@/lib/route-auth.js';
export const Route = createFileRoute('/_authed/contracting/measure-types')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_rate:read'),
  component: Outlet,
  staticData: { pageLabel: 'Measure Types' },
});
