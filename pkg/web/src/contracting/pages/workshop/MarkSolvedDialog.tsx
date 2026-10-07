import { CloseOutNote } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { useResetOnOpen } from '@/contracting/pages/jobs/use-job-write.js';
import { useTRPC } from '@/lib/trpc.js';
import { useWorkshopWrite } from './use-workshop-write.js';

const MarkSolvedValues = z.object({ closeOutNote: CloseOutNote });

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
  const write = useWorkshopWrite();
  const solve = useMutation(
    trpc.contractingBreakdowns.solve.mutationOptions({
      onSuccess: async () => {
        await write.invalidateWorkshop();
        toast.success('Breakdown solved');
      },
      onError: write.report,
    }),
  );
  useResetOnOpen(solve, open);
  return (
    <CreateEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mark Breakdown solved"
      description="Say what was wrong and what fixed it. Nothing on the Breakdown can change once it is Solved."
      submitLabel="Mark solved"
      defaultValues={{ closeOutNote: '' }}
      validator={MarkSolvedValues}
      onCreate={(values) => solve.mutateAsync({ id: breakdownId, closeOutNote: values.closeOutNote })}
      onCreated={() => onOpenChange(false)}
    >
      {(form) => (
        <>
          <form.AppField name="closeOutNote">{(field) => <field.TextareaField label="Close-out note" />}</form.AppField>
          <ErrorMessage error={solve.error} fallbackMessage="Unable to mark the Breakdown solved." />
        </>
      )}
    </CreateEntityDialog>
  );
}
