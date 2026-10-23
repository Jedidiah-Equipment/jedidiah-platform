import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';

type ContractingRoot =
  | 'contractingActivity'
  | 'contractingBreakdowns'
  | 'contractingDirectory'
  | 'contractingFleet'
  | 'contractingJobs'
  | 'contractingRateCard'
  | 'contractingReadings'
  | 'contractingServices'
  | 'contractingSettings';

/** Each Contracting write's refresh: every tRPC root whose reads that write moves, named in one place. */
export function useQueryInvalidation() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMemo(() => {
    const invalidate =
      (...roots: ContractingRoot[]) =>
      () =>
        Promise.all(roots.map((root) => queryClient.invalidateQueries({ queryKey: trpc[root].pathKey() })));
    return {
      // Activity reads its items off Jobs, Breakdowns and readings: a write that adds or changes one refreshes the feed and its dot.
      invalidateActivity: invalidate('contractingActivity'),
      invalidateDirectory: invalidate('contractingDirectory'),
      // A Machine read derives its due state and Booked In; Service Records name their Machine.
      invalidateFleet: invalidate('contractingFleet', 'contractingServices'),
      invalidateJobs: invalidate('contractingJobs'),
      invalidateRateCard: invalidate('contractingRateCard'),
      // A reading moves the Machine's latest hours, and Activity reads its items off readings.
      invalidateReadings: invalidate(
        'contractingReadings',
        'contractingFleet',
        'contractingServices',
        'contractingActivity',
      ),
      // A service moves its Machine's Next Service Due and Booked In; Breakdowns refresh with it as they have since
      // Service Records and the Workshop shared a page.
      invalidateServices: invalidate('contractingServices', 'contractingFleet', 'contractingBreakdowns'),
      // A threshold change moves Gap Flags and Service Due badges on every screen that shows them.
      invalidateSettings: invalidate(
        'contractingSettings',
        'contractingJobs',
        'contractingBreakdowns',
        'contractingFleet',
        'contractingServices',
      ),
      // Activity reads its items off Breakdowns; Service Records refresh with them for the same history as above.
      invalidateWorkshop: invalidate('contractingBreakdowns', 'contractingServices', 'contractingActivity'),
    };
  }, [queryClient, trpc]);
}
