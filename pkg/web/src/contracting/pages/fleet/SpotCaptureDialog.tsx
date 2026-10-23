import { captureRefusals } from '@pkg/domain/contracting';
import { type Machine, ReadingComment, ReadingValue } from '@pkg/schema/contracting';
import { useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import {
  DisputeField,
  ReadingCaptureCard,
  ReadingCaptureDetails,
  ReadingValueField,
} from '@/contracting/pages/jobs/ReadingCaptureFields.js';
import { ConfirmedDispute, useReadingCapture } from '@/contracting/pages/jobs/use-reading-capture.js';
import { readAtFromInput, readAtInputValue } from './types.js';

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
  const [readingFocused, setReadingFocused] = useState(false);
  const { latestQuery, latest } = capture;
  const judge = (values: SpotValues) => capture.judge({ ...values, readAt: readAtFromInput(values.readAt) });
  const canCapture = (values: SpotValues) => latestQuery.isSuccess && judge(values).request !== null;
  const close = () => {
    capture.reset();
    setReadingFocused(false);
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
        const { request } = judge(values);
        if (!request) throw new Error('This reading cannot be captured yet.');
        await capture.submit(request, readAtFromInput(values.readAt));
        return true;
      }}
      onCreated={close}
    >
      {(form) => (
        <>
          <ErrorMessage error={latestQuery.error} fallbackMessage="Unable to load the Machine's previous reading." />
          <ReadingCaptureCard
            previousValue={latest === undefined ? undefined : (latest?.value ?? null)}
            loading={latestQuery.isPending}
            warning={
              <form.Subscribe selector={(state) => state.values}>
                {(values) => {
                  const verdict = judge(values);
                  return !readingFocused && latest && verdict.below ? (
                    <form.AppField name="confirmedDispute">
                      {(field) => (
                        <DisputeField
                          checked={verdict.disputeConfirmed}
                          id={field.name}
                          onBlur={field.handleBlur}
                          onCheckedChange={(checked) =>
                            field.handleChange(checked ? { value: values.value, previousId: latest.id } : null)
                          }
                          previous={latest.value}
                          value={values.value}
                        />
                      )}
                    </form.AppField>
                  ) : null;
                }}
              </form.Subscribe>
            }
          >
            <div onFocusCapture={() => setReadingFocused(true)} onBlurCapture={() => setReadingFocused(false)}>
              <form.AppField name="value">
                {() => <ReadingValueField onInput={() => form.setFieldValue('confirmedDispute', null)} />}
              </form.AppField>
            </div>
          </ReadingCaptureCard>
          <form.AppField name="readAt">
            {(field) => (
              <field.TextField
                label="Read At"
                type="datetime-local"
                max={readAtInputValue(new Date())}
                description="When the meter was read. Leave blank for now."
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
