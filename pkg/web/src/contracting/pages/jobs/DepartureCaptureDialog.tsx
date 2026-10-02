import { captureNeedsComment } from '@pkg/domain/contracting';
import { type Assignment, ReadingReason, ReadingValue } from '@pkg/schema/contracting';
import { z } from 'zod';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Separator } from '@/components/ui/separator.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { useCan } from '@/hooks/use-access.js';
import { ReadingCaptureCard, ReadingCaptureDetails, ReadingValueField } from './ReadingCaptureFields.js';
import { useReadingCapture } from './use-reading-capture.js';

const DepartureValues = z.object({
  value: ReadingValue,
  reason: z.union([z.string().trim().length(0), ReadingReason]),
});
export function DepartureCaptureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const capture = useReadingCapture('departure');
  const management = useCan('contracting_job:work-any').can;
  const needsReason = captureNeedsComment('departure', { management, hasPhoto: !!capture.photo });
  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) {
          capture.reset();
          onClose();
        }
      }}
      title={<MachineDialogTitle machine={stint}>Capture departure</MachineDialogTitle>}
      contentClassName="sm:max-w-md"
      defaultValues={{ value: stint?.arrival?.value ?? 0, reason: '' }}
      validator={DepartureValues}
      onBeforeCreate={(values) => !needsReason || !!values.reason.trim()}
      onCreate={async (values) => {
        if (!stint) throw new Error('No Machine Assignment selected.');
        await capture.submit({
          machineId: stint.machineId,
          assignmentId: stint.id,
          value: values.value,
          comment: values.reason.trim() || null,
        });
        return true;
      }}
      onCreated={() => {
        capture.reset();
        onClose();
      }}
    >
      {(form) => (
        <>
          <ReadingCaptureCard previousLabel="Arrival reading" previousValue={stint?.arrival?.value}>
            <form.AppField name="value">{() => <ReadingValueField min={stint?.arrival?.value ?? 0} />}</form.AppField>
          </ReadingCaptureCard>
          <ReadingCaptureDetails id={`departure-photo-${stint?.id ?? 'closed'}`} {...capture.details}>
            <div className="flex items-center gap-3" aria-hidden="true">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>
            <form.Subscribe
              selector={(state) => ({ submitted: state.submissionAttempts > 0, reason: state.values.reason })}
            >
              {({ submitted, reason }) => {
                const missingEvidence = submitted && needsReason && !reason.trim();
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
