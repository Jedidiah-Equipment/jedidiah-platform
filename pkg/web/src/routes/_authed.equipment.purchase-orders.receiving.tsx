import { createFileRoute } from '@tanstack/react-router';

import { ReceivingPage } from '@/equipment/pages/purchase-orders/ReceivingPage.js';

export const Route = createFileRoute('/_authed/equipment/purchase-orders/receiving')({
  staticData: { pageLabel: 'Receiving' },
  component: ReceivingPage,
});
