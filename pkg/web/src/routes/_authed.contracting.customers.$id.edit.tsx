import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';
import { CustomerEditPage } from '@/contracting/pages/directory/CustomerEditPage.js';
export const Route = createFileRoute('/_authed/contracting/customers/$id/edit')({
  params: { parse: (params) => ({ id: UUID.parse(params.id) }) },
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  return <CustomerEditPage id={Route.useParams().id} />;
}
