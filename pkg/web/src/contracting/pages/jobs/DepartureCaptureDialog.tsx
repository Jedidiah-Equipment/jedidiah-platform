import { readAtFromInput } from '@pkg/domain/contracting';
import { type Assignment, ReadingReason, ReadingValue } from '@pkg/schema/contracting';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Separator } from '@/components/ui/separator.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import {
  ReadingCaptureDetails,
  ReadingReadAtField,
  ReadingValueCard,
} from '@/contracting/components/readings/ReadingCaptureFields.js';
import { ConfirmedDispute, useReadingCapture } from '@/contracting/components/readings/use-reading-capture.js';

const DepartureValues = z.object({
  value: ReadingValue,
  reason: z.union([z.string().trim().length(0), ReadingReason]),
  confirmedDispute: ConfirmedDispute,
  readAt: z.string(),
});
type DepartureValues = z.infer<typeof DepartureValues>;

export function DepartureCaptureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const capture = useReadingCapture({ role: 'departure', stint }, (values: DepartureValues) => ({
    ...values,
    comment: values.reason,
    readAt: readAtFromInput(values.readAt),
    stintOverrides: undefined,
  }));
  const { latestQuery } = capture;
  const { judge } = capture;
  const close = () => {
    capture.reset();
    onClose();
  };
  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={<MachineDialogTitle machine={stint}>Capture departure</MachineDialogTitle>}
      contentClassName="sm:max-w-md"
      defaultValues={{ value: Number.NaN, reason: '', confirmedDispute: null, readAt: '' }}
      validator={DepartureValues}
      // Judged once the latest has loaded, and a value below it waits for its dispute; a missing reason or a bad
      // value say so on submit.
      canSubmit={(values) => {
        const verdict = judge(values);
        return latestQuery.isSuccess && (!verdict.below || verdict.disputeConfirmed);
      }}
      onBeforeCreate={(values) => judge(values).request !== null}
      onCreate={async (values) => {
        await capture.submit(values);
        return true;
      }}
      onCreated={close}
    >
      {(form) => (
        <>
          <ErrorMessage error={latestQuery.error} fallbackMessage="Unable to load the Machine's previous reading." />
          <ReadingValueCard
            form={form}
            fields={{ value: 'value', confirmedDispute: 'confirmedDispute', readAt: 'readAt' }}
            capture={capture}
          />
          <ReadingReadAtField form={form} fields={{ readAt: 'readAt' }} />
          <ReadingCaptureDetails id={`departure-photo-${stint?.id ?? 'closed'}`} {...capture.details}>
            <div className="flex items-center gap-3" aria-hidden="true">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>
            <form.Subscribe selector={(state) => ({ submitted: state.submissionAttempts > 0, values: state.values })}>
              {({ submitted, values }) => {
                const needsReason = judge(values).commentRequired;
                const missingEvidence = submitted && needsReason && !values.reason.trim();
                const errorId = `departure-evidence-error-${stint?.id ?? 'closed'}`;
                return (
                  <>
                    <form.AppField name="reason">
                      {(field) => (
                        <field.TextareaField
                          label={needsReason ? 'Reason' : 'Reason (optional)'}
                          aria-describedby={missingEvidence ? errorId : undefined}
                        />
                      )}
                    </form.AppField>
                    {missingEvidence ? (
                      <p id={errorId} role="alert" className="text-xs text-destructive">
                        A photo or a reason is required to capture departure.
                      </p>
                    ) : null}
                  </>
                );
              }}
            </form.Subscribe>
          </ReadingCaptureDetails>
        </>
      )}
    </CreateEntityDialog>
  );
}
