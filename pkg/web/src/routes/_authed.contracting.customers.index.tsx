import { createFileRoute } from '@tanstack/react-router';
import { CustomersPage } from '@/contracting/pages/directory/CustomersPage.js';
export const Route = createFileRoute('/_authed/contracting/customers/')({
  component: CustomersPage,
  staticData: { pageLabel: 'Customers' },
});
