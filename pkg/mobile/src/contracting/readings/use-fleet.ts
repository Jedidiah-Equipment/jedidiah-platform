import type { ReadingRole } from '@pkg/schema/contracting';
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

const ESTIMATE_DEBOUNCE_MS = 300;
const ESTIMATE_STALE_MS = 30_000;

/**
 * When the ledger says the typed hours were on the meter, asked once typing stops. `estimate` is undefined until the
 * answer is for the hours on screen, so a value still being typed never borrows the last one's date.
 */
export function useReadAtEstimate(
  target: { machineId: string; role: Exclude<ReadingRole, 'baseline'>; assignmentId: string | null },
  value: number | null,
) {
  const canCapture = useSessionPermission('contracting_reading:capture');
  const trpc = useTRPC();
  const asked = useDebouncedValue(value, ESTIMATE_DEBOUNCE_MS);
  const query = useQuery(
    trpc.contractingReadings.estimateReadAt.queryOptions(
      { ...target, value: asked ?? 0 },
      // The ledger rarely moves while the form is open; a refusal invalidates it.
      { enabled: canCapture && !!target.machineId && asked !== null, staleTime: ESTIMATE_STALE_MS },
    ),
  );
  const current = value !== null && asked === value;
  return {
    estimate: current && query.isSuccess ? query.data : undefined,
    working: canCapture && value !== null && (!current || query.isFetching),
    isError: current && query.isError,
  };
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
