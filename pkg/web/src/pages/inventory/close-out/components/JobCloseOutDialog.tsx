import type { UUID } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

import { JobCloseOutFormValues, toCloseOutJobInput } from '../../components/types.js';

export function JobCloseOutDialog({
  committedPartCount,
  drawnPartCount,
  jobId,
  onOpenChange,
  open,
}: {
  committedPartCount: number;
  drawnPartCount: number;
  jobId: UUID;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateInventory } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const mutation = useMutation(
    trpc.inventory.closeOutJob.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to close this Job out.'),
    }),
  );

  return (
    <CreateEntityDialog<JobCloseOutFormValues, unknown>
      defaultValues={{ note: '' }}
      description={describeOutstanding(drawnPartCount, committedPartCount)}
      onCreate={(values) => mutation.mutateAsync(toCloseOutJobInput(jobId, values))}
      onCreated={async () => {
        await invalidateInventory();
        onOpenChange(false);
        toast.success('Job closed out');
        await navigate({ to: '/inventory/close-out' });
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel="Close out"
      title="Close out Job stock"
      validator={JobCloseOutFormValues}
    >
      {(form) => (
        <form.AppField name="note">
          {(field) => <field.TextareaField label="Note" placeholder="Anything worth recording about the close" />}
        </form.AppField>
      )}
    </CreateEntityDialog>
  );
}

/**
 * The close is irreversible — reopening is not a v1 concept — so the dialog names exactly what is
 * about to be given up rather than asking for a blind confirmation.
 */
function describeOutstanding(drawnPartCount: number, committedPartCount: number): string {
  const outstanding = [
    drawnPartCount > 0 ? `${pluralParts(drawnPartCount)} still drawn against the Job` : null,
    committedPartCount > 0 ? `${pluralParts(committedPartCount)} still committed` : null,
  ].filter((part) => part !== null);

  if (outstanding.length === 0) return 'Ends this Job’s stock life. Nothing is outstanding.';

  return `Ends this Job’s stock life with ${outstanding.join(' and ')}. This cannot be undone.`;
}

function pluralParts(count: number): string {
  return count === 1 ? '1 Part' : `${count} Parts`;
}
