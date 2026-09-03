import { createFileRoute } from '@tanstack/react-router';

import { CloseOutQueuePage } from '@/equipment/pages/inventory/close-out/CloseOutQueuePage.js';

export const Route = createFileRoute('/_authed/equipment/inventory/close-out/')({
  staticData: {
    pageLabel: 'Close-out',
  },
  component: CloseOutQueuePage,
});
