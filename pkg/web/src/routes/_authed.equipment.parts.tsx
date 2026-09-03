import { createFileRoute } from '@tanstack/react-router';

import { PartsPage } from '@/equipment/pages/parts/PartsPage.js';

export const Route = createFileRoute('/_authed/equipment/parts')({
  staticData: {
    pageLabel: 'Parts',
  },
  component: PartsPage,
});
