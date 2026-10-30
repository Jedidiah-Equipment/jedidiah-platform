import { type Assignment, ReadingComment } from '@pkg/schema/contracting';
import { z } from 'zod';
import { CreateEntityDialog } from '@/components/form/index.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { CaptureWizard } from '@/contracting/components/readings/CaptureWizard.js';
import { useReadingCapture } from '@/contracting/components/readings/use-reading-capture.js';

const DepartureValues = z.object({ comment: z.union([z.string().trim().length(0), ReadingComment]) });
type DepartureValues = z.infer<typeof DepartureValues>;

export function DepartureCaptureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const capture = useReadingCapture<DepartureValues>({ role: 'departure', stint });
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
      {...capture.dialogProps}
      defaultValues={{ comment: '' }}
      validator={DepartureValues}
      onCreated={close}
    >
      {(form) => (
        <CaptureWizard capture={capture}>
          <form.AppField name="comment">{(field) => <field.TextareaField label="Comment (optional)" />}</form.AppField>
        </CaptureWizard>
      )}
    </CreateEntityDialog>
  );
}
