import { formatDate, getPlantDateNow } from '@pkg/domain';
import { type HourReading, type ReadingAmendInput, ReadingAmendment, ReadingReason } from '@pkg/schema/contracting';
import type React from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { type MachineDialogSubject, MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import {
  ReadingCaptureCard,
  ReadingCaptureRow,
  ReadingValueField,
} from '@/contracting/components/readings/ReadingCaptureFields.js';
import {
  CorrectedReadAt,
  correctedCapturedAt,
  recordedReadAtValue,
} from '@/contracting/components/readings/read-at-correction.js';

const AmendValues = ReadingAmendment.pick({ value: true }).extend({ readAt: CorrectedReadAt, reason: ReadingReason });

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
  const recordedReadAt = reading ? recordedReadAtValue(reading.capturedAt) : '';
  return (
    <CreateEntityDialog
      key={reading?.id ?? 'closed'}
      open={open && !!reading}
      onOpenChange={onOpenChange}
      title={<MachineDialogTitle machine={machine}>Amend reading</MachineDialogTitle>}
      description={description}
      contentClassName="sm:max-w-lg"
      submitLabel="Amend reading"
      defaultValues={{ value: reading?.value ?? 0, readAt: recordedReadAt, reason: '' }}
      validator={AmendValues}
      onCreate={({ value, readAt, reason }) => {
        if (!reading) return Promise.resolve();
        return onAmend({
          amendments: [{ id: reading.id, value, capturedAt: correctedCapturedAt(readAt, reading.capturedAt) }],
          reason,
        });
      }}
      onCreated={onAmended}
    >
      {(form) => (
        <>
          <ReadingCaptureCard
            previousLabel="Recorded reading"
            previousValue={reading?.value}
            rows={
              <ReadingCaptureRow
                label="Recorded Read At"
                recorded={<span className="text-sm">{reading ? formatDate(reading.capturedAt, 'medium') : '—'}</span>}
              >
                <form.AppField name="readAt">
                  {(field) => <field.DateTimePickerField label="Corrected Read At" maxValue={getPlantDateNow()} />}
                </form.AppField>
              </ReadingCaptureRow>
            }
          >
            <form.AppField name="value">{() => <ReadingValueField label="Corrected reading" />}</form.AppField>
          </ReadingCaptureCard>
          <div className="space-y-4 border-t pt-4">
            <form.AppField name="reason">{(field) => <field.TextareaField label="Amendment reason" />}</form.AppField>
            <ErrorMessage error={error} fallbackMessage="Unable to amend reading." />
          </div>
        </>
      )}
    </CreateEntityDialog>
  );
}
