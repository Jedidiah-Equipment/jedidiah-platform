import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/equipment/customers')({
  staticData: {
    pageLabel: 'Customers',
  },
  component: CustomersRoute,
});

function CustomersRoute() {
  return <Outlet />;
}
