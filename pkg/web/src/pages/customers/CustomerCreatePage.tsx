import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import type React from 'react';
import { toast } from 'sonner';

import { EditPageLayout } from '@/components/page-layout/EditPageLayout.js';
import { Button } from '@/components/ui/button.js';
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
      back={
        <Button onClick={() => navigate({ to: '/customers' })} type="button" variant="ghost">
          <ArrowLeftIcon data-icon="inline-start" />
          Customers
        </Button>
      }
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
