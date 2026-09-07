import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';
import { MachineEditPage } from '@/contracting/pages/fleet/MachineEditPage.js';
export const Route = createFileRoute('/_authed/contracting/fleet/$id/edit')({
  params: { parse: (params) => ({ id: UUID.parse(params.id) }) },
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  return <MachineEditPage id={Route.useParams().id} />;
}
