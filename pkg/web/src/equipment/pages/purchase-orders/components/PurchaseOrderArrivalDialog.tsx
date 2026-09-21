import { deriveMovementWarnings } from '@pkg/domain/equipment';
import {
  PostArrivalInput,
  PurchaseOrderArrivalQuantity,
  type PurchaseOrderLineView,
  type PurchaseOrderView,
  type StockMovementWarningCode,
} from '@pkg/schema/equipment';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';

import { CreateEntityDialog } from '@/components/form/index.js';
import { useMovementWarnings } from '@/equipment/hooks/use-movement-warnings.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { StockMovementWarningPrompt } from '@/equipment/pages/inventory/components/StockMovementWarningPrompt.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { outstandingQuantity } from './types.js';

const ArrivalFormValues = z.object({
  note: z.string(),
  quantity: PurchaseOrderArrivalQuantity.refine((quantity) => quantity > 0, 'Quantity must be greater than zero'),
});
type ArrivalFormValues = z.infer<typeof ArrivalFormValues>;

export function PurchaseOrderArrivalDialog({
  line,
  onOpenChange,
  purchaseOrder,
  reverse,
}: {
  line: PurchaseOrderLineView;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrderView;
  reverse: boolean;
}) {
  const trpc = useTRPC();
  const { invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const movementWarnings = useMovementWarnings();
  const outstanding = outstandingQuantity(line);
  const mutation = useMutation(
    trpc.purchaseOrders.postArrival.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to record this arrival.'),
    }),
  );

  function previewWarnings(values: ArrivalFormValues): StockMovementWarningCode[] {
    if (reverse || !Number.isFinite(values.quantity)) return [];
    return deriveMovementWarnings({
      facts: { kind: 'receipt', orderedQuantity: line.quantity, receivedQuantity: line.receivedQuantity },
      quantity: values.quantity,
    });
  }

  return (
    <CreateEntityDialog<ArrivalFormValues, { warnings: StockMovementWarningCode[] }>
      defaultValues={{
        note: '',
        quantity: reverse ? line.receivedQuantity : outstanding > 0 ? outstanding : Number.NaN,
      }}
      disableSubmitWhenInvalid={reverse}
      description={`${line.description} — ${line.receivedQuantity} of ${line.quantity} received so far.`}
      onCreate={(values) => {
        movementWarnings.acknowledge(previewWarnings(values));
        return mutation.mutateAsync(
          PostArrivalInput.parse({
            lineId: line.id,
            note: values.note.trim() || null,
            purchaseOrderId: purchaseOrder.id,
            quantity: reverse ? -values.quantity : values.quantity,
          }),
        );
      }}
      onCreated={async (result) => {
        await invalidatePurchaseOrders();
        onOpenChange(false);
        toast.success(reverse ? 'Arrival reversed' : 'Delivery received');
        movementWarnings.reconcile(result.warnings);
      }}
      onOpenChange={onOpenChange}
      open
      submitLabel={(values) =>
        reverse ? 'Reverse arrival' : previewWarnings(values).length > 0 ? 'Receive it anyway' : 'Receive'
      }
      title={reverse ? 'Reverse arrival' : 'Receive custom line'}
      validator={
        reverse
          ? ArrivalFormValues.refine((values) => values.note.trim().length > 0, {
              message: 'Record why this arrival is being reversed',
              path: ['note'],
            }).refine((values) => values.quantity <= line.receivedQuantity, {
              message: 'Cannot reverse more than has arrived',
              path: ['quantity'],
            })
          : ArrivalFormValues
      }
    >
      {(form) => (
        <>
          <form.AppField name="quantity">
            {(field) => (
              <field.NumberField
                decimals={3}
                label={reverse ? 'Quantity to reverse' : 'Quantity received'}
                max={reverse ? line.receivedQuantity : undefined}
                min={0.001}
                step="0.001"
              />
            )}
          </form.AppField>
          <form.AppField name="note">
            {(field) => (
              <field.TextareaField
                label={reverse ? 'Why is this arrival being reversed?' : 'Note (optional)'}
                maxLength={500}
                rows={2}
              />
            )}
          </form.AppField>
          {!reverse ? (
            <form.Subscribe selector={(state) => state.values}>
              {(values) => <StockMovementWarningPrompt warnings={previewWarnings(values)} />}
            </form.Subscribe>
          ) : null}
        </>
      )}
    </CreateEntityDialog>
  );
}
