import { ESTIMATE_DEBOUNCE_MS, ESTIMATE_STALE_MS, estimateOnScreen } from '@pkg/domain/contracting';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fieldQuery } from '@/contracting/lib/field-query';
import { useSessionPermission } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const FIELD_READ_PERMISSIONS = ['contracting_machine:read', 'contracting_reading:capture'] as const;

export function useFleet() {
  const canRead = useSessionPermission(...FIELD_READ_PERMISSIONS);
  const trpc = useTRPC();
  return fieldQuery(
    canRead,
    useQuery(trpc.contractingReadings.fieldMachines.queryOptions(undefined, { enabled: canRead })),
  );
}

/** The Machine's latest reading, the one a capture is judged against; null while its ledger is empty. */
export function useLatestReading(machineId: string) {
  const canRead = useSessionPermission(...FIELD_READ_PERMISSIONS);
  const trpc = useTRPC();
  return fieldQuery(
    canRead,
    useQuery(trpc.contractingReadings.latest.queryOptions({ machineId }, { enabled: canRead })),
  );
}

/** John Deere's latest report for a linked Machine, which Job Hours are compared to; null when unlinked. */
export function useLatestTelematics(machineId: string) {
  const canRead = useSessionPermission(...FIELD_READ_PERMISSIONS);
  const trpc = useTRPC();
  return fieldQuery(
    canRead,
    useQuery(
      trpc.contractingReadings.latestTelematics.queryOptions({ machineId }, { enabled: canRead && !!machineId }),
    ),
  );
}

/** When the ledger says the typed hours were on the meter, asked once typing stops; nothing for a role that cannot capture. */
export function useReadAtEstimate(machineId: string, value: number | null) {
  const canCapture = useSessionPermission('contracting_reading:capture');
  const trpc = useTRPC();
  const asked = useDebouncedValue(value, ESTIMATE_DEBOUNCE_MS);
  const query = useQuery(
    trpc.contractingReadings.estimateReadAt.queryOptions(
      { machineId, value: asked ?? 0 },
      // The ledger rarely moves while the form is open; a refusal invalidates it.
      { enabled: canCapture && !!machineId && asked !== null, staleTime: ESTIMATE_STALE_MS },
    ),
  );
  return estimateOnScreen(canCapture ? value : null, asked, {
    estimate: query.isSuccess ? query.data : undefined,
    fetching: query.isFetching,
    error: query.error,
  });
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
