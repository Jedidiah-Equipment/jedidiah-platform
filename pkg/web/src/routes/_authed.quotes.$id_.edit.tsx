import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { QuoteEditPage } from '@/pages/quotes/QuoteEditPage.js';

export const Route = createFileRoute('/_authed/quotes/$id_/edit')({
  params: {
    parse: (params) => ({
      id: UUID.parse(params.id),
    }),
  },
  staticData: {
    pageLabel: 'Edit quote',
  },
  component: QuoteEditRoute,
});

function QuoteEditRoute() {
  const { id } = Route.useParams();

  return <QuoteEditPage quoteId={id} />;
}
