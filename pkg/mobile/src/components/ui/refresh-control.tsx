import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { RefreshControl as NativeRefreshControl, type RefreshControlProps } from 'react-native';

import { invalidateQueryCache } from '@/lib/query-client';
import { useBrandForegroundColor } from '@/theme/use-brand-foreground';

const refreshesInFlight = new WeakMap<QueryClient, Promise<void>>();

function refreshEverything(queryClient: QueryClient): Promise<void> {
  let refresh = refreshesInFlight.get(queryClient);
  if (!refresh) {
    refresh = invalidateQueryCache(queryClient).finally(() => refreshesInFlight.delete(queryClient));
    refreshesInFlight.set(queryClient, refresh);
  }
  return refresh;
}

/**
 * The app's one pull-to-refresh: a pull on any surface invalidates every API query, tinted by the brand accent for
 * the scheme currently painting. A pull during a refresh joins it rather than starting another.
 */
export function RefreshControl(props: Omit<RefreshControlProps, 'colors' | 'onRefresh' | 'refreshing' | 'tintColor'>) {
  const color = useBrandForegroundColor();
  const queryClient = useQueryClient();
  // Only the pulled surface spins: on iOS a programmatic `refreshing` scrolls that list to reveal the spinner.
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refreshEverything(queryClient).finally(() => setRefreshing(false));
  }, [queryClient]);

  return (
    <NativeRefreshControl {...props} colors={[color]} onRefresh={onRefresh} refreshing={refreshing} tintColor={color} />
  );
}
