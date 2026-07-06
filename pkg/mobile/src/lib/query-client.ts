import { QueryClient } from '@tanstack/react-query';

// Mirror web's defaults (pkg/web/src/lib/query-client.ts) so device and browser
// behave the same; window-focus refetch is web-only and harmless on native.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  });
}
