import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { clearTrpcCache } from './trpc-cache.js';

describe('clearTrpcCache', () => {
  it('removes cached query data on auth changes', () => {
    const queryClient = new QueryClient();
    const accessQueryKey = [['auth', 'access'], { type: 'query' }];

    queryClient.setQueryData(accessQueryKey, {
      departments: ['paint'],
      userId: 'previous-user-id',
    });

    clearTrpcCache(queryClient);

    expect(queryClient.getQueryData(accessQueryKey)).toBeUndefined();
  });
});
