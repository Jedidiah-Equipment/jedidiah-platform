import { createFileRoute } from '@tanstack/react-router';

import { SupplierCreatePage } from '@/pages/suppliers/SupplierCreatePage.js';

export const Route = createFileRoute('/_authed/suppliers/new')({
  staticData: {
    pageLabel: 'Suppliers',
  },
  component: SupplierCreatePage,
});
