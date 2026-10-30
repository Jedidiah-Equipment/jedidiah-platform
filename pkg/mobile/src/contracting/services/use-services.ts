import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fieldQuery } from '@/contracting/lib/field-query';
import { useSessionPermission } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';

/** The people a service may name as its Mechanic, for whoever may book one. */
export function useServiceMechanics() {
  const canBook = useSessionPermission('contracting_service:update');
  const trpc = useTRPC();
  return fieldQuery(
    canBook,
    useQuery(trpc.contractingServices.options.mechanics.queryOptions(undefined, { enabled: canBook })),
  );
}

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
