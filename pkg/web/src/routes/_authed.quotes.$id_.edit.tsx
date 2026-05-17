import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { QuoteFormPage } from '@/pages/quotes/QuoteFormPage.js';

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

  return <QuoteFormPage quoteId={id} />;
}
