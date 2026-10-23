import { captureRefusals, readAtFromInput, readAtInputValue } from '@pkg/domain/contracting';
import { type Machine, ReadingComment, ReadingValue } from '@pkg/schema/contracting';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { ReadingCaptureDetails, ReadingValueCard } from '@/contracting/pages/jobs/ReadingCaptureFields.js';
import { ConfirmedDispute, useReadingCapture } from '@/contracting/pages/jobs/use-reading-capture.js';

const SpotValues = z.object({
  value: ReadingValue,
  comment: z.union([z.string().trim().length(0), ReadingComment]),
  confirmedDispute: ConfirmedDispute,
  readAt: z.string(),
});
type SpotValues = z.infer<typeof SpotValues>;

/**
 * A spot Hour Reading on the Machine itself, captured in the office from a photo of its meter: no Assignment, no
 * billing effect, only the Machine's hours kept current. Read At says when the meter was read; blank is now.
 */
export function SpotCaptureDialog({
  machine,
  open,
  onOpenChange,
}: {
  machine: Pick<Machine, 'id' | 'code' | 'categoryIcon' | 'categoryColour'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const capture = useReadingCapture({ role: 'spot', machineId: open ? machine.id : null });
  const { latestQuery } = capture;
  const captureValues = (values: SpotValues) => ({ ...values, readAt: readAtFromInput(values.readAt) });
  const judge = (values: SpotValues) => capture.judge(captureValues(values));
  const canCapture = (values: SpotValues) => latestQuery.isSuccess && judge(values).request !== null;
  const close = () => {
    capture.reset();
    onOpenChange(false);
  };

  return (
    <CreateEntityDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={
        <MachineDialogTitle machine={{ ...machine, machineCode: machine.code }}>Capture reading</MachineDialogTitle>
      }
      contentClassName="sm:max-w-md"
      submitLabel="Capture"
      defaultValues={{ value: Number.NaN, comment: '', confirmedDispute: null, readAt: '' }}
      validator={SpotValues}
      canSubmit={canCapture}
      disableSubmitWhenInvalid
      onBeforeCreate={canCapture}
      onCreate={async (values) => {
        await capture.submit(captureValues(values));
        return true;
      }}
      onCreated={close}
    >
      {(form) => (
        <>
          <ErrorMessage error={latestQuery.error} fallbackMessage="Unable to load the Machine's previous reading." />
          <ReadingValueCard
            form={form}
            fields={{ value: 'value', confirmedDispute: 'confirmedDispute' }}
            capture={capture}
          />
          <form.AppField name="readAt">
            {(field) => (
              <field.TextField
                label="Read At"
                type="datetime-local"
                max={readAtInputValue(new Date())}
                description="When the meter was read. Leave blank to use the current time."
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(state) => judge(state.values).futureReadAt}>
            {(futureReadAt) =>
              futureReadAt ? (
                <p className="text-sm text-destructive" role="alert">
                  {captureRefusals['future-read-at'].message}
                </p>
              ) : null
            }
          </form.Subscribe>
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
