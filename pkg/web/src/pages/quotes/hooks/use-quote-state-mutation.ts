import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

type QuoteStateAction = 'accept' | 'reject' | 'send';

type UseQuoteStateMutationInput = {
  action: QuoteStateAction;
  successMessage: string;
};

export function useQuoteStateMutation({ action, successMessage }: UseQuoteStateMutationInput) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();

  const callbacks = {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() });
      toast.success(successMessage);
    },
    onError: (error: unknown) => {
      showMutationError(error, 'Unable to update quote status.');
    },
  };

  const mutationOptions =
    action === 'accept'
      ? trpc.quotes.accept.mutationOptions(callbacks)
      : action === 'reject'
        ? trpc.quotes.reject.mutationOptions(callbacks)
        : trpc.quotes.send.mutationOptions(callbacks);

  return useMutation(mutationOptions);
}
