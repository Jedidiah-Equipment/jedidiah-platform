import { useDebouncedValue } from '@mantine/hooks';
import { activityFilterLabels } from '@pkg/domain/contracting';
import type { DateIso } from '@pkg/schema';
import { type ActivityFilter, activityFilters } from '@pkg/schema/contracting';
import { IconSearch } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Input } from '@/components/ui/input.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
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
        <div className="relative w-64">
          <IconSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label="Search Activity"
            className="pl-8"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search notes, people, Jobs, Machines or Farms…"
            value={search}
          />
        </div>
      }
      description="What has happened and what has been said on Jobs and Breakdowns, newest first."
      size="md"
      title="Activity"
    >
      <div className="grid gap-6">
        <Tabs onValueChange={(value) => setFilter(value as ActivityFilter)} size="sm" value={filter}>
          <TabsList aria-label="Filter Activity" variant="default">
            {activityFilters.map((value) => (
              <TabsTrigger key={value} value={value}>
                {activityFilterLabels[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <ActivityFeed filter={filter} onGlobalFeedViewed={handleGlobalFeedViewed} search={debouncedSearch} />
      </div>
    </PageLayout>
  );
}
