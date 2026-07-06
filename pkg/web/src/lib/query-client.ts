import { keepPreviousData, QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Hold the prior key's data while a keyed refetch is in flight so param/window
        // changes don't blink to empty. Ephemeral preview/blob queries opt out with
        // `placeholderData: undefined`.
        placeholderData: keepPreviousData,
        refetchOnWindowFocus: true,
      },
    },
  });
}
