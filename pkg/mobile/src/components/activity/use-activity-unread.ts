import { ACTIVITY_REFETCH_INTERVAL_MS, hasUnreadActivity } from '@pkg/domain';
import type { DateIso } from '@pkg/schema';
import { type QueryKey, type UseQueryOptions, useQuery } from '@tanstack/react-query';

/**
 * Whether the newest entry in a business's feed lies beyond this person's Activity View: the dot on its Activity tab.
 * Each business hands in its own last-seen read and a one-item read of its feed.
 */
export function useActivityUnread<
  TError,
  TLatest extends { items: readonly { occurredAt: DateIso }[] },
  TLastSeenKey extends QueryKey,
  TLatestKey extends QueryKey,
>({
  enabled,
  lastSeen,
  latest,
}: {
  enabled: boolean;
  lastSeen: UseQueryOptions<DateIso, TError, DateIso, TLastSeenKey>;
  latest: UseQueryOptions<TLatest, TError, TLatest, TLatestKey>;
}): boolean {
  const lastSeenQuery = useQuery({ ...lastSeen, enabled, refetchInterval: ACTIVITY_REFETCH_INTERVAL_MS });
  const latestQuery = useQuery({ ...latest, enabled, refetchInterval: ACTIVITY_REFETCH_INTERVAL_MS });
  return (
    lastSeenQuery.data !== undefined &&
    hasUnreadActivity({
      lastActivitySeen: lastSeenQuery.data,
      latestActivityAt: latestQuery.data?.items[0]?.occurredAt ?? null,
    })
  );
}
