import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { RefreshControl as NativeRefreshControl, type RefreshControlProps } from 'react-native';

import { invalidateQueryCache } from '@/lib/query-client';
import { useBrandForegroundColor } from '@/theme/use-brand-foreground';

const refreshesInFlight = new WeakSet<QueryClient>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setRefreshing(queryClient: QueryClient, refreshing: boolean) {
  if (refreshing) refreshesInFlight.add(queryClient);
  else refreshesInFlight.delete(queryClient);
  for (const listener of listeners) listener();
}

/**
 * The app's one pull-to-refresh: a pull on any surface invalidates every API query, tinted by the brand accent for
 * the scheme currently painting. Every control shares one refresh, so a second pull while it runs only waits for it.
 */
export function RefreshControl(props: Omit<RefreshControlProps, 'colors' | 'onRefresh' | 'refreshing' | 'tintColor'>) {
  const color = useBrandForegroundColor();
  const queryClient = useQueryClient();
  const isRefreshing = useCallback(() => refreshesInFlight.has(queryClient), [queryClient]);
  const refreshing = useSyncExternalStore(subscribe, isRefreshing, isRefreshing);

  const onRefresh = useCallback(() => {
    if (refreshesInFlight.has(queryClient)) return;

    setRefreshing(queryClient, true);
    void invalidateQueryCache(queryClient).finally(() => setRefreshing(queryClient, false));
  }, [queryClient]);

  return (
    <NativeRefreshControl {...props} colors={[color]} onRefresh={onRefresh} refreshing={refreshing} tintColor={color} />
  );
}
