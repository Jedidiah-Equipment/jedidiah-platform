import { type Machine, ReadingComment, ReadingValue } from '@pkg/schema/contracting';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { MachineDialogTitle, machineDialogSubject } from '@/contracting/components/MachineDialogTitle.js';
import {
  ReadingCaptureDetails,
  ReadingReadAtField,
  ReadingValueCard,
} from '@/contracting/components/readings/ReadingCaptureFields.js';
import { ConfirmedDispute, useReadingCapture } from '@/contracting/components/readings/use-reading-capture.js';

const SpotValues = z.object({
  value: ReadingValue,
  comment: z.union([z.string().trim().length(0), ReadingComment]),
  confirmedDispute: ConfirmedDispute,
});
type SpotValues = z.infer<typeof SpotValues>;

/**
 * A spot Hour Reading on one Machine, captured in the office from a photo of its meter: no Assignment, no billing
 * effect, only the Machine's hours kept current. Read At says when the meter was read. Mounted while
 * the reading is being captured, so closing unmounts it.
 */
export function SpotCaptureDialog({
  machine,
  onClose,
}: {
  machine: Pick<Machine, 'id' | 'code' | 'categoryIcon' | 'categoryColour'>;
  onClose: () => void;
}) {
  const capture = useReadingCapture({ role: 'spot', machineId: machine.id }, (values: SpotValues) => ({
    ...values,
    stintOverrides: undefined,
  }));
  const { latestQuery } = capture;
  const canCapture = (values: SpotValues) => latestQuery.isSuccess && capture.judge(values).request !== null;

  return (
    <CreateEntityDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={<MachineDialogTitle machine={machineDialogSubject(machine)}>Capture hours</MachineDialogTitle>}
      contentClassName="sm:max-w-md"
      submitLabel="Capture"
      defaultValues={{ value: Number.NaN, comment: '', confirmedDispute: null }}
      validator={SpotValues}
      canSubmit={canCapture}
      disableSubmitWhenInvalid
      onBeforeCreate={canCapture}
      onCreate={async (values) => {
        await capture.submit(values);
        return true;
      }}
      onCreated={onClose}
    >
      {(form) => (
        <>
          <ErrorMessage error={latestQuery.error} fallbackMessage="Unable to load the Machine's previous reading." />
          <ReadingReadAtField capture={capture} />
          <ReadingValueCard
            form={form}
            fields={{ value: 'value', confirmedDispute: 'confirmedDispute' }}
            capture={capture}
          />
          <ReadingCaptureDetails id={`spot-photo-${machine.id}`} {...capture.details}>
            <form.AppField name="comment">
              {(field) => <field.TextareaField label="Comment (optional)" />}
            </form.AppField>
          </ReadingCaptureDetails>
        </>
      )}
    </CreateEntityDialog>
  );
}
