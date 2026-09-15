import { createFileRoute } from '@tanstack/react-router';
import { ImplementEditPage } from '@/contracting/pages/fleet/ImplementEditPage.js';
import { uuidParams } from '@/lib/route-params.js';
export const Route = createFileRoute('/_authed/contracting/fleet/implements/$id/edit')({
  params: uuidParams,
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  return <ImplementEditPage id={Route.useParams().id} />;
}
