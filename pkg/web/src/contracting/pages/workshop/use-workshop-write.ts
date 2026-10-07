import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useApiMutationErrorReport, useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';

/** Mutation options for a Workshop write, by where it is fired from. */
export function useWorkshopWrite() {
  const { invalidateWorkshop } = useQueryInvalidation();
  const showError = useApiMutationErrorToast();
  const report = useApiMutationErrorReport();
  return {
    invalidateWorkshop,
    /** Reports an unexpected failure without a toast, for a dialog write with its own `onError`. */
    report,
    /** Fired straight from a card: refresh the Workshop on success, toast on failure. */
    card: (message: string) => ({
      onSuccess: invalidateWorkshop,
      onError: (error: unknown) => showError(error, message),
    }),
    /** Fired from an open dialog: refresh the Workshop on success; the dialog renders `mutation.error` itself. */
    dialog: { onSuccess: invalidateWorkshop, onError: report },
  };
}
