import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { JobVarianceReportPage } from '@/pages/inventory/job-variance/JobVarianceReportPage.js';

export const Route = createFileRoute('/_authed/inventory/job-variance/$jobId')({
  params: {
    parse: (params) => ({ jobId: UUID.parse(params.jobId) }),
    stringify: (params) => ({ jobId: params.jobId }),
  },
  staticData: {
    pageLabel: 'Material variance',
  },
  component: JobVarianceRoute,
});

function JobVarianceRoute() {
  const { jobId } = Route.useParams();

  return <JobVarianceReportPage jobId={jobId} />;
}
