import { createFileRoute } from '@tanstack/react-router';
import { MachineEditPage } from '@/contracting/pages/fleet/MachineEditPage.js';
import { uuidParams } from '@/lib/route-params.js';
export const Route = createFileRoute('/_authed/contracting/fleet/$id/edit')({
  params: uuidParams,
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  return <MachineEditPage id={Route.useParams().id} />;
}
