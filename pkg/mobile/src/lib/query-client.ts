import { shouldReportApiMutationError } from '@pkg/schema';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { captureEvent, captureException } from './observability';
import type { MutationEventCatalog } from './observability-contract';

// Mirror web's defaults (pkg/web/src/lib/query-client.ts) so device and browser
// behave the same; window-focus refetch is web-only and harmless on native.
export function createQueryClient({
  mutationEvents = {},
}: {
  mutationEvents?: MutationEventCatalog;
} = {}): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError(error, query) {
        if (!shouldReportApiMutationError(error)) return;
        const procedurePath = procedurePathFromKey(query.queryKey);
        captureException(error, { procedurePath, source: 'api_query' });
      },
    }),
    mutationCache: new MutationCache({
      onError(error, _variables, _context, mutation) {
        if (!shouldReportApiMutationError(error)) return;
        const procedurePath = procedurePathFromKey(mutation.options.mutationKey);
        captureException(error, { procedurePath, source: 'api_mutation' });
      },
      onSuccess(data, variables, _context, mutation) {
        const procedurePath = procedurePathFromKey(mutation.options.mutationKey);
        const definition = mutationEvents[procedurePath];
        if (!definition) return;
        captureEvent(definition.event, {
          ...definition.properties(variables, data),
          procedurePath,
          source: 'api_mutation',
        });
      },
    }),
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  });
}

function procedurePathFromKey(key: readonly unknown[] | undefined): string {
  if (!key) return 'unknown';
  const path = [...key]
    .reverse()
    .find((part): part is string[] => Array.isArray(part) && part.every((item) => typeof item === 'string'));
  return path?.join('.') || 'unknown';
}

export async function invalidateQueryCache(queryClient: QueryClient): Promise<void> {
  // Active queries refetch immediately; inactive queries only become stale and reload when revisited.
  await queryClient.invalidateQueries();
}
