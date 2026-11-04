import { getPlantDateNow } from '@pkg/domain';
import { readAtFromPicker, readAtInputValue } from '@pkg/domain/contracting';
import { ReadingValue } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { localDateTimeValue } from '@/components/form/utils/form-schema.js';
import { useContractingWrite, useResetOnOpen } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

const SpotReadingValues = z.object({
  hours: ReadingValue,
  readAt: localDateTimeValue.refine((value) => value !== '', 'Enter when the meter was read'),
});
type SpotReadingValues = z.infer<typeof SpotReadingValues>;

/** The spot reading a History row opens: its hours and Read At. */
export type SpotReading = { id: string; at: string; value: number };

/**
 * Amends a spot reading's hours or Read At, or deletes it; the server judges the correction at its new place in time
 * and its sentence shows on a refusal.
 */
export function SpotReadingDialog({ reading, onClose }: { reading: SpotReading | null; onClose: () => void }) {
  const trpc = useTRPC();
  const { invalidateReadings } = useQueryInvalidation();
  const write = useContractingWrite(invalidateReadings);
  const amend = useMutation(trpc.contractingReadings.amend.mutationOptions(write.dialog));
  const remove = useMutation(trpc.contractingReadings.remove.mutationOptions(write.dialog));
  useResetOnOpen(amend, !!reading);
  useResetOnOpen(remove, !!reading);
  const readAt = reading ? new Date(reading.at) : null;
  return (
    <CreateEntityDialog
      key={reading?.id ?? 'closed'}
      open={!!reading}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Amend reading"
      contentClassName="sm:max-w-md"
      submitLabel="Save reading"
      defaultValues={{
        hours: reading?.value ?? Number.NaN,
        readAt: readAt ? readAtInputValue(readAt) : '',
      }}
      validator={SpotReadingValues}
      onCreate={async (values: SpotReadingValues) => {
        const capturedAt = readAtFromPicker(values.readAt, readAt);
        if (!reading || !capturedAt) return;
        await amend.mutateAsync({ id: reading.id, value: values.hours, capturedAt: capturedAt.toISOString() });
      }}
      onCreated={onClose}
    >
      {(form) => (
        <>
          <form.AppField name="hours">
            {(field) => <field.NumberField label="Hours on the meter" decimals={1} min={0} unit="hours" />}
          </form.AppField>
          <form.AppField name="readAt">
            {(field) => <field.DateTimePickerField label="Read At" maxValue={getPlantDateNow()} />}
          </form.AppField>
          <ErrorMessage error={amend.error} fallbackMessage="Unable to save the reading." />
          <ErrorMessage error={remove.error} fallbackMessage="Unable to delete the reading." />
          {reading ? (
            <div>
              <RemoveEntityButton
                title="Delete reading"
                triggerLabel="Delete reading"
                triggerSize="sm"
                triggerVariant="outline"
                confirmLabel="Delete"
                description="Take this reading off the Machine's ledger. The Audit Log keeps what it said."
                isPending={remove.isPending}
                onConfirm={() => remove.mutate({ id: reading.id }, { onSuccess: onClose })}
              />
            </div>
          ) : null}
        </>
      )}
    </CreateEntityDialog>
  );
}
