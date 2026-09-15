import { createFileRoute } from '@tanstack/react-router';
import { CategoryEditPage } from '@/contracting/pages/fleet/CategoryEditPage.js';
import { uuidParams } from '@/lib/route-params.js';
export const Route = createFileRoute('/_authed/contracting/fleet/categories/$id/edit')({
  params: uuidParams,
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  return <CategoryEditPage id={Route.useParams().id} />;
}
