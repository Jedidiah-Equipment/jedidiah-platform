import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/equipment/inventory')({
  staticData: {
    pageLabel: 'Inventory',
  },
  component: InventoryRoute,
});

function InventoryRoute() {
  return <Outlet />;
}
