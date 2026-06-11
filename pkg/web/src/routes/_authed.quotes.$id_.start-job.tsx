import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { StartJobPage } from '@/pages/quotes/StartJobPage.js';

export const Route = createFileRoute('/_authed/quotes/$id_/start-job')({
  params: {
    parse: (params) => ({
      id: UUID.parse(params.id),
    }),
  },
  staticData: {
    pageLabel: 'Start job',
  },
  component: StartJobRoute,
});

function StartJobRoute() {
  const { id } = Route.useParams();

  return <StartJobPage quoteId={id} />;
}
