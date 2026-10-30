import { type Machine, ReadingComment } from '@pkg/schema/contracting';
import { z } from 'zod';
import { CreateEntityDialog } from '@/components/form/index.js';
import { MachineDialogTitle, machineDialogSubject } from '@/contracting/components/MachineDialogTitle.js';
import { CaptureWizard } from '@/contracting/components/readings/CaptureWizard.js';
import { useReadingCapture } from '@/contracting/components/readings/use-reading-capture.js';

const SpotValues = z.object({ comment: z.union([z.string().trim().length(0), ReadingComment]) });

/**
 * A spot Hour Reading on one Machine, captured in the office: no Assignment, no billing
 * effect, only the Machine's hours kept current. The wizard asks when the meter was read. Mounted while
 * the reading is being captured, so closing unmounts it.
 */
export function SpotCaptureDialog({
  machine,
  onClose,
}: {
  machine: Pick<Machine, 'id' | 'code' | 'categoryIcon' | 'categoryColour'>;
  onClose: () => void;
}) {
  const capture = useReadingCapture(machine.id);

  return (
    <CreateEntityDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={<MachineDialogTitle machine={machineDialogSubject(machine)}>Capture hours</MachineDialogTitle>}
      {...capture.dialogProps}
      defaultValues={{ comment: '' }}
      validator={SpotValues}
      onCreated={onClose}
    >
      {(form) => (
        <CaptureWizard capture={capture}>
          <form.AppField name="comment">{(field) => <field.TextareaField label="Comment (optional)" />}</form.AppField>
        </CaptureWizard>
      )}
    </CreateEntityDialog>
  );
}
