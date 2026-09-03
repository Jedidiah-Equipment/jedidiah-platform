import { createFileRoute } from '@tanstack/react-router';

import { QuotesPage } from '@/pages/quotes/QuotesPage.js';

export const Route = createFileRoute('/_authed/quotes/')({
  staticData: {
    pageLabel: 'Quotes',
  },
  component: QuotesPage,
});
