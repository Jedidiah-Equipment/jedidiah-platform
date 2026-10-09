import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fieldQuery } from '@/contracting/lib/field-query';
import { useSessionPermission } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';

const FIELD_READ_PERMISSIONS = ['contracting_machine:read', 'contracting_reading:capture'] as const;

export function useFleet() {
  const canRead = useSessionPermission(...FIELD_READ_PERMISSIONS);
  const trpc = useTRPC();
  return fieldQuery(
    canRead,
    useQuery(trpc.contractingReadings.fieldMachines.queryOptions(undefined, { enabled: canRead })),
  );
}

export function useMachineReadings(machineId: string) {
  const canRead = useSessionPermission(...FIELD_READ_PERMISSIONS);
  const trpc = useTRPC();
  return fieldQuery(
    canRead,
    useQuery(trpc.contractingReadings.fieldHistory.queryOptions({ machineId }, { enabled: canRead })),
  );
}

const READING_PAGE_SIZE = 25;

/** A Machine's Hour Readings, newest first, a server page at a time for the Readings tab. */
export function useMachineReadingPages(machineId: string) {
  const canRead = useSessionPermission(...FIELD_READ_PERMISSIONS);
  const trpc = useTRPC();
  const query = useInfiniteQuery(
    trpc.contractingReadings.fieldHistoryPage.infiniteQueryOptions(
      { machineId, limit: READING_PAGE_SIZE },
      { enabled: canRead && !!machineId, getNextPageParam: (page) => page.nextCursor, initialCursor: 0 },
    ),
  );
  return { canRead, query, readings: canRead ? (query.data?.pages.flatMap((page) => page.items) ?? []) : [] };
}
