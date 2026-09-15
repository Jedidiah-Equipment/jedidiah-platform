import { createFileRoute } from '@tanstack/react-router';
import { CustomerEditPage } from '@/contracting/pages/directory/CustomerEditPage.js';
import { uuidParams } from '@/lib/route-params.js';
export const Route = createFileRoute('/_authed/contracting/customers/$id/edit')({
  params: uuidParams,
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  return <CustomerEditPage id={Route.useParams().id} />;
}
