import { removalNeedsReason } from '@pkg/domain/contracting';
import { requiredTrimmedText } from '@pkg/schema';
import type { AssignmentDetail } from '@pkg/schema/contracting';
import { IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { ReasonDialog } from '@/contracting/components/ReasonDialog.js';
import { IconAction } from '@/contracting/components/Timeline.js';
import { useResetOnOpen } from '@/contracting/hooks/use-contracting-write.js';
import { useTRPC } from '@/lib/trpc.js';
import { useJobWrite } from './use-job-write.js';

const REMOVE_FAILED = 'Unable to remove Machine Assignment.';

/** Takes one stint off its Job: a plain confirm while planned, a reason once its hours exist. */
export function RemoveStintButton({ stint }: { stint: AssignmentDetail }) {
  const trpc = useTRPC();
  const write = useJobWrite();
  const [open, setOpen] = useState(false);
  const needsReason = removalNeedsReason(stint.state);
  const remove = useMutation(
    trpc.contractingJobs.assignments.remove.mutationOptions(needsReason ? write.dialog : write.card(REMOVE_FAILED)),
  );
  useResetOnOpen(remove, open);
  if (!needsReason)
    return (
      <RemoveEntityButton
        description="Remove this Machine Assignment?"
        isPending={remove.isPending}
        onConfirm={() => remove.mutate({ id: stint.id })}
        title={<MachineDialogTitle machine={stint}>Remove planned Machine</MachineDialogTitle>}
        triggerIconOnly
        triggerLabel={`Remove ${stint.machineCode}`}
        triggerSize="icon-sm"
        triggerVariant="outline"
      />
    );
  return (
    <>
      <IconAction icon={IconTrash} label={`Remove ${stint.machineCode}`} onClick={() => setOpen(true)} />
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={<MachineDialogTitle machine={stint}>Remove Machine</MachineDialogTitle>}
        description="This deletes the stint with its hours, Travel and Measures. It cannot be undone."
        label="Reason"
        submitLabel="Remove"
        schema={requiredTrimmedText('A reason is required')}
        submit={(reason) => remove.mutateAsync({ id: stint.id, reason })}
        error={remove.error}
        fallbackMessage={REMOVE_FAILED}
      />
    </>
  );
}
