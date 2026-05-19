import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import type { RouterContext } from '@/app/router-context.js';
import { getRouteSession, ROUTE_AUTH_STALE_TIME_MS } from './route-auth.js';

describe('route auth', () => {
  it('reuses the cached route session while it is fresh', async () => {
    const session = {
      session: { id: 'session-id' },
      user: { id: 'user-id' },
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const queryFn = vi.fn().mockResolvedValue(session);
    const queryOptions = vi.fn((_input: undefined, options: { staleTime: number }) => ({
      ...options,
      queryFn,
      queryKey: ['auth', 'session'],
    }));
    const context = {
      queryClient,
      trpc: {
        auth: {
          session: {
            queryOptions,
          },
        },
      } as unknown as RouterContext['trpc'],
    };

    await expect(getRouteSession(context)).resolves.toBe(session);
    await expect(getRouteSession(context)).resolves.toBe(session);

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(queryOptions).toHaveBeenCalledWith(undefined, {
      staleTime: ROUTE_AUTH_STALE_TIME_MS,
    });
  });
});
