import { TRPCClientError } from '@trpc/client';
import { describe, expect, it } from 'vitest';
import { isForbiddenError, isNotFoundError, trpcErrorMessage } from './trpc-errors';

describe('tRPC error readers', () => {
  it('recognises each code only', () => {
    expect(isNotFoundError({ data: { code: 'NOT_FOUND' } })).toBe(true);
    expect(isNotFoundError({ data: { code: 'FORBIDDEN' } })).toBe(false);
    expect(isNotFoundError(new Error('missing'))).toBe(false);
    expect(isForbiddenError({ data: { code: 'FORBIDDEN' } })).toBe(true);
    expect(isForbiddenError({ data: { code: 'NOT_FOUND' } })).toBe(false);
  });

  it('reads no sentence from a request that never got an answer', () => {
    expect(trpcErrorMessage(TRPCClientError.from(new TypeError('Network request failed')))).toBeUndefined();
    expect(
      trpcErrorMessage(TRPCClientError.from(new Error('API gateway answered 504 without a tRPC response'))),
    ).toBeUndefined();
    const refusal = { error: { code: -32600, message: 'Refused.', data: { code: 'BAD_REQUEST' } } };
    expect(trpcErrorMessage(TRPCClientError.from(refusal))).toBe('Refused.');
    expect(trpcErrorMessage(new Error('Not a Field Note photo.'))).toBe('Not a Field Note photo.');
  });
});
