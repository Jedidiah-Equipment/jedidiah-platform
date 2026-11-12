import { removalNeedsReason } from '@pkg/domain/contracting';
import { type AssignmentDetail, AssignmentRemovalReason } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { RemoveEntityDialog } from '@/components/common/RemoveEntityButton.js';
import { ReasonDialog } from '@/components/form/ReasonDialog.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { useContractingWrite, useResetOnOpen } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

const REMOVE_FAILED = 'Unable to remove Machine Assignment.';

/** Takes one stint off its Job: a plain confirm while planned, a reason once its hours exist. */
export function RemoveStintDialog({
  stint,
  open,
  onOpenChange,
}: {
  stint: AssignmentDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const { invalidateJobHours } = useQueryInvalidation();
  const write = useContractingWrite(invalidateJobHours);
  const needsReason = removalNeedsReason(stint.state);
  const remove = useMutation(
    trpc.contractingJobs.assignments.remove.mutationOptions(needsReason ? write.dialog : write.card(REMOVE_FAILED)),
  );
  useResetOnOpen(remove, open);
  if (!needsReason)
    return (
      <RemoveEntityDialog
        description="Remove this Machine Assignment?"
        isPending={remove.isPending}
        onConfirm={() => remove.mutate({ id: stint.id })}
        onOpenChange={onOpenChange}
        open={open}
        title={<MachineDialogTitle machine={stint}>Remove planned Machine</MachineDialogTitle>}
      />
    );
  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<MachineDialogTitle machine={stint}>Remove Machine</MachineDialogTitle>}
      description="This deletes the stint with its hours, Travel and Measures. It cannot be undone."
      label="Reason"
      submitLabel="Remove"
      schema={AssignmentRemovalReason}
      submit={(reason) => remove.mutateAsync({ id: stint.id, reason })}
      error={remove.error}
      fallbackMessage={REMOVE_FAILED}
    />
  );
}
