import { UUID } from '@pkg/schema';
import { createFileRoute, redirect } from '@tanstack/react-router';

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
  beforeLoad: ({ params }) => {
    // The standalone job detail page was dropped; jobs now open in the aside on the jobs list.
    throw redirect({ search: { job: params.id }, to: '/jobs' });
  },
});
