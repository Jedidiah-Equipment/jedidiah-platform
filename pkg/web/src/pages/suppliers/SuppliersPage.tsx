import { useNavigate } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { PartBulkImportDialog } from '../parts/PartBulkImportDialog.js';
import { SupplierTable } from './components/SupplierTable.js';
import { SupplierCreateDialog } from './SupplierCreateDialog.js';

export const SuppliersPage: React.FC = () => {
  const navigate = useNavigate();
  const canUpdatePart = useCan('part:update').can;
  const canUpdateSupplier = useCan('supplier:update').can;
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <>
      <ListPageLayout
        action={
          canUpdatePart || canUpdateSupplier ? (
            <div className="flex gap-2">
              {canUpdatePart ? <PartBulkImportDialog /> : null}
              {canUpdateSupplier ? (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
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
        />
      </ListPageLayout>
      {canUpdateSupplier ? (
        <SupplierCreateDialog onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen} />
      ) : null}
    </>
  );
};
