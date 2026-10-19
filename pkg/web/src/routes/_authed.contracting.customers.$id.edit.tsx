import { createFileRoute } from '@tanstack/react-router';
import { CustomerEditPage } from '@/contracting/pages/directory/CustomerEditPage.js';
import { CustomerEditSearch } from '@/contracting/pages/directory/customer-edit-tabs.js';
import { uuidParams } from '@/lib/route-params.js';
export const Route = createFileRoute('/_authed/contracting/customers/$id/edit')({
  params: uuidParams,
  validateSearch: CustomerEditSearch,
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <CustomerEditPage
      id={Route.useParams().id}
      tab={tab}
      onTabChange={(nextTab) => void navigate({ search: { tab: nextTab } })}
    />
  );
}
