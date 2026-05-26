import { useNavigate } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import type React from 'react';

import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { SupplierTable } from './components/SupplierTable.js';

export const SuppliersPage: React.FC = () => {
  const navigate = useNavigate();
  const canUpdateSupplier = useCan('supplier:update').can;

  return (
    <ListPageLayout
      action={
        canUpdateSupplier ? (
          <Button onClick={() => navigate({ to: '/suppliers/new' })}>
            <PlusIcon data-icon="inline-start" />
            New supplier
          </Button>
        ) : null
      }
      description="Procurement"
      title="Suppliers"
    >
      <SupplierTable
        onEditSupplier={
          canUpdateSupplier
            ? (supplier) => navigate({ to: '/suppliers/$id/edit', params: { id: supplier.id } })
            : undefined
        }
        showEditActions={canUpdateSupplier}
      />
    </ListPageLayout>
  );
};
