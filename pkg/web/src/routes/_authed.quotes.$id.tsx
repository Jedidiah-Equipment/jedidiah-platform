import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { QuoteDetailPage } from '@/pages/quotes/QuoteDetailPage.js';

export const Route = createFileRoute('/_authed/quotes/$id')({
  params: {
    parse: (params) => ({
      id: UUID.parse(params.id),
    }),
  },
  staticData: {
    pageLabel: 'Quote',
  },
  component: QuoteDetailRoute,
});

function QuoteDetailRoute() {
  const { id } = Route.useParams();

  return <QuoteDetailPage quoteId={id} />;
}
