import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { clearReactQueryCache } from './trpc-cache.js';

describe('clearReactQueryCache', () => {
  it('removes cached query data on auth changes', () => {
    const queryClient = new QueryClient();
    const accessQueryKey = [['auth', 'access'], { type: 'query' }];

    queryClient.setQueryData(accessQueryKey, {
      departments: ['paint'],
      userId: 'previous-user-id',
    });

    clearReactQueryCache(queryClient);

    expect(queryClient.getQueryData(accessQueryKey)).toBeUndefined();
  });
});
