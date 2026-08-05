import { deriveReturnToSupplierWarnings } from '@pkg/domain';
import {
  type PurchaseOrderLineView,
  type PurchaseOrderView,
  STOCK_RETURN_TO_SUPPLIER_REASON_LABELS,
  type StockMovementWarningCode,
  StockReturnToSupplierReason,
} from '@pkg/schema';
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
  confirmMovementWarnings,
  isLinearLine,
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
  outstandingReceived,
  purchaseOrder,
}: {
  line: PurchaseOrderLineView;
  onOpenChange: (open: boolean) => void;
  /** Received on this line less what has already gone back; over it warns but still posts. */
  outstandingReceived: number;
  purchaseOrder: PurchaseOrderView;
}) {
  const trpc = useTRPC();
  const { invalidateInventory, invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const acknowledgedWarnings = useRef<readonly StockMovementWarningCode[]>([]);
  const mutation = useMutation(
    trpc.purchaseOrders.returnToSupplier.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to return this stock.'),
    }),
  );

  /** The same judgement the ledger applies on post, so the dock sees it before committing. */
  function returnWarnings(values: PurchaseOrderReturnFormValues): StockMovementWarningCode[] {
    if (!Number.isFinite(values.quantity)) return [];

    return deriveReturnToSupplierWarnings({
      outstandingReceivedQuantity: outstandingReceived,
      quantity: values.quantity,
    });
  }

  return (
    <CreateEntityDialog<PurchaseOrderReturnFormValues, { warnings: StockMovementWarningCode[] }>
      defaultValues={{
        lengthMm: Number.NaN,
        note: '',
        quantity: outstandingReceived > 0 ? outstandingReceived : Number.NaN,
        reason: 'defective',
      }}
      description={`${line.partCode} · ${line.partName} — ${outstandingReceived} received and not yet returned.`}
      onBeforeCreate={(values) =>
        confirmMovementWarnings({
          action: 'Post it anyway?',
          confirm: (message) => window.confirm(message),
          messageFor: warningMessageFor,
          warnings: returnWarnings(values),
        })
      }
      onCreate={(values) => {
        acknowledgedWarnings.current = returnWarnings(values);

        return mutation.mutateAsync(toReturnToSupplierInput({ line, purchaseOrderId: purchaseOrder.id, values }));
      }}
      onCreated={async (result) => {
        await Promise.all([invalidatePurchaseOrders(), invalidateInventory()]);
        onOpenChange(false);
        toast.success('Return to Supplier posted');
        for (const warning of result.warnings) {
          if (!acknowledgedWarnings.current.includes(warning)) toast.warning(warningMessageFor(warning));
        }
      }}
      onOpenChange={onOpenChange}
      open
      submitLabel="Post return"
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
            {(values) => <StockMovementWarningPrompt warnings={returnWarnings(values)} />}
          </form.Subscribe>
        </>
      )}
    </CreateEntityDialog>
  );
}
