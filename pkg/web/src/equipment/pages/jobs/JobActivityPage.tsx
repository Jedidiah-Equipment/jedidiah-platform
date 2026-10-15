import { useDebouncedValue } from '@mantine/hooks';
import { jobActivityFilterLabels } from '@pkg/domain/equipment';
import type { DateIso, UUID } from '@pkg/schema';
import type { JobActivityFilter } from '@pkg/schema/equipment';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useCallback, useState } from 'react';

import { ActivityFilterTabs, ActivitySearch } from '@/components/activity/ActivityFeedControls.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { jobActivityPageDescription } from '@/equipment/utils/page-descriptions.js';
import { useTRPC } from '@/lib/trpc.js';

import { JobActivityFeed } from './components/JobActivityFeed.js';
import { JobSheet } from './components/JobSheet.js';

export const JobActivityPage: React.FC<{ selectedJobId?: UUID | undefined }> = ({ selectedJobId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const [filter, setFilter] = useState<JobActivityFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search.trim(), 250);
  const lastSeenOptions = trpc.jobActivity.getLastActivitySeen.queryOptions();
  const { mutate: markActivitySeen } = useMutation(
    trpc.jobActivity.setLastActivitySeen.mutationOptions({
      onSuccess: (lastActivitySeen) => queryClient.setQueryData(lastSeenOptions.queryKey, lastActivitySeen),
    }),
  );
  const handleGlobalFeedViewed = useCallback((seenAt: DateIso) => markActivitySeen({ seenAt }), [markActivitySeen]);

  return (
    <PageLayout
      actions={
        <ActivitySearch
          onChange={setSearch}
          placeholder="Search text, people, Jobs, POs, Suppliers, Products or Customers…"
          value={search}
        />
      }
      description={jobActivityPageDescription}
      size="md"
      title="Job Activity"
    >
      <div className="grid gap-6">
        <ActivityFilterTabs labels={jobActivityFilterLabels} onChange={setFilter} value={filter} />
        <JobActivityFeed filter={filter} onGlobalFeedViewed={handleGlobalFeedViewed} search={debouncedSearch} />
      </div>
      {selectedJobId ? (
        <JobSheet
          key={selectedJobId}
          jobId={selectedJobId}
          onClose={() => navigate({ search: {}, to: '/equipment/jobs/activity' })}
        />
      ) : null}
    </PageLayout>
  );
};
