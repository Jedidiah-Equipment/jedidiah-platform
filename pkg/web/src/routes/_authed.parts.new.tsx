import { createFileRoute } from '@tanstack/react-router';

import { PartCreatePage } from '@/pages/parts/PartCreatePage.js';

export const Route = createFileRoute('/_authed/parts/new')({
  staticData: {
    pageLabel: 'Parts',
  },
  component: PartCreatePage,
});
