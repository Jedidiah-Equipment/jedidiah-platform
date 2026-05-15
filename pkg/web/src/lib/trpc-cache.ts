import type { QueryClient } from '@tanstack/react-query';

export function clearTrpcCache(queryClient: QueryClient) {
  queryClient.clear();
}
