import { IconPlus } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { CustomerCreateDialog } from './CustomerCreateDialog.js';
import { CustomerTable } from './components/CustomerTable.js';

export const CustomersPage: React.FC = () => {
  const navigate = useNavigate();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <>
      <PageLayout
        actions={
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <IconPlus data-icon="inline-start" />
            New customer
          </Button>
        }
        description="Directory"
        size="lg"
        title="Customers"
      >
        <CustomerTable
          onEditCustomer={(customer) => navigate({ to: '/customers/$id/edit', params: { id: customer.id } })}
        />
      </PageLayout>
      <CustomerCreateDialog onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen} />
    </>
  );
};
