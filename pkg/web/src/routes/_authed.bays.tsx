import { createFileRoute } from '@tanstack/react-router';

import { BaysPage } from '@/pages/bays/BaysPage.js';

export const Route = createFileRoute('/_authed/bays')({
  staticData: {
    pageLabel: 'Bays',
  },
  component: BaysPage,
});
