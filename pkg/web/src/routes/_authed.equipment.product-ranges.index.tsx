import { createFileRoute } from '@tanstack/react-router';

import { ProductRangesPage } from '@/pages/product-ranges/ProductRangesPage.js';

export const Route = createFileRoute('/_authed/equipment/product-ranges/')({
  staticData: {
    pageLabel: 'Product Ranges',
  },
  component: ProductRangesPage,
});
