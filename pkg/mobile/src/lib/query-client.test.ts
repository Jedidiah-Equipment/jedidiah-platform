import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { captureEvent, captureException } from './observability';
import { createQueryClient, invalidateQueryCache } from './query-client';

vi.mock('./observability', () => ({ captureEvent: vi.fn(), captureException: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe('invalidateQueryCache', () => {
  it('invalidates the entire signed-in query cache', async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    await invalidateQueryCache(queryClient);

    expect(invalidateQueries).toHaveBeenCalledOnce();
    expect(invalidateQueries).toHaveBeenCalledWith();
  });
});

describe('query observability', () => {
  it('reports a failed read once with its tRPC procedure path', async () => {
    const queryClient = createQueryClient();
    const error = new Error('offline');

    await expect(
      queryClient.fetchQuery({
        queryKey: [['quotes', 'detail'], { input: { id: 'quote-1' }, type: 'query' }],
        queryFn: () => Promise.reject(error),
        retry: false,
      }),
    ).rejects.toBe(error);

    expect(captureException).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledWith(error, { procedurePath: 'quotes.detail', source: 'api_query' });
  });

  it('captures the catalog event after a mutation succeeds', async () => {
    const queryClient = createQueryClient({
      mutationEvents: {
        'quotes.cancel': { event: 'quote cancelled', properties: () => ({ quoteId: 'quote-1' }) },
      },
    });
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: async () => ({ ok: true }),
      mutationKey: [['quotes', 'cancel']],
    });

    await mutation.execute({ id: 'quote-1' });

    expect(captureEvent).toHaveBeenCalledWith('quote cancelled', {
      procedurePath: 'quotes.cancel',
      quoteId: 'quote-1',
      source: 'api_mutation',
    });
  });

  it('does not report expected API outcomes', async () => {
    const queryClient = createQueryClient();
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: () => Promise.reject({ data: { appCode: 'quote.cancelled' } }),
      mutationKey: [['quotes', 'cancel']],
    });

    await expect(mutation.execute({ id: 'quote-1' })).rejects.toEqual({ data: { appCode: 'quote.cancelled' } });
    expect(captureException).not.toHaveBeenCalled();
  });
});
