import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';
import { WorkTypeEditPage } from '@/contracting/pages/directory/WorkTypeEditPage.js';
export const Route = createFileRoute('/_authed/contracting/work-types/$id/edit')({
  params: { parse: (params) => ({ id: UUID.parse(params.id) }) },
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  return <WorkTypeEditPage id={Route.useParams().id} />;
}
