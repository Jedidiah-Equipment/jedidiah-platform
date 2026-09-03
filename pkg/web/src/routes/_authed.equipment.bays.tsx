import { createFileRoute } from '@tanstack/react-router';

import { BaysPage } from '@/equipment/pages/bays/BaysPage.js';

export const Route = createFileRoute('/_authed/equipment/bays')({
  staticData: {
    pageLabel: 'Bays',
  },
  component: BaysPage,
});
