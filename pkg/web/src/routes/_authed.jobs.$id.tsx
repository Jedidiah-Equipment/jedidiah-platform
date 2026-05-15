import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { JobDetailPage } from '@/pages/jobs/JobDetailPage.js';

export const Route = createFileRoute('/_authed/jobs/$id')({
  params: {
    parse: (params) => ({
      id: UUID.parse(params.id),
    }),
    stringify: (params) => ({
      id: params.id,
    }),
  },
  staticData: {
    pageLabel: 'Jobs',
  },
  component: JobDetailRoute,
});

function JobDetailRoute() {
  const { id } = Route.useParams();

  return <JobDetailPage jobId={id} />;
}
