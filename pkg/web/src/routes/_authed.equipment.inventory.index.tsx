import { createFileRoute } from '@tanstack/react-router';

import { InventoryPage } from '@/equipment/pages/inventory/InventoryPage.js';

export const Route = createFileRoute('/_authed/equipment/inventory/')({
  staticData: {
    pageLabel: 'Inventory',
  },
  component: InventoryPage,
});
