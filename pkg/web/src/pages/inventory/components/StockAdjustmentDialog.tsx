import { STOCK_ADJUSTMENT_REASON_LABELS, StockAdjustmentReason } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

import {
  partQuantityValidationMessage,
  partSelectOptions,
  type StockAdjustmentFormValues,
  type StockPartOption,
  stockAdjustmentValidator,
  toAdjustmentInput,
} from './types.js';

const reasonOptions = StockAdjustmentReason.options.map((value) => ({
  label: STOCK_ADJUSTMENT_REASON_LABELS[value],
  value,
}));

export function StockAdjustmentDialog({
  canReadCost,
  onOpenChange,
  open,
  parts,
}: {
  canReadCost: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parts: readonly StockPartOption[];
}) {
  const trpc = useTRPC();
  const { invalidateInventory } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const validator = useMemo(() => stockAdjustmentValidator(parts), [parts]);
  const mutation = useMutation(
    trpc.inventory.postAdjustment.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to post stock adjustment.'),
    }),
  );

  return (
    <CreateEntityDialog<StockAdjustmentFormValues, unknown>
      defaultValues={{
        delta: Number.NaN,
        lengthMm: Number.NaN,
        note: '',
        partId: '',
        reason: 'opening-balance',
        unitCost: Number.NaN,
      }}
      description="Append a signed quantity change to the Part ledger."
      onCreate={(values) => {
        const part = parts.find((candidate) => candidate.partId === values.partId);
        if (!part) throw new Error('Select a Part');

        return mutation.mutateAsync(toAdjustmentInput(values, canReadCost, part));
      }}
      onCreated={async () => {
        await invalidateInventory();
        onOpenChange(false);
        toast.success('Stock adjustment posted');
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel="Post adjustment"
      title="Post stock adjustment"
      validator={validator}
    >
      {(form) => (
        <>
          <form.AppField name="partId">
            {(field) => (
              <field.ComboboxField
                emptyMessage="No Parts found."
                label="Part"
                onValueCommit={() => {
                  // The selection commits first; defer until the form exposes the new Part to the dependent validator.
                  queueMicrotask(() => void form.validateField('delta', 'blur'));
                }}
                options={partSelectOptions(parts)}
                placeholder="Search parts"
              />
            )}
          </form.AppField>
          <form.AppField
            name="delta"
            validators={{
              onBlur: ({ value }) =>
                partQuantityValidationMessage({ partId: form.state.values.partId, quantity: value }, parts),
            }}
          >
            {(field) => (
              <field.NumberField
                description="Negative removes stock; positive adds it."
                label="Signed quantity delta"
                placeholder="10 or -2"
                step="0.001"
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values}>
            {(values) => {
              const part = parts.find((candidate) => candidate.partId === values.partId);
              const showCost =
                canReadCost && values.reason === 'opening-balance' && part?.isInternallyFabricated === false;

              return (
                <>
                  {part?.unitOfMeasure === 'mm' ? (
                    <form.AppField name="lengthMm">
                      {(field) => <field.NumberField inputMode="numeric" label="Length (mm)" min={1} step="1" />}
                    </form.AppField>
                  ) : null}
                  {showCost ? (
                    <form.AppField name="unitCost">
                      {(field) => (
                        // A linear opening balance is priced per piece, not per mm: the ledger divides
                        // this by the bucket length to reach the per-mm average.
                        <field.CurrencyField
                          label={part?.unitOfMeasure === 'mm' ? 'Opening cost per length piece' : 'Opening unit cost'}
                        />
                      )}
                    </form.AppField>
                  ) : null}
                </>
              );
            }}
          </form.Subscribe>
          <form.AppField name="reason">
            {(field) => <field.SelectField label="Reason" options={reasonOptions} />}
          </form.AppField>
          <form.AppField name="note">
            {(field) => (
              <field.TextareaField
                label="Note"
                placeholder="Required for every reason except an opening balance"
                rows={3}
              />
            )}
          </form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}
