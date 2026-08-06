import { createFileRoute } from '@tanstack/react-router';

import { StocktakeSessionsPage } from '@/pages/inventory/stocktake/StocktakeSessionsPage.js';

export const Route = createFileRoute('/_authed/inventory/stocktake/')({
  staticData: {
    pageLabel: 'Stocktake',
  },
  component: StocktakeSessionsPage,
});
