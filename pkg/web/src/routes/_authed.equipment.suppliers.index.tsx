import { createFileRoute } from '@tanstack/react-router';

import { SuppliersPage } from '@/pages/suppliers/SuppliersPage.js';

export const Route = createFileRoute('/_authed/equipment/suppliers/')({
  staticData: {
    pageLabel: 'Suppliers',
  },
  component: SuppliersPage,
});
