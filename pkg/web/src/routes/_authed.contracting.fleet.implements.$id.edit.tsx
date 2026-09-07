import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';
import { ImplementEditPage } from '@/contracting/pages/fleet/ImplementEditPage.js';
export const Route = createFileRoute('/_authed/contracting/fleet/implements/$id/edit')({
  params: { parse: (params) => ({ id: UUID.parse(params.id) }) },
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  return <ImplementEditPage id={Route.useParams().id} />;
}
