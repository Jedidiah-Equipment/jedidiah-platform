import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { toast } from 'sonner';

import { BackButton } from '@/components/BackButton.js';
import { EditPageLayout } from '@/components/page-layout/EditPageLayout.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { CustomerForm } from './components/CustomerForm.js';

export const CustomerCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();
  const createCustomerMutation = useMutation(
    trpc.customers.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.customers.list.queryFilter());
        toast.success('Customer created');
        await navigate({ to: '/customers' });
      },
      onError: (error) => {
        showMutationError(error, 'Unable to create customer.');
      },
    }),
  );

  return (
    <EditPageLayout
      back={<BackButton to="/customers">Customers</BackButton>}
      description="Directory"
      title="New customer"
    >
      <CustomerForm
        isPending={createCustomerMutation.isPending}
        onSubmit={(value) => createCustomerMutation.mutateAsync(value)}
        submitLabel="Create customer"
      />
    </EditPageLayout>
  );
};
