import type { JobListInput } from '@pkg/schema/contracting';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { useTRPC } from '@/lib/trpc.js';

const PAGE_SIZE = 200;

/** More Jobs wait on the server: the last page came back full and, where a count is served, it is not yet reached. */
export const hasMoreJobs = (lastPageLength: number | undefined, loaded: number, total: number | undefined) =>
  lastPageLength === PAGE_SIZE && (total === undefined || loaded < total);

/** One Job queue view, loaded a page at a time. `total` is the served queue count, or undefined where none exists. */
export function useJobQueuePages(input: Pick<JobListInput, 'queue' | 'invoicedInMonth'>, total: number | undefined) {
  const trpc = useTRPC();
  const view = `${input.queue}:${input.invoicedInMonth ?? ''}`;
  const [pageCountByView, setPageCountByView] = useState<Record<string, number>>({});
  const pageCount = pageCountByView[view] ?? 1;
  const pages = useQueries({
    queries: Array.from({ length: pageCount }, (_, page) =>
      trpc.contractingJobs.jobs.list.queryOptions({ ...input, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    ),
  });
  const rows = pages.flatMap((page) => page.data ?? []);
  return {
    rows,
    isPending: pages.some((page) => page.isPending),
    error: pages.find((page) => page.error)?.error,
    hasMore: hasMoreJobs(pages[pageCount - 1]?.data?.length, rows.length, total),
    loadMore: () => setPageCountByView((current) => ({ ...current, [view]: pageCount + 1 })),
  };
}

export function JobQueueLoadMore({
  pages,
}: {
  pages: Pick<ReturnType<typeof useJobQueuePages>, 'hasMore' | 'isPending' | 'loadMore'>;
}) {
  return pages.hasMore ? (
    <div className="mt-3 text-center">
      <Button variant="outline" disabled={pages.isPending} onClick={pages.loadMore}>
        Load more Jobs
      </Button>
    </div>
  ) : null;
}
