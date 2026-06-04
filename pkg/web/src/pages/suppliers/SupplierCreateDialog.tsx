import type { Supplier } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { SupplierCreateFormValues, toSupplierMinimalCreateInput } from './components/types.js';

type SupplierCreateDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const SUPPLIER_CREATE_DEFAULT_VALUES: SupplierCreateFormValues = {
  companyName: '',
};

export const SupplierCreateDialog: React.FC<SupplierCreateDialogProps> = ({ onOpenChange, open }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateSuppliers } = useQueryInvalidation();

  const showMutationError = useApiMutationErrorToast();

  const createSupplierMutation = useMutation(
    trpc.suppliers.create.mutationOptions({
      onError: (error) => {
        showMutationError(error, 'Unable to create supplier.');
      },
    }),
  );

  return (
    <CreateEntityDialog
      defaultValues={SUPPLIER_CREATE_DEFAULT_VALUES}
      key={open ? 'open' : 'closed'}
      onCreate={(values) => createSupplierMutation.mutateAsync(toSupplierMinimalCreateInput(values))}
      onCreated={async (supplier: Supplier) => {
        await invalidateSuppliers();
        onOpenChange(false);
        toast.success('Supplier created');
        await navigate({ to: '/suppliers/$id/edit', params: { id: supplier.id } });
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel="Save"
      title="New supplier"
      validator={SupplierCreateFormValues}
    >
      {(form) => (
        <form.AppField name="companyName">
          {(field) => <field.TextField autoComplete="organization" label="Company name" />}
        </form.AppField>
      )}
    </CreateEntityDialog>
  );
};
