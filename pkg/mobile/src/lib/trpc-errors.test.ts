import { describe, expect, it } from 'vitest';
import { isNotFoundError } from './trpc-errors';

describe('isNotFoundError', () => {
  it('recognises only tRPC NOT_FOUND errors', () => {
    expect(isNotFoundError({ data: { code: 'NOT_FOUND' } })).toBe(true);
    expect(isNotFoundError({ data: { code: 'FORBIDDEN' } })).toBe(false);
    expect(isNotFoundError(new Error('missing'))).toBe(false);
  });
});
