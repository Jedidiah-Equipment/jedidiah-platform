import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { StocktakeSessionPage } from '@/equipment/pages/inventory/stocktake/StocktakeSessionPage.js';

export const Route = createFileRoute('/_authed/equipment/inventory/stocktake/$sessionId')({
  params: {
    parse: (params) => ({ sessionId: UUID.parse(params.sessionId) }),
    stringify: (params) => ({ sessionId: params.sessionId }),
  },
  staticData: {
    pageLabel: 'Stocktake',
  },
  component: StocktakeSessionRoute,
});

function StocktakeSessionRoute() {
  const { sessionId } = Route.useParams();
  return <StocktakeSessionPage sessionId={sessionId} />;
}
