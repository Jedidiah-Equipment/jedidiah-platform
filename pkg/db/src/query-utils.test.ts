import { describe, expect, it } from 'vitest';

import { createLikeSearchPattern, getPaginationOffset, isUniqueViolation, LIKE_SEARCH_ESCAPE } from './query-utils.js';

describe('createLikeSearchPattern', () => {
  it('wraps search terms for contains matching', () => {
    expect(createLikeSearchPattern('loader')).toBe('%loader%');
  });

  it('escapes LIKE wildcards and the shared escape character', () => {
    expect(createLikeSearchPattern('50%_!')).toBe('%50!%!_!!%');
    expect(LIKE_SEARCH_ESCAPE).toBe('!');
  });
});

describe('getPaginationOffset', () => {
  it('calculates a zero-based offset from one-based pagination input', () => {
    expect(getPaginationOffset({ page: 1, pageSize: 10 })).toBe(0);
    expect(getPaginationOffset({ page: 3, pageSize: 25 })).toBe(50);
  });
});

describe('isUniqueViolation', () => {
  it('detects Postgres unique violation errors', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('detects nested Postgres unique violation causes', () => {
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
  });

  it('rejects non-unique violation errors', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation({ cause: { code: '23503' } })).toBe(false);
  });
});
