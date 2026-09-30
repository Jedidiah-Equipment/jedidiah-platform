import { type HourReading, ReadingAmendInput } from '@pkg/schema/contracting';
import type React from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { type MachineDialogSubject, MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { ReadingCaptureCard, ReadingValueField } from './ReadingCaptureFields.js';

const AmendValues = ReadingAmendInput.omit({ id: true });

export function ReadingAmendDialog({
  reading,
  machine,
  open,
  onOpenChange,
  onAmend,
  onAmended,
  error,
  description = 'Hours and gaps recompute from the amended value.',
}: {
  reading: Pick<HourReading, 'id' | 'value'> | null;
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
      contentClassName="sm:max-w-md"
      submitLabel="Amend reading"
      defaultValues={{ value: reading?.value ?? 0, reason: '' }}
      validator={AmendValues}
      onCreate={(values) => onAmend(ReadingAmendInput.parse({ id: reading?.id, ...values }))}
      onCreated={onAmended}
    >
      {(form) => (
        <>
          <ReadingCaptureCard previousLabel="Recorded reading" previousValue={reading?.value}>
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
