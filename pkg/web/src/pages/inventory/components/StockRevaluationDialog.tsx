import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

import {
  partSelectOptions,
  type StockPartOption,
  type StockRevaluationFormValues,
  StockRevaluationFormValues as StockRevaluationFormValuesSchema,
  toRevaluationInput,
} from './types.js';

export function StockRevaluationDialog({
  onOpenChange,
  open,
  parts,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parts: readonly StockPartOption[];
}) {
  const trpc = useTRPC();
  const { invalidateInventory } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const mutation = useMutation(
    trpc.inventory.postRevaluation.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to revalue the Part.'),
    }),
  );

  return (
    <CreateEntityDialog<StockRevaluationFormValues, unknown>
      defaultValues={{ note: '', partId: '', unitCost: Number.NaN }}
      description="Set the Part's moving average with a zero-quantity ledger row."
      onCreate={(values) => mutation.mutateAsync(toRevaluationInput(values))}
      onCreated={async () => {
        await invalidateInventory();
        onOpenChange(false);
        toast.success('Part revalued');
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel="Post revaluation"
      title="Revalue Part"
      validator={StockRevaluationFormValuesSchema}
    >
      {(form) => (
        <>
          <form.AppField name="partId">
            {(field) => <field.SelectField label="Part" options={partSelectOptions(parts)} placeholder="Select Part" />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.partId}>
            {(partId) => (
              <form.AppField name="unitCost">
                {(field) => (
                  <field.CurrencyField
                    label={
                      parts.find((part) => part.partId === partId)?.unitOfMeasure === 'mm'
                        ? 'New cost per mm'
                        : 'New unit cost'
                    }
                  />
                )}
              </form.AppField>
            )}
          </form.Subscribe>
          <form.AppField name="note">
            {(field) => <field.TextareaField label="Note (optional)" rows={3} />}
          </form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}
