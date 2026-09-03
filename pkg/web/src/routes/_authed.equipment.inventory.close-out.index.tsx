import { createFileRoute } from '@tanstack/react-router';

import { CloseOutQueuePage } from '@/pages/inventory/close-out/CloseOutQueuePage.js';

export const Route = createFileRoute('/_authed/inventory/close-out/')({
  staticData: {
    pageLabel: 'Close-out',
  },
  component: CloseOutQueuePage,
});
