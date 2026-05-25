import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { JobCreatePage } from '@/pages/jobs/JobCreatePage.js';

const JobCreateSearch = z.object({
  quoteId: UUID.optional(),
});

export const Route = createFileRoute('/_authed/jobs/new')({
  validateSearch: JobCreateSearch,
  staticData: {
    pageLabel: 'New job',
  },
  component: JobCreateRoute,
});

function JobCreateRoute() {
  const { quoteId } = Route.useSearch();

  return <JobCreatePage quoteId={quoteId} />;
}
