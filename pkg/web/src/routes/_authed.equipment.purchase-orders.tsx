import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/purchase-orders')({
  staticData: { pageLabel: 'Purchase Orders' },
  component: PurchaseOrdersRoute,
});

function PurchaseOrdersRoute() {
  return <Outlet />;
}
