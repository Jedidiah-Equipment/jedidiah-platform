import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { UnitDetailPage } from '@/pages/units/UnitDetailPage.js';

export const Route = createFileRoute('/_authed/equipment/units/$id')({
  params: {
    parse: (params) => ({
      id: UUID.parse(params.id),
    }),
    stringify: (params) => ({
      id: params.id,
    }),
  },
  staticData: {
    pageLabel: 'Units',
  },
  component: UnitDetailRoute,
});

function UnitDetailRoute() {
  const { id } = Route.useParams();

  return <UnitDetailPage unitId={id} />;
}
