import { UUID } from '@pkg/schema';
import { createFileRoute } from '@tanstack/react-router';

import { ProductEditPage } from '@/pages/products/ProductEditPage.js';
import { ProductEditSearch } from '@/pages/products/product-edit-tabs.js';

export const Route = createFileRoute('/_authed/products/$id/edit')({
  params: {
    parse: (params) => ({
      id: UUID.parse(params.id),
    }),
    stringify: (params) => ({
      id: params.id,
    }),
  },
  validateSearch: ProductEditSearch,
  staticData: {
    pageLabel: 'Products',
  },
  component: ProductEditRoute,
});

function ProductEditRoute() {
  const { id } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <ProductEditPage
      onTabChange={(nextTab) =>
        void navigate({
          // This stays inside the editor, so invalid fields must not prevent users reaching another tab to fix them.
          ignoreBlocker: true,
          search: { tab: nextTab },
        })
      }
      productId={id}
      tab={tab}
    />
  );
}
