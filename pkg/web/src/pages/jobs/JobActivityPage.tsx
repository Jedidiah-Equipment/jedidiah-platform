import type { UUID } from '@pkg/schema';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { WEB_LIST_BATCH_SIZE } from '@/components/data-table/constants.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { jobActivityPageDescription } from '@/utils/page-descriptions.js';

import { JobActivityCard } from './components/JobActivityCard.js';
import { JobSheet } from './components/JobSheet.js';

/** How often an open feed picks up feedback submitted elsewhere. */
const ACTIVITY_REFETCH_INTERVAL_MS = 60_000;

export const JobActivityPage: React.FC<{ selectedJobId?: UUID | undefined }> = ({ selectedJobId }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();

  const activityQuery = useInfiniteQuery(
    trpc.jobActivity.list.infiniteQueryOptions(
      { limit: WEB_LIST_BATCH_SIZE },
      {
        ...cursorInfiniteQueryOptions,
        placeholderData: keepPreviousData,
        refetchInterval: ACTIVITY_REFETCH_INTERVAL_MS,
      },
    ),
  );
  const { items, total } = useCombinedCursorQueryPages(activityQuery.data?.pages);

  return (
    <PageLayout description={jobActivityPageDescription} size="md" title="Job Activity">
      <div className="grid gap-2">
        <ErrorMessage error={activityQuery.error} fallbackMessage="Unable to load job activity." />
        {activityQuery.isPending ? <Skeleton className="h-24" /> : null}
        {activityQuery.isSuccess && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has been said or done on a Job yet.</p>
        ) : null}
        {items.map((item) => (
          <JobActivityCard item={item} key={`${item.type}:${item.id}`} />
        ))}
        {activityQuery.hasNextPage ? (
          <Button
            className="justify-self-center"
            disabled={activityQuery.isFetchingNextPage}
            onClick={() => void activityQuery.fetchNextPage()}
            variant="outline"
          >
            Load more ({items.length} of {total})
          </Button>
        ) : null}
      </div>
      {selectedJobId ? (
        <JobSheet
          key={selectedJobId}
          jobId={selectedJobId}
          onClose={() => navigate({ search: {}, to: '/jobs/activity' })}
        />
      ) : null}
    </PageLayout>
  );
};
