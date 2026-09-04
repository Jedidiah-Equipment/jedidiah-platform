import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireRouteBusinessAccess } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/equipment')({
  beforeLoad: ({ context }) => requireRouteBusinessAccess(context, 'equipment'),
  component: Outlet,
});
