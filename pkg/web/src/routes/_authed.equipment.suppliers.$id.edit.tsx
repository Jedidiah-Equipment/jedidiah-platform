import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { SupplierEditPage } from '@/pages/suppliers/SupplierEditPage.js';

export const Route = createFileRoute('/_authed/suppliers/$id/edit')({
  params: {
    parse: (params) => ({
      id: UUID.parse(params.id),
    }),
    stringify: (params) => ({
      id: params.id,
    }),
  },
  staticData: {
    pageLabel: 'Suppliers',
  },
  component: SupplierEditRoute,
});

function SupplierEditRoute() {
  const { id } = Route.useParams();

  return <SupplierEditPage supplierId={id} />;
}
