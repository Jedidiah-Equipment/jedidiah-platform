import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { PurchaseOrderDetailPage } from '@/equipment/pages/purchase-orders/PurchaseOrderDetailPage.js';

export const Route = createFileRoute('/_authed/equipment/purchase-orders/$id')({
  params: {
    parse: (params) => ({ id: UUID.parse(params.id) }),
    stringify: (params) => ({ id: params.id }),
  },
  staticData: { pageLabel: 'Purchase Orders' },
  component: PurchaseOrderDetailRoute,
});

function PurchaseOrderDetailRoute() {
  const { id } = Route.useParams();
  return <PurchaseOrderDetailPage purchaseOrderId={id} />;
}
