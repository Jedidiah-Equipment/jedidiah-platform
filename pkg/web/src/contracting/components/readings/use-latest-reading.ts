import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc.js';

/** The Machine's latest reading, the one a capture is judged against; null while its ledger is empty. */
export function useLatestReading(machineId: string | null) {
  const trpc = useTRPC();
  return useQuery(
    trpc.contractingReadings.latest.queryOptions({ machineId: machineId ?? '' }, { enabled: !!machineId }),
  );
}
