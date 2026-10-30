import { machinesDueForService } from '@pkg/domain/contracting';
import type { ServiceRecordStatus } from '@pkg/schema/contracting';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fieldQuery } from '@/contracting/lib/field-query';
import { useFleet } from '@/contracting/readings/use-fleet';
import { useSessionPermission } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';

const PAGE_SIZE = 25;

/** Service Records the Services list's filters ask for, newest start first, a server page at a time. */
export function useServiceRecordList({
  search,
  statuses,
  mechanicUserIds,
  machineIds,
}: {
  search: string;
  statuses: readonly ServiceRecordStatus[];
  mechanicUserIds: readonly string[];
  machineIds: readonly string[];
}) {
  const canRead = useSessionPermission('contracting_service:read');
  const trpc = useTRPC();
  const query = useInfiniteQuery(
    trpc.contractingServices.list.infiniteQueryOptions(
      {
        search,
        statuses: [...statuses],
        mechanicUserIds: [...mechanicUserIds],
        machineIds: [...machineIds],
        limit: PAGE_SIZE,
        sortBy: 'startDate',
        sortDirection: 'desc',
      },
      {
        enabled: canRead,
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        placeholderData: keepPreviousData,
      },
    ),
  );
  return { canRead, query, records: canRead ? (query.data?.pages.flatMap((page) => page.items) ?? []) : [] };
}

/** The Mechanics some Service Record names, for the list's Mechanic filter. */
export function useServiceFilterOptions() {
  const canRead = useSessionPermission('contracting_service:read');
  const trpc = useTRPC();
  return fieldQuery(
    canRead,
    useQuery(trpc.contractingServices.options.filters.queryOptions(undefined, { enabled: canRead })),
  );
}

/** The field fleet's Machines Due for Service, overdue first, as the web's Services page pins them. */
export function useMachinesDueForService() {
  const fleet = useFleet();
  return { ...fleet, data: fleet.data ? machinesDueForService(fleet.data) : undefined };
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
