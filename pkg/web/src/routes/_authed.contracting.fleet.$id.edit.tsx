import { createFileRoute } from '@tanstack/react-router';
import { MachineEditPage } from '@/contracting/pages/fleet/MachineEditPage.js';
import { MachineEditSearch } from '@/contracting/pages/fleet/machine-edit-tabs.js';
import { uuidParams } from '@/lib/route-params.js';
export const Route = createFileRoute('/_authed/contracting/fleet/$id/edit')({
  params: uuidParams,
  validateSearch: MachineEditSearch,
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <MachineEditPage
      id={Route.useParams().id}
      tab={tab}
      onTabChange={(nextTab) => void navigate({ search: { tab: nextTab } })}
    />
  );
}
