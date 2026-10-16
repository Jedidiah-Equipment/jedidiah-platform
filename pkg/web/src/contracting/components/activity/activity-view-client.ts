import type { ActivityListResult } from '@pkg/schema/contracting';

import type { ActivityViewClient } from '@/components/activity/use-activity-view.js';
import { useTRPC } from '@/lib/trpc.js';

/** Contracting's Activity View procedures, in the shape the shared root hooks take. */
export function useContractingActivityViewClient(): ActivityViewClient<ActivityListResult> {
  const trpc = useTRPC();
  return {
    lastSeen: trpc.contractingActivity.getLastSeen.queryOptions(),
    latest: trpc.contractingActivity.list.queryOptions({ limit: 1 }),
    setLastSeen: (options) => trpc.contractingActivity.setLastSeen.mutationOptions(options),
  };
}
