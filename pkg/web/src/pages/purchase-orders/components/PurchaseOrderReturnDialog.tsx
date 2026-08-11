import { deriveMovementWarnings } from '@pkg/domain';
import {
  type PurchaseOrderLineView,
  type PurchaseOrderView,
  STOCK_RETURN_TO_SUPPLIER_REASON_LABELS,
  type StockMovementWarningCode,
  StockReturnToSupplierReason,
} from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useMovementWarnings } from '@/hooks/use-movement-warnings.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { StockMovementWarningPrompt } from '../../inventory/components/StockMovementWarningPrompt.js';
import {
  isLinearLine,
  outstandingReceivedForLength,
  type PurchaseOrderReturnFormValues,
  PurchaseOrderReturnFormValues as PurchaseOrderReturnFormValuesSchema,
  toReturnToSupplierInput,
} from './types.js';

/**
 * Sends stock back off one received line. The value is never keyed here — the ledger reverses at the
 * cost the line was received at (spec §4) — so the dock only says how much is going, and why.
 */
export function PurchaseOrderReturnDialog({
  line,
  onOpenChange,
  purchaseOrder,
}: {
  line: PurchaseOrderLineView;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrderView;
}) {
  const trpc = useTRPC();
  const { invalidateInventory, invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const movementWarnings = useMovementWarnings();
  const mutation = useMutation(
    trpc.purchaseOrders.returnToSupplier.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to return this stock.'),
    }),
  );

  /** The same judgement the ledger applies on post, so the dock sees it before committing. */
  function returnWarnings(values: PurchaseOrderReturnFormValues): StockMovementWarningCode[] {
    if (!Number.isFinite(values.quantity)) return [];

    return deriveMovementWarnings({
      facts: {
        kind: 'return-to-supplier',
        outstandingReceivedQuantity: outstandingReceivedForLength({
          lengthMm: Number.isNaN(values.lengthMm) ? null : values.lengthMm,
          line,
        }),
      },
      quantity: values.quantity,
    });
  }

  // The line's own total, which is what the Returns card offered a return against. What one length
  // still holds is bucket-scoped and follows the keyed length, so it is shown live below instead.
  const lineOutstanding = line.receiptBuckets.reduce((total, bucket) => total + bucket.outstandingReceivedQuantity, 0);
  const standardLengthOutstanding = outstandingReceivedForLength({ lengthMm: null, line });

  return (
    <CreateEntityDialog<PurchaseOrderReturnFormValues, { warnings: StockMovementWarningCode[] }>
      defaultValues={{
        lengthMm: Number.NaN,
        note: '',
        quantity: standardLengthOutstanding > 0 ? standardLengthOutstanding : Number.NaN,
        reason: 'defective',
      }}
      description={`${line.partCode} · ${line.partName} — ${lineOutstanding} received and not yet returned.`}
      onCreate={(values) => {
        movementWarnings.acknowledge(returnWarnings(values));

        return mutation.mutateAsync(toReturnToSupplierInput({ line, purchaseOrderId: purchaseOrder.id, values }));
      }}
      onCreated={async (result) => {
        await Promise.all([invalidatePurchaseOrders(), invalidateInventory()]);
        onOpenChange(false);
        toast.success('Return to Supplier posted');
        movementWarnings.reconcile(result.warnings);
      }}
      onOpenChange={onOpenChange}
      open
      submitLabel={(values) => (returnWarnings(values).length > 0 ? 'Post it anyway' : 'Post return')}
      title="Return to Supplier"
      validator={PurchaseOrderReturnFormValuesSchema}
    >
      {(form) => (
        <>
          <form.AppField name="quantity">
            {(field) => <field.NumberField label="Quantity returned" min={0.001} step="0.001" />}
          </form.AppField>
          <form.AppField name="reason">
            {(field) => (
              <field.SelectField
                label="Reason"
                options={StockReturnToSupplierReason.options.map((reason) => ({
                  label: STOCK_RETURN_TO_SUPPLIER_REASON_LABELS[reason],
                  value: reason,
                }))}
              />
            )}
          </form.AppField>
          {isLinearLine(line) ? (
            <form.AppField name="lengthMm">
              {(field) => (
                <field.NumberField
                  description={
                    line.standardPurchaseLengthMm === null
                      ? 'Leave blank unless the pieces going back are a different length.'
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
          <form.AppField name="note">
            {(field) => (
              <field.TextareaField label="Note" placeholder="Optional — what the Supplier was told." rows={2} />
            )}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values}>
            {(values) => (
              <>
                {isLinearLine(line) ? (
                  <p className="text-muted-foreground text-sm">
                    {`This length has ${outstandingReceivedForLength({
                      lengthMm: Number.isNaN(values.lengthMm) ? null : values.lengthMm,
                      line,
                    })} received and not yet returned.`}
                  </p>
                ) : null}
                <StockMovementWarningPrompt warnings={returnWarnings(values)} />
              </>
            )}
          </form.Subscribe>
        </>
      )}
    </CreateEntityDialog>
  );
}
