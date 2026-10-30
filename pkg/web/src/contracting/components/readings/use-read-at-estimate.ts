import { useDebouncedValue } from '@mantine/hooks';
import { ESTIMATE_DEBOUNCE_MS, ESTIMATE_STALE_MS, estimateOnScreen } from '@pkg/domain/contracting';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc.js';

/** When the ledger says the typed hours were on the meter, asked once typing stops. */
export function useReadAtEstimate(machineId: string | null, value: number | null) {
  const trpc = useTRPC();
  const [asked] = useDebouncedValue(value, ESTIMATE_DEBOUNCE_MS);
  const query = useQuery(
    trpc.contractingReadings.estimateReadAt.queryOptions(
      { machineId: machineId ?? '', value: asked ?? 0 },
      // The ledger rarely moves while the dialog is open; a refusal refetches it.
      { enabled: !!machineId && asked !== null, staleTime: ESTIMATE_STALE_MS },
    ),
  );
  return {
    ...estimateOnScreen(value, asked, {
      estimate: query.isSuccess ? query.data : undefined,
      fetching: query.isFetching,
      error: query.error,
    }),
    refetch: query.refetch,
  };
}
