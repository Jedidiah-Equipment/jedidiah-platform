import { createFileRoute } from '@tanstack/react-router';
import { BreakdownPage } from '@/contracting/pages/workshop/BreakdownPage.js';
import { uuidParams } from '@/lib/route-params.js';

export const Route = createFileRoute('/_authed/contracting/workshop/$id')({
  params: uuidParams,
  component: BreakdownRoute,
  staticData: { pageLabel: 'Breakdown' },
});

function BreakdownRoute() {
  return <BreakdownPage id={Route.useParams().id} />;
}
