import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { useCustomerMatchChoice } from '@/equipment/components/customers/use-customer-match-choice.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
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
  const { choose, dialog } = useCustomerMatchChoice(open);
  const navigate = useNavigate();
  const { invalidateCustomers } = useQueryInvalidation();

  const showMutationError = useApiMutationErrorToast();

  const createCustomerMutation = useMutation(
    trpc.customers.create.mutationOptions({
      onError: (error) => {
        showMutationError(error, 'Unable to create customer.');
      },
    }),
  );

  return (
    <>
      {dialog}
      <CreateEntityDialog
        defaultValues={CUSTOMER_CREATE_DEFAULT_VALUES}
        onCreate={async (values) => {
          const choice = await choose(values.companyName);
          if (!choice) return null;
          if (typeof choice !== 'string') return { id: choice.id, created: false };
          const customer = await createCustomerMutation.mutateAsync({
            ...toCustomerMinimalCreateInput(values),
            allowPossibleMatch: choice === 'create',
          });
          return { id: customer.id, created: true };
        }}
        onCreated={async (customer: { id: string; created: boolean } | null) => {
          if (!customer) return;
          await invalidateCustomers();
          onOpenChange(false);
          if (customer.created) toast.success('Customer created');
          await navigate({ to: '/equipment/customers/$id/edit', params: { id: customer.id } });
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
    </>
  );
};
