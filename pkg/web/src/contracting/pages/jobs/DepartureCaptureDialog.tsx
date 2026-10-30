import { type Assignment, ReadingComment, ReadingValue } from '@pkg/schema/contracting';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import {
  ReadingCaptureDetails,
  ReadingReadAtField,
  ReadingValueCard,
} from '@/contracting/components/readings/ReadingCaptureFields.js';
import { ConfirmedDispute, useReadingCapture } from '@/contracting/components/readings/use-reading-capture.js';

const DepartureValues = z.object({
  value: ReadingValue,
  comment: z.union([z.string().trim().length(0), ReadingComment]),
  confirmedDispute: ConfirmedDispute,
});
type DepartureValues = z.infer<typeof DepartureValues>;

export function DepartureCaptureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const capture = useReadingCapture({ role: 'departure', stint }, (values: DepartureValues) => ({
    ...values,
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
      defaultValues={{ value: Number.NaN, comment: '', confirmedDispute: null }}
      validator={DepartureValues}
      // Judged once the latest has loaded, and held only while it awaits the person; a bad value says so on submit.
      canSubmit={(values) => latestQuery.isSuccess && !judge(values).awaitingPerson}
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
          <ReadingReadAtField capture={capture} />
          <ReadingValueCard
            form={form}
            fields={{ value: 'value', confirmedDispute: 'confirmedDispute' }}
            capture={capture}
          />
          <ReadingCaptureDetails {...capture.details}>
            <form.AppField name="comment">
              {(field) => <field.TextareaField label="Comment (optional)" />}
            </form.AppField>
          </ReadingCaptureDetails>
        </>
      )}
    </CreateEntityDialog>
  );
}
