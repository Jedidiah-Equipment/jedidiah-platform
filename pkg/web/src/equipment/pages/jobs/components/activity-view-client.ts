import type { JobActivityListResult } from '@pkg/schema/equipment';

import type { ActivityViewClient } from '@/components/activity/use-activity-view.js';
import { useTRPC } from '@/lib/trpc.js';

/** Equipment's Activity View procedures, in the shape the shared root hooks take. */
export function useEquipmentActivityViewClient(): ActivityViewClient<JobActivityListResult> {
  const trpc = useTRPC();
  return {
    lastSeen: trpc.jobActivity.getLastActivitySeen.queryOptions(),
    latest: trpc.jobActivity.list.queryOptions({ limit: 1 }),
    setLastSeen: (options) => trpc.jobActivity.setLastActivitySeen.mutationOptions(options),
  };
}
