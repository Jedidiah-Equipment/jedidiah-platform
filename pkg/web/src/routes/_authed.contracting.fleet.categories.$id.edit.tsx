import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';
import { CategoryEditPage } from '@/contracting/pages/fleet/CategoryEditPage.js';
export const Route = createFileRoute('/_authed/contracting/fleet/categories/$id/edit')({
  params: { parse: (params) => ({ id: UUID.parse(params.id) }) },
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  return <CategoryEditPage id={Route.useParams().id} />;
}
