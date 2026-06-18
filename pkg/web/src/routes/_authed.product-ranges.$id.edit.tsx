import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { ProductRangeEditPage } from '@/pages/product-ranges/ProductRangeEditPage.js';

export const Route = createFileRoute('/_authed/product-ranges/$id/edit')({
  params: {
    parse: (params) => ({
      id: UUID.parse(params.id),
    }),
    stringify: (params) => ({
      id: params.id,
    }),
  },
  staticData: {
    pageLabel: 'Product Ranges',
  },
  component: ProductRangeEditRoute,
});

function ProductRangeEditRoute() {
  const { id } = Route.useParams();

  return <ProductRangeEditPage rangeId={id} />;
}
