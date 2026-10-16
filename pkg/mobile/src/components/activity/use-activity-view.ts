import type { AppRouter } from '@pkg/api';
import { ACTIVITY_REFETCH_INTERVAL_MS, advancesActivityView, hasUnreadActivity } from '@pkg/domain';
import type { DateIso } from '@pkg/schema';
import {
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { TRPCQueryKey } from '@trpc/tanstack-react-query';
import { useCallback } from 'react';

type ActivityViewError = TRPCClientErrorLike<AppRouter>;

type ActivityPage = { items: readonly { occurredAt: DateIso }[] };

/** What one business hands the root: its mark read, a one-item read of its feed, and its mark write. */
export type ActivityViewClient<TLatest extends ActivityPage = ActivityPage> = {
  lastSeen: UseQueryOptions<DateIso, ActivityViewError, DateIso, TRPCQueryKey>;
  latest: UseQueryOptions<TLatest, ActivityViewError, TLatest, TRPCQueryKey>;
  setLastSeen: (options: {
    onSuccess: (seen: DateIso) => void;
  }) => UseMutationOptions<DateIso, ActivityViewError, { seenAt: DateIso }>;
};

/** Whether the newest entry lies beyond this person's Activity View: the dot on the business's Activity tab. */
export function useActivityUnread<TLatest extends ActivityPage>(
  client: ActivityViewClient<TLatest>,
  enabled: boolean,
): boolean {
  const lastSeen = useQuery({ ...client.lastSeen, enabled, refetchInterval: ACTIVITY_REFETCH_INTERVAL_MS });
  const latest = useQuery({ ...client.latest, enabled, refetchInterval: ACTIVITY_REFETCH_INTERVAL_MS });
  return (
    lastSeen.data !== undefined &&
    hasUnreadActivity({
      lastActivitySeen: lastSeen.data,
      latestActivityAt: latest.data?.items[0]?.occurredAt ?? null,
    })
  );
}

/**
 * Advances this person's Activity View through the newest item a feed displayed, and only when that feed is the
 * unfiltered, unsearched, unscoped one. Returns the `onViewedLatest` the timeline takes, or undefined when this view
 * never counts, so a scoped thread or a filter tab wires nothing.
 */
export function useActivityViewMark<TLatest extends ActivityPage>(
  client: ActivityViewClient<TLatest>,
  view: { track: boolean; filter: string; search: string; scoped: boolean },
): ((seenAt: DateIso) => void) | undefined {
  const queryClient = useQueryClient();
  const { mutate } = useMutation(
    client.setLastSeen({ onSuccess: (seen) => queryClient.setQueryData(client.lastSeen.queryKey, seen) }),
  );
  const acknowledge = useCallback((seenAt: DateIso) => mutate({ seenAt }), [mutate]);
  return view.track && advancesActivityView(view) ? acknowledge : undefined;
}
