import { useNavigate } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import type React from 'react';

import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { CustomerTable } from './components/CustomerTable.js';

export const CustomersPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ListPageLayout
      action={
        <Button onClick={() => navigate({ to: '/customers/new' })}>
          <PlusIcon data-icon="inline-start" />
          New customer
        </Button>
      }
      description="Directory"
      title="Customers"
    >
      <CustomerTable
        onEditCustomer={(customer) => navigate({ to: '/customers/$id/edit', params: { id: customer.id } })}
      />
    </ListPageLayout>
  );
};
