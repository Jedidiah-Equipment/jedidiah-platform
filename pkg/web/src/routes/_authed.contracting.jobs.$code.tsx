import { JobNumber } from '@pkg/schema/contracting';
import { createFileRoute } from '@tanstack/react-router';
import { JobPage } from '@/contracting/pages/jobs/JobPage.js';

export const Route = createFileRoute('/_authed/contracting/jobs/$code')({
  params: { parse: ({ code }) => ({ code: JobNumber.parse(code) }) },
  component: JobRoute,
  staticData: { pageLabel: 'Job' },
});

function JobRoute() {
  return <JobPage code={Route.useParams().code} />;
}
