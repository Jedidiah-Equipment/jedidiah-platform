import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { JobEditPage } from '@/pages/jobs/JobEditPage.js';

export const Route = createFileRoute('/_authed/jobs/$id_/edit')({
  params: {
    parse: (params) => ({
      id: UUID.parse(params.id),
    }),
  },
  staticData: {
    pageLabel: 'Edit job',
  },
  component: JobEditRoute,
});

function JobEditRoute() {
  const { id } = Route.useParams();

  return <JobEditPage jobId={id} />;
}
