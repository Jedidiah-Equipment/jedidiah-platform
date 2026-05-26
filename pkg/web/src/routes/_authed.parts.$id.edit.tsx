import { UUID } from '@pkg/schema';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { PartEditPage } from '@/pages/parts/PartEditPage.js';

export const Route = createFileRoute('/_authed/parts/$id/edit')({
  beforeLoad: ({ params }) => {
    const id = UUID.safeParse(params.id);

    if (!id.success) {
      throw redirect({ to: '/parts' });
    }
  },
  staticData: {
    pageLabel: 'Parts',
  },
  component: PartEditRoute,
});

function PartEditRoute() {
  const { id } = Route.useParams();

  return <PartEditPage partId={id} />;
}
