import { createFileRoute } from '@tanstack/react-router';

import { QuotesPage } from '@/equipment/pages/quotes/QuotesPage.js';

export const Route = createFileRoute('/_authed/equipment/quotes/')({
  staticData: {
    pageLabel: 'Quotes',
  },
  component: QuotesPage,
});
