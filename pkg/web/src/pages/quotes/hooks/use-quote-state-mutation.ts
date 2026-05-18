import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useTRPC } from '@/lib/trpc.js';

type QuoteStateAction = 'accept' | 'reject' | 'send';

type UseQuoteStateMutationInput = {
  action: QuoteStateAction;
  successMessage: string;
};

export function useQuoteStateMutation({ action, successMessage }: UseQuoteStateMutationInput) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const callbacks = {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() });
      toast.success(successMessage);
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
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
