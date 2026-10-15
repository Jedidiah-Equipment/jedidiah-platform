import { useDebouncedValue } from '@mantine/hooks';
import { activityFilterLabels } from '@pkg/domain/contracting';
import type { DateIso } from '@pkg/schema';
import type { ActivityFilter } from '@pkg/schema/contracting';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { ActivityFilterTabs, ActivitySearch } from '@/components/activity/ActivityFeedControls.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { ActivityFeed } from '@/contracting/components/activity/ActivityFeed.js';
import { useTRPC } from '@/lib/trpc.js';

export function ActivityPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search.trim(), 250);
  const { mutate: markSeen } = useMutation(
    trpc.contractingActivity.setLastSeen.mutationOptions({
      onSuccess: (seen) => queryClient.setQueryData(trpc.contractingActivity.getLastSeen.queryKey(), seen),
    }),
  );
  const handleGlobalFeedViewed = useCallback((seenAt: DateIso) => markSeen({ seenAt }), [markSeen]);

  return (
    <PageLayout
      actions={
        <ActivitySearch
          onChange={setSearch}
          placeholder="Search notes, people, Jobs, Machines or Farms…"
          value={search}
        />
      }
      description="What has happened and what has been said on Jobs and Breakdowns, newest first."
      size="md"
      title="Activity"
    >
      <div className="grid gap-6">
        <ActivityFilterTabs labels={activityFilterLabels} onChange={setFilter} value={filter} />
        <ActivityFeed filter={filter} onGlobalFeedViewed={handleGlobalFeedViewed} search={debouncedSearch} />
      </div>
    </PageLayout>
  );
}
