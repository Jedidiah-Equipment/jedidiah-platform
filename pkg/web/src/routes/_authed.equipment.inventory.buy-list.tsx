import { createFileRoute } from '@tanstack/react-router';

import { BuyListPage } from '@/pages/inventory/buy-list/BuyListPage.js';

export const Route = createFileRoute('/_authed/equipment/inventory/buy-list')({
  staticData: {
    pageLabel: 'Buy list',
  },
  component: BuyListPage,
});
