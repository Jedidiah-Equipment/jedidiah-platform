import { createFileRoute } from '@tanstack/react-router';

import { ProductCreatePage } from '@/pages/products/ProductCreatePage.js';

export const Route = createFileRoute('/_authed/products/new')({
  staticData: {
    pageLabel: 'Products',
  },
  component: ProductCreatePage,
});
