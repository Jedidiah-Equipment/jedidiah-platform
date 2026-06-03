import type { Customer } from '@pkg/schema';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { CustomerCreateFormValues, toCustomerMinimalCreateInput } from './components/types.js';

type CustomerCreateDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const CUSTOMER_CREATE_DEFAULT_VALUES: CustomerCreateFormValues = {
  companyName: '',
};

export const CustomerCreateDialog: React.FC<CustomerCreateDialogProps> = ({ onOpenChange, open }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const showMutationError = useApiMutationErrorToast();

  const createCustomerMutation = useMutation(
    trpc.customers.create.mutationOptions({
      onError: (error) => {
        showMutationError(error, 'Unable to create customer.');
      },
    }),
  );

  return (
    <CreateEntityDialog
      defaultValues={CUSTOMER_CREATE_DEFAULT_VALUES}
      key={open ? 'open' : 'closed'}
      onCreate={(values) => createCustomerMutation.mutateAsync(toCustomerMinimalCreateInput(values))}
      onCreated={async (customer: Customer) => {
        await queryClient.invalidateQueries(trpc.customers.list.queryFilter());
        onOpenChange(false);
        toast.success('Customer created');
        await navigate({ to: '/customers/$id/edit', params: { id: customer.id } });
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel="Save"
      title="New customer"
      validator={CustomerCreateFormValues}
    >
      {(form) => (
        <form.AppField name="companyName">
          {(field) => <field.TextField autoComplete="organization" label="Company name" />}
        </form.AppField>
      )}
    </CreateEntityDialog>
  );
};
