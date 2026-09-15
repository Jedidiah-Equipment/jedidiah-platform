import { createFileRoute } from '@tanstack/react-router';
import { WorkTypeEditPage } from '@/contracting/pages/directory/WorkTypeEditPage.js';
import { uuidParams } from '@/lib/route-params.js';
export const Route = createFileRoute('/_authed/contracting/work-types/$id/edit')({
  params: uuidParams,
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  return <WorkTypeEditPage id={Route.useParams().id} />;
}
