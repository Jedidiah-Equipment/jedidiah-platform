import { createFileRoute } from '@tanstack/react-router';
import { MeasureTypeEditPage } from '@/contracting/pages/rate-card/MeasureTypeEditPage.js';
import { uuidParams } from '@/lib/route-params.js';
export const Route = createFileRoute('/_authed/contracting/measure-types/$id/edit')({
  params: uuidParams,
  component: EditRoute,
  staticData: { pageLabel: 'Details' },
});
function EditRoute() {
  return <MeasureTypeEditPage id={Route.useParams().id} />;
}
