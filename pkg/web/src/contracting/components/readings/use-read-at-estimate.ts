import { useDebouncedValue } from '@mantine/hooks';
import type { ReadingRole } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc.js';

const ESTIMATE_DEBOUNCE_MS = 300;
const ESTIMATE_STALE_MS = 30_000;

/**
 * When the ledger says the typed hours were on the meter, asked once typing stops. `estimate` is undefined until the
 * answer is for the hours on screen, so a value still being typed never borrows the last one's date.
 */
export function useReadAtEstimate(
  target: { machineId: string | null; role: Exclude<ReadingRole, 'baseline'>; assignmentId: string | null },
  value: number | null,
) {
  const trpc = useTRPC();
  const [asked] = useDebouncedValue(value, ESTIMATE_DEBOUNCE_MS);
  const query = useQuery(
    trpc.contractingReadings.estimateReadAt.queryOptions(
      { machineId: target.machineId ?? '', role: target.role, assignmentId: target.assignmentId, value: asked ?? 0 },
      // The ledger rarely moves while the dialog is open; a refusal refetches it.
      { enabled: !!target.machineId && asked !== null, staleTime: ESTIMATE_STALE_MS },
    ),
  );
  const current = value !== null && asked === value;
  return {
    estimate: current && query.isSuccess ? query.data : undefined,
    working: value !== null && (!current || query.isFetching),
    error: current ? query.error : null,
    refetch: query.refetch,
  };
}
