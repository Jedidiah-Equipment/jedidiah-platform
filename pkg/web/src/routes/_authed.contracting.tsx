import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireRouteBusinessAccess } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting')({
  beforeLoad: ({ context }) => requireRouteBusinessAccess(context, 'contracting'),
  component: Outlet,
});
