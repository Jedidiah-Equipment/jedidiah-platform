import { createFileRoute } from '@tanstack/react-router';

import { PurchaseOrdersPage } from '@/pages/purchase-orders/PurchaseOrdersPage.js';

export const Route = createFileRoute('/_authed/purchase-orders/')({
  staticData: { pageLabel: 'Purchase Orders' },
  component: PurchaseOrdersPage,
});
