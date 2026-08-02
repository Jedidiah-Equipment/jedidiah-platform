import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { StockMovementHistoryPage } from '@/pages/inventory/StockMovementHistoryPage.js';

export const Route = createFileRoute('/_authed/inventory/$partId')({
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
