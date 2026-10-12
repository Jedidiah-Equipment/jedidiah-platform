import { describe, expect, it } from 'vitest';
import { isForbiddenError, isNotFoundError } from './trpc-errors';

describe('tRPC error readers', () => {
  it('recognises each code only', () => {
    expect(isNotFoundError({ data: { code: 'NOT_FOUND' } })).toBe(true);
    expect(isNotFoundError({ data: { code: 'FORBIDDEN' } })).toBe(false);
    expect(isNotFoundError(new Error('missing'))).toBe(false);
    expect(isForbiddenError({ data: { code: 'FORBIDDEN' } })).toBe(true);
    expect(isForbiddenError({ data: { code: 'NOT_FOUND' } })).toBe(false);
  });
});
