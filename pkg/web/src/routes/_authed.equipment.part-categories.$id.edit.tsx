import { createFileRoute } from '@tanstack/react-router';
import { PartCategoryEditPage } from '@/equipment/pages/part-categories/PartCategoryEditPage.js';
import { uuidParams } from '@/lib/route-params.js';
export const Route = createFileRoute('/_authed/equipment/part-categories/$id/edit')({
  params: uuidParams,
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  return <PartCategoryEditPage id={Route.useParams().id} />;
}
