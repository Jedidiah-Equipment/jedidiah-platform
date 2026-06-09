import type { Part, Supplier, UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo, useState } from 'react';
import { AuditTable, useSupplierAuditTableStore } from '@/components/audit/AuditTable.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useCan } from '@/hooks/use-access.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
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
  const trpc = useTRPC();
  const { invalidateSuppliers } = useQueryInvalidation();
  const supplierQuery = useQuery(trpc.suppliers.get.queryOptions({ id: supplierId }));
  const updateSupplierMutation = useMutation(
    trpc.suppliers.update.mutationOptions({
      onSuccess: async () => {
        await invalidateSuppliers();
      },
    }),
  );

  return (
    <PageLayout description="Edit Supplier" size="md" title={supplierQuery.data?.companyName ?? 'Loading supplier...'}>
      {supplierQuery.isPending ? <SupplierFormSkeleton /> : null}
      <ErrorMessage error={supplierQuery.error} fallbackMessage="Unable to load supplier." />
      {supplierQuery.data ? (
        <SupplierEditTabs
          onSupplierSave={(value) => updateSupplierMutation.mutateAsync(value)}
          supplier={supplierQuery.data}
        />
      ) : null}
    </PageLayout>
  );
};

type SupplierEditTabsProps = {
  onSupplierSave: React.ComponentProps<typeof SupplierForm>['onSave'];
  supplier: Supplier;
};

const SupplierEditTabs: React.FC<SupplierEditTabsProps> = ({ onSupplierSave, supplier }) => {
  const canReadPart = useCan('part:read').can;
  const canUpdatePart = useCan('part:update').can;
  const auditAccess = useCan('audit:read');
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const supplierAuditFilters = useMemo(
    () => ({
      entityIds: [supplier.id],
      entityTypes: ['supplier' as const],
    }),
    [supplier.id],
  );

  return (
    <Tabs className="w-full" defaultValue="supplier" size="sm">
      <TabsList variant="default">
        <TabsTrigger value="supplier">Details</TabsTrigger>
        {canReadPart ? <TabsTrigger value="parts">Parts</TabsTrigger> : null}
        {auditAccess.can ? <TabsTrigger value="audit">Audit</TabsTrigger> : null}
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
                  <PartBulkImportDialog supplier={supplier} buttonSize="sm" />
                  <PartCreateDialog supplier={supplier} buttonSize="sm" />
                </div>
              ) : undefined
            }
            supplierId={supplier.id}
          />
          <PartEditDialog onClose={() => setEditingPart(null)} part={editingPart} supplier={supplier} />
        </TabsContent>
      ) : null}
      {auditAccess.can ? (
        <TabsContent className="pt-4" value="audit">
          <AuditTable
            emptyMessage="No audit events found for this supplier."
            fixedFilters={supplierAuditFilters}
            showEntityTypeFilter={false}
            store={useSupplierAuditTableStore}
          />
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
