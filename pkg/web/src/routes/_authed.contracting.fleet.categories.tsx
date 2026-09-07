import { createFileRoute, Outlet } from '@tanstack/react-router';
export const Route = createFileRoute('/_authed/contracting/fleet/categories')({
  component: Outlet,
  staticData: { pageLabel: 'Categories' },
});
