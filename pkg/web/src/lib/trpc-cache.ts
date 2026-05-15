import type { QueryClient } from '@tanstack/react-query';

export function clearReactQueryCache(queryClient: QueryClient) {
  queryClient.clear();
}
