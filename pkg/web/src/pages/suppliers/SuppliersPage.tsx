import { useNavigate } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import type React from 'react';

import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { PartBulkImportDialog } from '../parts/PartBulkImportDialog.js';
import { SupplierTable } from './components/SupplierTable.js';

export const SuppliersPage: React.FC = () => {
  const navigate = useNavigate();
  const canUpdatePart = useCan('part:update').can;
  const canUpdateSupplier = useCan('supplier:update').can;

  return (
    <ListPageLayout
      action={
        canUpdatePart || canUpdateSupplier ? (
          <div className="flex gap-2">
            {canUpdatePart ? <PartBulkImportDialog /> : null}
            {canUpdateSupplier ? (
              <Button onClick={() => navigate({ to: '/suppliers/new' })}>
                <PlusIcon data-icon="inline-start" />
                New supplier
              </Button>
            ) : null}
          </div>
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
