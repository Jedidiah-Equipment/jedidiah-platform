import { createFileRoute } from '@tanstack/react-router';

import { PartsPage } from '@/pages/parts/PartsPage.js';

export const Route = createFileRoute('/_authed/parts')({
  staticData: {
    pageLabel: 'Parts',
  },
  component: PartsPage,
});
