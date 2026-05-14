import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { ProductEditPage } from '@/pages/products/ProductEditPage.js';

export const Route = createFileRoute('/_authed/products/$id/edit')({
  params: {
    parse: (params) => ({
      id: UUID.parse(params.id),
    }),
    stringify: (params) => ({
      id: params.id,
    }),
  },
  staticData: {
    pageLabel: 'Products',
  },
  component: ProductEditRoute,
});

function ProductEditRoute() {
  const { id } = Route.useParams();

  return <ProductEditPage productId={id} />;
}
