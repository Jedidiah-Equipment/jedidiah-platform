import { createFileRoute } from '@tanstack/react-router';
import { RateEditPage } from '@/contracting/pages/rate-card/RateEditPage.js';
import { uuidParams } from '@/lib/route-params.js';
export const Route = createFileRoute('/_authed/contracting/rates/$id/edit')({
  params: uuidParams,
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  return <RateEditPage id={Route.useParams().id} />;
}
