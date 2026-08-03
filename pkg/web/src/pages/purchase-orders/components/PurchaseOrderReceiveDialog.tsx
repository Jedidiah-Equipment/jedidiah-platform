import { deriveReceiptWarnings } from '@pkg/domain';
import type { PurchaseOrderLineView, PurchaseOrderView, StockMovementWarningCode } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import {
  StockMovementWarningPrompt,
  warningMessageFor,
} from '../../inventory/components/StockMovementWarningPrompt.js';
import {
  isLinearLine,
  outstandingQuantity,
  type PurchaseOrderReceiveFormValues,
  PurchaseOrderReceiveFormValues as PurchaseOrderReceiveFormValuesSchema,
  toReceiptInput,
} from './types.js';

/**
 * Confirms one delivery at the dock. Quantities only — the price rides in from the PO line, and a
 * correction is a cost-gated desk-side action, so a price-blind receiver never sees a money field.
 */
export function PurchaseOrderReceiveDialog({
  line,
  onOpenChange,
  open,
  purchaseOrder,
}: {
  line: PurchaseOrderLineView;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  purchaseOrder: PurchaseOrderView;
}) {
  const trpc = useTRPC();
  const { invalidateInventory, invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const acknowledgedWarnings = useRef<readonly StockMovementWarningCode[]>([]);
  const outstanding = outstandingQuantity(line);

  const mutation = useMutation(
    trpc.purchaseOrders.receive.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to receive this delivery.'),
    }),
  );

  /** The same judgement the ledger applies on post, so the dock sees it before committing. */
  function receiptWarnings(values: PurchaseOrderReceiveFormValues): StockMovementWarningCode[] {
    if (!Number.isFinite(values.quantity)) return [];

    return deriveReceiptWarnings({
      orderedQuantity: line.quantity,
      quantity: values.quantity,
      receivedQuantity: line.receivedQuantity,
    });
  }

  return (
    <CreateEntityDialog<PurchaseOrderReceiveFormValues, { warnings: StockMovementWarningCode[] }>
      defaultValues={{ lengthMm: Number.NaN, quantity: outstanding > 0 ? outstanding : Number.NaN }}
      description={`${line.partCode} · ${line.partName} — ${line.receivedQuantity} of ${line.quantity} received so far.`}
      onCreate={(values) => {
        acknowledgedWarnings.current = receiptWarnings(values);

        return mutation.mutateAsync(toReceiptInput({ line, purchaseOrderId: purchaseOrder.id, values }));
      }}
      onCreated={async (result) => {
        await Promise.all([invalidatePurchaseOrders(), invalidateInventory()]);
        onOpenChange(false);
        toast.success('Delivery received');
        for (const warning of result.warnings) {
          if (!acknowledgedWarnings.current.includes(warning)) toast.warning(warningMessageFor(warning));
        }
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel={(values) => (receiptWarnings(values).length > 0 ? 'Receive anyway' : 'Receive')}
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
          <form.Subscribe selector={(state) => state.values}>
            {(values) => <StockMovementWarningPrompt warnings={receiptWarnings(values)} />}
          </form.Subscribe>
        </>
      )}
    </CreateEntityDialog>
  );
}
