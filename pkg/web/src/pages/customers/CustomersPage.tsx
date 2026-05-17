import { useNavigate } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import type React from 'react';

import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { CustomerTable } from './components/CustomerTable.js';

export const CustomersPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <CardDescription>Directory</CardDescription>
              <CardTitle>Customers</CardTitle>
            </div>
            <Button onClick={() => navigate({ to: '/customers/new' })}>
              <PlusIcon data-icon="inline-start" />
              New customer
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Separator />
          <CustomerTable
            onEditCustomer={(customer) => navigate({ to: '/customers/$id/edit', params: { id: customer.id } })}
          />
        </CardContent>
      </Card>
    </div>
  );
};
