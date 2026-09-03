import { useDebouncedValue } from '@mantine/hooks';
import type { DateIso, JobActivityFilter, UUID } from '@pkg/schema';
import { IconSearch } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useCallback, useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { jobActivityPageDescription } from '@/equipment/utils/page-descriptions.js';
import { useTRPC } from '@/lib/trpc.js';

import { JobActivityFeed } from './components/JobActivityFeed.js';
import { JobSheet } from './components/JobSheet.js';

const activityFilterLabels = {
  all: 'All',
  'user-feedback': 'User Feedback',
  'job-events': 'Job Events',
  'work-times': 'Work Times',
} as const satisfies Record<JobActivityFilter, string>;

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
        <>
          <div className="relative w-56">
            <IconSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
            <Input
              aria-label="Search activity"
              className="pl-8"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by text, user, job, product, or customer..."
              value={search}
            />
          </div>
          <JobActivityFilterSelect onValueChange={setFilter} value={filter} />
        </>
      }
      description={jobActivityPageDescription}
      size="md"
      title="Job Activity"
    >
      <JobActivityFeed filter={filter} onGlobalFeedViewed={handleGlobalFeedViewed} search={debouncedSearch} />
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

const JobActivityFilterSelect: React.FC<{
  onValueChange: (filter: JobActivityFilter) => void;
  value: JobActivityFilter;
}> = ({ onValueChange, value }) => (
  <Select onValueChange={(filter) => onValueChange(filter as JobActivityFilter)} value={value}>
    <SelectTrigger aria-label="Filter activity" className="w-40">
      <SelectValue>{activityFilterLabels[value]}</SelectValue>
    </SelectTrigger>
    <SelectContent align="end">
      {Object.entries(activityFilterLabels).map(([filter, label]) => (
        <SelectItem key={filter} value={filter}>
          {label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
