import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { JobCloseOutPage } from '@/pages/inventory/close-out/JobCloseOutPage.js';

export const Route = createFileRoute('/_authed/equipment/inventory/close-out/$jobId')({
  params: {
    parse: (params) => ({ jobId: UUID.parse(params.jobId) }),
    stringify: (params) => ({ jobId: params.jobId }),
  },
  staticData: {
    pageLabel: 'Close-out',
  },
  component: JobCloseOutRoute,
});

function JobCloseOutRoute() {
  const { jobId } = Route.useParams();
  return <JobCloseOutPage jobId={jobId} />;
}
