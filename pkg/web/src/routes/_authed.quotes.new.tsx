import { createFileRoute } from '@tanstack/react-router';

import { QuoteFormPage } from '@/pages/quotes/QuoteFormPage.js';

export const Route = createFileRoute('/_authed/quotes/new')({
  staticData: {
    pageLabel: 'New quote',
  },
  component: QuoteFormPage,
});
