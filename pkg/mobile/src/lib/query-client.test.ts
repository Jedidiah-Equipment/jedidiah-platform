import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { invalidateQueryCache } from './query-client';

describe('invalidateQueryCache', () => {
  it('invalidates the entire signed-in query cache', async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    await invalidateQueryCache(queryClient);

    expect(invalidateQueries).toHaveBeenCalledOnce();
    expect(invalidateQueries).toHaveBeenCalledWith();
  });
});
