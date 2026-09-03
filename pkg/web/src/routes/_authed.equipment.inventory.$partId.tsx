import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { StockMovementHistoryPage } from '@/equipment/pages/inventory/StockMovementHistoryPage.js';

export const Route = createFileRoute('/_authed/equipment/inventory/$partId')({
  params: {
    parse: (params) => ({ partId: UUID.parse(params.partId) }),
    stringify: (params) => ({ partId: params.partId }),
  },
  staticData: {
    pageLabel: 'Inventory',
  },
  component: StockMovementHistoryRoute,
});

function StockMovementHistoryRoute() {
  const { partId } = Route.useParams();
  return <StockMovementHistoryPage partId={partId} />;
}
