import { groupActivityByDay } from '@pkg/domain';
import type { DateIso } from '@pkg/schema';
import type React from 'react';
import { Fragment, useEffect, useRef } from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { cn } from '@/lib/utils.js';

/**
 * The slice of a query the timeline reads: its state, and for an infinite query how to fetch the next page. A plain
 * query (a record's whole thread in one read) leaves the paging out.
 */
type ActivityTimelineQuery = {
  error: unknown;
  fetchNextPage?: () => Promise<unknown>;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isPending: boolean;
  isSuccess: boolean;
};

/** Entries under a heading per day, newest day first as given; renders nothing for no entries. */
function ActivityDayGroups<TItem extends { occurredAt: DateIso }>({
  getItemKey,
  items,
  renderItem,
}: {
  getItemKey: (item: TItem) => string;
  items: readonly TItem[];
  renderItem: (item: TItem) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-6">
      {groupActivityByDay(items).map((group, index) => (
        // The page already rules off its own header, so only a day that follows another draws one.
        <section className={cn('grid gap-3', index > 0 && 'border-t border-border/70 pt-6')} key={group.day}>
          <h2 className="font-medium text-xs tracking-[0.18em] uppercase">{group.label}</h2>
          {/* Entries only — each draws the spine down to the next, and the last one draws none. */}
          <div className="grid gap-5">
            {group.items.map((item) => (
              <Fragment key={getItemKey(item)}>{renderItem(item)}</Fragment>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * A business's activity feed as a timeline: a heading per day, and under it a spine the day's entries hang off. The
 * day is what a reader navigates by — "what happened yesterday" rather than "the eleventh entry" — so it gets a rule
 * and a heading, and the spine restarts beneath each one. Older pages load as the reader scrolls to the end.
 */
export function ActivityTimeline<TItem extends { occurredAt: DateIso }>({
  getItemKey,
  emptyMessage,
  errorMessage,
  items,
  onViewedLatest,
  query,
  renderItem,
}: {
  getItemKey: (item: TItem) => string;
  emptyMessage: string;
  errorMessage: string;
  items: readonly TItem[];
  /** Called with the newest item's instant once the feed has loaded; the feed decides when a view counts. */
  onViewedLatest?: ((occurredAt: DateIso) => void) | undefined;
  query: ActivityTimelineQuery;
  renderItem: (item: TItem) => React.ReactNode;
}) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isSuccess } = query;
  const latestOccurredAt = items[0]?.occurredAt;

  useEffect(() => {
    if (isSuccess && latestOccurredAt !== undefined) onViewedLatest?.(latestOccurredAt);
  }, [isSuccess, latestOccurredAt, onViewedLatest]);

  useEffect(() => {
    const loadMore = loadMoreRef.current;

    if (!loadMore || !hasNextPage || !fetchNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '256px 0px' },
    );

    observer.observe(loadMore);

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <div className="grid gap-6">
      <ErrorMessage error={query.error} fallbackMessage={errorMessage} />
      {query.isPending ? <Skeleton className="h-24" /> : null}
      {query.isSuccess && items.length === 0 ? <p className="text-sm text-muted-foreground">{emptyMessage}</p> : null}
      <ActivityDayGroups getItemKey={getItemKey} items={items} renderItem={renderItem} />
      {hasNextPage ? <div aria-hidden className="h-px" ref={loadMoreRef} /> : null}
    </div>
  );
}
