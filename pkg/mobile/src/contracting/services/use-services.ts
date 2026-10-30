import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

/** Books a Machine in, refetching the Machine's Booked In flag on the field Machines list before it settles. */
export function useBookService() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.contractingServices.open.mutationOptions({
      onSuccess: () =>
        Promise.all(
          [trpc.contractingServices, trpc.contractingReadings, trpc.contractingFleet].map((root) =>
            queryClient.invalidateQueries({ queryKey: root.pathKey() }),
          ),
        ),
    }),
  );
}
