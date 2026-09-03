import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/equipment/purchase-orders')({
  staticData: { pageLabel: 'Purchase Orders' },
  component: PurchaseOrdersRoute,
});

function PurchaseOrdersRoute() {
  return <Outlet />;
}
