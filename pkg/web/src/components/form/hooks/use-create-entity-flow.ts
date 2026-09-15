import { type UseMutationOptions, useMutation } from '@tanstack/react-query';
import { type NavigateOptions, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';

type UseCreateEntityFlowOptions<TData, TError, TVariables, TContext> = {
  /** Shown when the create mutation fails. */
  errorMessage: string;
  invalidate: () => Promise<unknown>;
  mutation: UseMutationOptions<TData, TError, TVariables, TContext>;
  /** Where to go once created — the new entity's edit route, normally. Omit to stay put. */
  navigateTo?: (created: TData) => NavigateOptions;
  onCreated?: (created: TData) => void;
};

/**
 * The list-page half of a `<CreateEntityDialog>`: open state, the create mutation with its error toast,
 * and what happens after a create lands — invalidate, close, then open the new entity.
 */
export function useCreateEntityFlow<TData, TError, TVariables, TContext>({
  errorMessage,
  invalidate,
  mutation,
  navigateTo,
  onCreated,
}: UseCreateEntityFlowOptions<TData, TError, TVariables, TContext>) {
  const navigate = useNavigate();
  const showError = useApiMutationErrorToast();
  const [open, setOpen] = useState(false);
  const create = useMutation({ ...mutation, onError: (error) => showError(error, errorMessage) });

  return {
    create: create.mutateAsync,
    dialogProps: {
      open,
      onOpenChange: setOpen,
      onCreated: async (created: TData) => {
        await invalidate();
        setOpen(false);
        onCreated?.(created);
        if (navigateTo) await navigate(navigateTo(created));
      },
    },
    open: () => setOpen(true),
  };
}
