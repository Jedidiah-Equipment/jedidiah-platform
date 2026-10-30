import { createFileRoute } from '@tanstack/react-router';
import { ServiceRecordPage } from '@/contracting/pages/services/ServiceRecordPage.js';
import { uuidParams } from '@/lib/route-params.js';

export const Route = createFileRoute('/_authed/contracting/services/$id')({
  params: uuidParams,
  component: ServiceRecordRoute,
  staticData: { pageLabel: 'Service' },
});

function ServiceRecordRoute() {
  return <ServiceRecordPage id={Route.useParams().id} />;
}
