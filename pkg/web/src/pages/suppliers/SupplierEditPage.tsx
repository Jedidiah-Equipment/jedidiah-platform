import type { Part, Supplier, UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';

import { BackButton } from '@/components/button/BackButton.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { EditPageLayout } from '@/components/page-layout/EditPageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { PartTable } from '../parts/components/PartTable.js';
import { PartBulkImportDialog } from '../parts/PartBulkImportDialog.js';
import { PartCreateDialog } from '../parts/PartCreateDialog.js';
import { PartEditDialog } from '../parts/PartEditDialog.js';
import { SupplierForm } from './components/SupplierForm.js';

type SupplierEditPageProps = {
  supplierId: UUID;
};

export const SupplierEditPage: React.FC<SupplierEditPageProps> = ({ supplierId }) => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const supplierQuery = useQuery(trpc.suppliers.get.queryOptions({ id: supplierId }));
  const updateSupplierMutation = useMutation(
    trpc.suppliers.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.suppliers.list.queryFilter()),
          queryClient.invalidateQueries(trpc.suppliers.get.queryFilter({ id: supplierId })),
        ]);
      },
    }),
  );

  return (
    <EditPageLayout
      back={<BackButton to="/suppliers">Suppliers</BackButton>}
      description="Edit Supplier"
      title={supplierQuery.data?.companyName ?? 'Loading supplier...'}
    >
      {supplierQuery.isPending ? <SupplierFormSkeleton /> : null}
      <ErrorMessage error={supplierQuery.error} fallbackMessage="Unable to load supplier." />
      {supplierQuery.data ? (
        <SupplierEditTabs
          onSupplierSave={(value) => updateSupplierMutation.mutateAsync(value)}
          supplier={supplierQuery.data}
        />
      ) : null}
    </EditPageLayout>
  );
};

type SupplierEditTabsProps = {
  onSupplierSave: React.ComponentProps<typeof SupplierForm>['onSave'];
  supplier: Supplier;
};

const SupplierEditTabs: React.FC<SupplierEditTabsProps> = ({ onSupplierSave, supplier }) => {
  const canReadPart = useCan('part:read').can;
  const canUpdatePart = useCan('part:update').can;
  const [editingPart, setEditingPart] = useState<Part | null>(null);

  return (
    <Tabs className="w-full" defaultValue="supplier">
      <TabsList variant="default">
        <TabsTrigger value="supplier">Details</TabsTrigger>
        {canReadPart ? <TabsTrigger value="parts">Parts</TabsTrigger> : null}
      </TabsList>
      <TabsContent className="pt-4" value="supplier">
        <SupplierForm key={supplier.id} onSave={onSupplierSave} supplier={supplier} />
      </TabsContent>
      {canReadPart ? (
        <TabsContent className="pt-4" value="parts">
          <PartTable
            onEditPart={canUpdatePart ? (part) => setEditingPart(part) : undefined}
            rightSection={
              canUpdatePart ? (
                <div className="flex gap-2">
                  <PartBulkImportDialog supplier={supplier} />
                  <PartCreateDialog supplier={supplier} />
                </div>
              ) : undefined
            }
            showEditActions={canUpdatePart}
            supplierId={supplier.id}
          />
          <PartEditDialog onClose={() => setEditingPart(null)} part={editingPart} supplier={supplier} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
};

function SupplierFormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
