import { createFileRoute, Outlet } from '@tanstack/react-router';
export const Route = createFileRoute('/_authed/contracting/fleet/implements')({
  component: Outlet,
  staticData: { pageLabel: 'Implements' },
});
