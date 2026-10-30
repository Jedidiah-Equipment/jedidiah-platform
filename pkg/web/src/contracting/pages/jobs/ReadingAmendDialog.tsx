import { type HourReading, type ReadingAmendInput, ReadingReason } from '@pkg/schema/contracting';
import type React from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { type MachineDialogSubject, MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { ReadingCorrectionFields } from '@/contracting/components/readings/ReadingCaptureFields.js';
import { ReadingCorrection, recordedCorrection, toAmendment } from '@/contracting/components/readings/types.js';

const AmendValues = ReadingCorrection.extend({ reason: ReadingReason });

export function ReadingAmendDialog({
  reading,
  machine,
  open,
  onOpenChange,
  onAmend,
  onAmended,
  error,
  description = 'Hours and gaps recompute from the amended value and time.',
}: {
  reading: Pick<HourReading, 'id' | 'value' | 'capturedAt'> | null;
  machine: MachineDialogSubject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAmend: (input: ReadingAmendInput) => Promise<unknown>;
  onAmended: () => void;
  error: unknown;
  description?: React.ReactNode;
}) {
  return (
    <CreateEntityDialog
      key={reading?.id ?? 'closed'}
      open={open && !!reading}
      onOpenChange={onOpenChange}
      title={<MachineDialogTitle machine={machine}>Amend reading</MachineDialogTitle>}
      description={description}
      contentClassName="sm:max-w-lg"
      submitLabel="Amend reading"
      defaultValues={{ ...(reading ? recordedCorrection(reading) : { value: 0, readAt: '' }), reason: '' }}
      validator={AmendValues}
      // An untouched correction still posts: on the Job page it acknowledges the reading's evidence.
      onCreate={({ value, readAt, reason }) =>
        reading
          ? onAmend({ amendments: [toAmendment({ id: reading.id, value, readAt }, reading)], reason })
          : Promise.resolve()
      }
      onCreated={onAmended}
    >
      {(form) => (
        <>
          <ReadingCorrectionFields form={form} fields={{ value: 'value', readAt: 'readAt' }} recorded={reading} />
          <div className="space-y-4 border-t pt-4">
            <form.AppField name="reason">{(field) => <field.TextareaField label="Amendment reason" />}</form.AppField>
            <ErrorMessage error={error} fallbackMessage="Unable to amend reading." />
          </div>
        </>
      )}
    </CreateEntityDialog>
  );
}
