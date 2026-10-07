import { CloseOutNote } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ReasonDialog } from '@/contracting/components/ReasonDialog.js';
import { useContractingWrite, useResetOnOpen } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

export function MarkSolvedDialog({
  breakdownId,
  open,
  onOpenChange,
}: {
  breakdownId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const write = useContractingWrite(useQueryInvalidation().invalidateWorkshop);
  const solve = useMutation(
    trpc.contractingBreakdowns.solve.mutationOptions({
      onSuccess: async () => {
        await write.invalidate();
        toast.success('Breakdown solved');
      },
      onError: write.report,
    }),
  );
  useResetOnOpen(solve, open);
  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mark Breakdown solved"
      description="Say what was wrong and what fixed it. Nothing on the Breakdown can change once it is Solved."
      label="Close-out note"
      submitLabel="Mark solved"
      schema={CloseOutNote}
      submit={(closeOutNote) => solve.mutateAsync({ id: breakdownId, closeOutNote })}
      error={solve.error}
      fallbackMessage="Unable to mark the Breakdown solved."
    />
  );
}
