import { deriveMovementWarnings } from '@pkg/domain';
import type { PurchaseOrderLineView, PurchaseOrderView, StockMovementWarningCode } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { useMovementWarnings } from '@/equipment/hooks/use-movement-warnings.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { StockMovementWarningPrompt } from '../../inventory/components/StockMovementWarningPrompt.js';
import {
  isLinearLine,
  outstandingQuantity,
  type PurchaseOrderReceiveFormValues,
  PurchaseOrderReceiveFormValues as PurchaseOrderReceiveFormValuesSchema,
  toReceiptInput,
} from './types.js';

/**
 * Confirms one delivery at the dock. The price rides in from the PO line unless a cost-authorized
 * receiver corrects it; a price-blind receiver never sees or submits a money field.
 */
export function PurchaseOrderReceiveDialog({
  canReadCosts,
  line,
  onOpenChange,
  open,
  purchaseOrder,
}: {
  canReadCosts: boolean;
  line: PurchaseOrderLineView;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  purchaseOrder: PurchaseOrderView;
}) {
  const trpc = useTRPC();
  const { invalidateInventory, invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const movementWarnings = useMovementWarnings();
  const outstanding = outstandingQuantity(line);

  const mutation = useMutation(
    trpc.purchaseOrders.receive.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to receive this delivery.'),
    }),
  );

  /** The same judgement the ledger applies on post, so the dock sees it before committing. */
  function receiptWarnings(values: PurchaseOrderReceiveFormValues): StockMovementWarningCode[] {
    if (!Number.isFinite(values.quantity)) return [];

    return deriveMovementWarnings({
      facts: { kind: 'receipt', orderedQuantity: line.quantity, receivedQuantity: line.receivedQuantity },
      quantity: values.quantity,
    });
  }

  return (
    <CreateEntityDialog<PurchaseOrderReceiveFormValues, { warnings: StockMovementWarningCode[] }>
      defaultValues={{
        lengthMm: Number.NaN,
        quantity: outstanding > 0 ? outstanding : Number.NaN,
        unitCost: Number.NaN,
      }}
      description={`${line.partCode} · ${line.partName} — ${line.receivedQuantity} of ${line.quantity} received so far.`}
      onCreate={(values) => {
        movementWarnings.acknowledge(receiptWarnings(values));

        return mutation.mutateAsync(toReceiptInput({ canReadCosts, line, purchaseOrderId: purchaseOrder.id, values }));
      }}
      onCreated={async (result) => {
        await Promise.all([invalidatePurchaseOrders(), invalidateInventory()]);
        onOpenChange(false);
        toast.success('Delivery received');
        movementWarnings.reconcile(result.warnings);
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel={(values) => (receiptWarnings(values).length > 0 ? 'Receive it anyway' : 'Receive')}
      title="Receive delivery"
      validator={PurchaseOrderReceiveFormValuesSchema}
    >
      {(form) => (
        <>
          <form.AppField name="quantity">
            {(field) => <field.NumberField label="Quantity received" min={0.001} step="0.001" />}
          </form.AppField>
          {isLinearLine(line) ? (
            <form.AppField name="lengthMm">
              {(field) => (
                <field.NumberField
                  description={
                    line.standardPurchaseLengthMm === null
                      ? 'Leave blank unless the pieces came in a different length.'
                      : `Leave blank for the standard ${line.standardPurchaseLengthMm} mm length.`
                  }
                  inputMode="numeric"
                  label="Length (mm)"
                  min={1}
                  step="1"
                />
              )}
            </form.AppField>
          ) : null}
          {canReadCosts ? (
            <form.AppField name="unitCost">
              {(field) => (
                <field.CurrencyField
                  description="Cost per unit; leave blank to use the Purchase Order price."
                  label="Unit cost override"
                />
              )}
            </form.AppField>
          ) : null}
          <form.Subscribe selector={(state) => state.values}>
            {(values) => <StockMovementWarningPrompt warnings={receiptWarnings(values)} />}
          </form.Subscribe>
        </>
      )}
    </CreateEntityDialog>
  );
}
