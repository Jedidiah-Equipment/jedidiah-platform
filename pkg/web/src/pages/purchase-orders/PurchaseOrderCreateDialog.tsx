import type { PurchaseOrderView } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { useSupplierOptions } from '@/hooks/options/index.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { PurchaseOrderCreateFormValues, toPurchaseOrderCreateInput } from './components/types.js';

type PurchaseOrderCreateDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const defaultValues: PurchaseOrderCreateFormValues = {
  expectedDeliveryDate: '',
  supplierId: '',
};

export const PurchaseOrderCreateDialog: React.FC<PurchaseOrderCreateDialogProps> = ({ onOpenChange, open }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const suppliers = useSupplierOptions({ limit: 0 });
  const { invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const createMutation = useMutation(
    trpc.purchaseOrders.create.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to create Purchase Order.'),
    }),
  );

  return (
    <CreateEntityDialog
      defaultValues={defaultValues}
      key={open ? 'open' : 'closed'}
      onCreate={(values) => createMutation.mutateAsync(toPurchaseOrderCreateInput(values))}
      onCreated={async (purchaseOrder: PurchaseOrderView) => {
        await invalidatePurchaseOrders();
        onOpenChange(false);
        toast.success(`${purchaseOrder.code} created`);
        await navigate({ params: { id: purchaseOrder.id }, to: '/purchase-orders/$id' });
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel="Create draft"
      title="New Purchase Order"
      validator={PurchaseOrderCreateFormValues}
    >
      {(form) => (
        <>
          <form.AppField name="supplierId">
            {(field) => (
              <field.SelectField
                disabled={suppliers.isPending}
                label="Supplier"
                options={suppliers.selectOptions}
                placeholder="Select a supplier"
              />
            )}
          </form.AppField>
          <form.AppField name="expectedDeliveryDate">
            {(field) => <field.DatePickerField label="Expected delivery date" placeholder="Optional" />}
          </form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
};
