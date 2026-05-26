import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { toast } from 'sonner';

import { BackButton } from '@/components/button/BackButton.js';
import { EditPageLayout } from '@/components/page-layout/EditPageLayout.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { SupplierForm } from './components/SupplierForm.js';

export const SupplierCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();
  const createSupplierMutation = useMutation(
    trpc.suppliers.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.suppliers.list.queryFilter());
        toast.success('Supplier created');
        await navigate({ to: '/suppliers' });
      },
      onError: (error) => {
        showMutationError(error, 'Unable to create supplier.');
      },
    }),
  );

  return (
    <EditPageLayout
      back={<BackButton to="/suppliers">Suppliers</BackButton>}
      description="Procurement"
      title="New supplier"
    >
      <SupplierForm
        isPending={createSupplierMutation.isPending}
        onSubmit={(value) => createSupplierMutation.mutateAsync(value)}
        submitLabel="Create supplier"
      />
    </EditPageLayout>
  );
};
