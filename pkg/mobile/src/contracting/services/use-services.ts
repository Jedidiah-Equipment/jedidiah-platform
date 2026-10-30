import { machinesDueForService } from '@pkg/domain/contracting';
import type { FieldMachine, ServiceRecord, ServiceRecordStatus } from '@pkg/schema/contracting';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DecorateMutationProcedure, ResolverDef } from '@trpc/tanstack-react-query';
import { fieldQuery } from '@/contracting/lib/field-query';
import { useMechanics } from '@/contracting/lib/use-mechanics';
import { useFleet } from '@/contracting/readings/use-fleet';
import { useSessionPermission } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';
import { isNotFoundError } from '@/lib/trpc-errors';

const PAGE_SIZE = 25;
export const SERVICE_SAVE_FAILED = 'Could not save. Check your connection and try again.';

type ServiceRoutes = ReturnType<typeof useTRPC>['contractingServices'];

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

/** `gone` once the record no longer exists. */
export function useServiceRecord(serviceId: string) {
  const canRead = useSessionPermission('contracting_service:read');
  const trpc = useTRPC();
  const query = useQuery(
    trpc.contractingServices.get.queryOptions({ id: serviceId }, { enabled: canRead && !!serviceId }),
  );
  return { ...fieldQuery(canRead, query), gone: isNotFoundError(query.error) };
}

/** A Booked In Machine's open Service Records, newest start first, as the web Machine card reads them. */
export function useMachineOpenServices(machine: Pick<FieldMachine, 'id' | 'serviceBookedIn'> | undefined) {
  const canRead = useSessionPermission('contracting_service:read');
  const enabled = canRead && !!machine?.serviceBookedIn;
  const trpc = useTRPC();
  return fieldQuery(
    enabled,
    useQuery(
      trpc.contractingServices.list.queryOptions(
        {
          machineIds: machine ? [machine.id] : [],
          statuses: ['open'],
          limit: 0,
          sortBy: 'startDate',
          sortDirection: 'desc',
        },
        { enabled },
      ),
    ),
  );
}

/**
 * One Service Record mutation whose success refetches the records and the Machines' service state before it settles,
 * so a screen's busy state covers the refetch and what it shows is the server's.
 */
export function useServiceMutation<TDef extends ResolverDef>(
  select: (services: ServiceRoutes) => DecorateMutationProcedure<TDef>,
) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    select(trpc.contractingServices).mutationOptions({
      onSuccess: () =>
        Promise.all(
          [trpc.contractingServices, trpc.contractingReadings, trpc.contractingFleet].map((root) =>
            queryClient.invalidateQueries({ queryKey: root.pathKey() }),
          ),
        ),
    }),
  );
}

/** A service's Mechanic choices: none first, then the Mechanic set, keeping the record's own once it has left the set. */
export function useServiceMechanicOptions(record?: Pick<ServiceRecord, 'primaryMechanicUserId' | 'mechanicName'>) {
  const options = (useMechanics('service').data ?? []).map((mechanic) => ({
    label: mechanic.name,
    value: mechanic.id,
  }));
  const current = record?.primaryMechanicUserId;
  if (current && !options.some((option) => option.value === current))
    options.push({ label: record.mechanicName ?? 'Unavailable mechanic', value: current });
  return [{ label: 'No Mechanic yet', value: '' }, ...options];
}
