import type { UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { toast } from 'sonner';

import { BackButton } from '@/components/button/BackButton.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { EditPageLayout } from '@/components/page-layout/EditPageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { SupplierForm } from './components/SupplierForm.js';

type SupplierEditPageProps = {
  supplierId: UUID;
};

export const SupplierEditPage: React.FC<SupplierEditPageProps> = ({ supplierId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();
  const supplierQuery = useQuery(trpc.suppliers.get.queryOptions({ id: supplierId }));
  const updateSupplierMutation = useMutation(
    trpc.suppliers.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.suppliers.list.queryFilter()),
          queryClient.invalidateQueries(trpc.suppliers.get.queryFilter({ id: supplierId })),
        ]);
        toast.success('Supplier updated');
        await navigate({ to: '/suppliers' });
      },
      onError: (error) => {
        showMutationError(error, 'Unable to update supplier.');
      },
    }),
  );

  return (
    <EditPageLayout
      back={<BackButton to="/suppliers">Suppliers</BackButton>}
      description="Procurement"
      title="Edit supplier"
    >
      {supplierQuery.isPending ? <SupplierFormSkeleton /> : null}
      <ErrorMessage error={supplierQuery.error} fallbackMessage="Unable to load supplier." />
      {supplierQuery.data ? (
        <SupplierForm
          initialSupplier={supplierQuery.data}
          isPending={updateSupplierMutation.isPending}
          key={supplierQuery.data.id}
          onSubmit={(value) =>
            updateSupplierMutation.mutateAsync({
              ...value,
              id: supplierQuery.data.id,
            })
          }
          submitLabel="Save supplier"
        />
      ) : null}
    </EditPageLayout>
  );
};

function SupplierFormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
