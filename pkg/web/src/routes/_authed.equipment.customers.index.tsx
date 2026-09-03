import { createFileRoute } from '@tanstack/react-router';

import { CustomersPage } from '@/pages/customers/CustomersPage.js';

export const Route = createFileRoute('/_authed/equipment/customers/')({
  staticData: {
    pageLabel: 'Customers',
  },
  component: CustomersPage,
});
