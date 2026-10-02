import { useEffect } from 'react';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';

/** Mutation options for a Job write, by where it is fired from. */
export function useJobWrite() {
  const { invalidateJobs } = useQueryInvalidation();
  const showError = useApiMutationErrorToast();
  return {
    invalidateJobs,
    /** Fired straight from a card: refresh Jobs on success, toast on failure. */
    card: (message: string) => ({
      onSuccess: invalidateJobs,
      onError: (error: unknown) => showError(error, message),
    }),
    /** Fired from an open dialog: refresh Jobs on success; the dialog renders `mutation.error` itself. */
    dialog: { onSuccess: invalidateJobs },
  };
}

/** Clears a dialog's last refusal each time the dialog opens. */
export function useResetOnOpen(mutation: { reset: () => void }, open: boolean) {
  const { reset } = mutation;
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);
}
