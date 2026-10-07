import { useEffect } from 'react';
import { useApiMutationErrorReport, useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';

/** Mutation options for a Contracting write, by where it is fired from; `invalidate` refreshes the affected roots. */
export function useContractingWrite(invalidate: () => Promise<unknown>) {
  const showError = useApiMutationErrorToast();
  const report = useApiMutationErrorReport();
  return {
    invalidate,
    /** Reports an unexpected failure without a toast, for a dialog write with its own `onError`. */
    report,
    /** Fired straight from a card: refresh on success, toast on failure. */
    card: (message: string) => ({
      onSuccess: invalidate,
      onError: (error: unknown) => showError(error, message),
    }),
    /** Fired from an open dialog: refresh on success; the dialog renders `mutation.error` itself. */
    dialog: { onSuccess: invalidate, onError: report },
  };
}

/** Clears a dialog's last refusal each time the dialog opens. */
export function useResetOnOpen(mutation: { reset: () => void }, open: boolean) {
  const { reset } = mutation;
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);
}
