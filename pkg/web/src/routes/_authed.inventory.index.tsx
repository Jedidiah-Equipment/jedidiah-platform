import { createFileRoute } from '@tanstack/react-router';

import { InventoryPage } from '@/pages/inventory/InventoryPage.js';

export const Route = createFileRoute('/_authed/inventory/')({
  staticData: {
    pageLabel: 'Inventory',
  },
  component: InventoryPage,
});
