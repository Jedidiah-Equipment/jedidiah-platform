import { createFileRoute } from '@tanstack/react-router';

import { CustomerCreatePage } from '@/pages/customers/CustomerCreatePage.js';

export const Route = createFileRoute('/_authed/customers/new')({
  staticData: {
    pageLabel: 'Customers',
  },
  component: CustomerCreatePage,
});
