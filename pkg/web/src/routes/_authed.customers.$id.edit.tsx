import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { CustomerEditPage } from '@/pages/customers/CustomerEditPage.js';

export const Route = createFileRoute('/_authed/customers/$id/edit')({
  params: {
    parse: (params) => z.object({ id: UUID }).parse(params),
  },
  staticData: {
    pageLabel: 'Customers',
  },
  component: CustomerEditRoute,
});

function CustomerEditRoute() {
  const params = Route.useParams();

  return <CustomerEditPage customerId={params.id} />;
}
