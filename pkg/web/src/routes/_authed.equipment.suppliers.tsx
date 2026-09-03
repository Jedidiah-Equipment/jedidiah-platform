import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/suppliers')({
  staticData: {
    pageLabel: 'Suppliers',
  },
  component: SuppliersRoute,
});

function SuppliersRoute() {
  return <Outlet />;
}
