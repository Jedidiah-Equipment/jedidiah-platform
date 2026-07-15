import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { invalidateQueryCache } from './query-client';

/** Shared pull-to-refresh state for every scroll surface belonging to one screen. */
export function useGlobalRefresh() {
  const queryClient = useQueryClient();
  const refreshInFlight = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    if (refreshInFlight.current) return;

    refreshInFlight.current = true;
    setRefreshing(true);
    void invalidateQueryCache(queryClient).finally(() => {
      refreshInFlight.current = false;
      setRefreshing(false);
    });
  }, [queryClient]);

  return { onRefresh, refreshing };
}
