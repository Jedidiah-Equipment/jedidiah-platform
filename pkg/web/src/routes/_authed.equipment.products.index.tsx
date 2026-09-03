import { createFileRoute } from '@tanstack/react-router';

import { ProductsPage } from '@/equipment/pages/products/ProductsPage.js';

export const Route = createFileRoute('/_authed/equipment/products/')({
  staticData: {
    pageLabel: 'Products',
  },
  component: ProductsPage,
});
