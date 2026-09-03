import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { ProductRangeEditPage } from '@/pages/product-ranges/ProductRangeEditPage.js';
import { ProductRangeEditSearch } from '@/pages/product-ranges/product-range-edit-tabs.js';

export const Route = createFileRoute('/_authed/product-ranges/$id/edit')({
  params: {
    parse: (params) => ({
      id: UUID.parse(params.id),
    }),
    stringify: (params) => ({
      id: params.id,
    }),
  },
  validateSearch: ProductRangeEditSearch,
  staticData: {
    pageLabel: 'Product Ranges',
  },
  component: ProductRangeEditRoute,
});

function ProductRangeEditRoute() {
  const { id } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <ProductRangeEditPage
      onTabChange={(nextTab) => void navigate({ search: { tab: nextTab } })}
      rangeId={id}
      tab={tab}
    />
  );
}
