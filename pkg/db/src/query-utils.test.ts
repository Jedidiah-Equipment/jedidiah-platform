import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  createLikeSearchPattern,
  getPaginationOffset,
  getPaginationQueryOptions,
  getSortOrder,
  isUniqueViolation,
  LIKE_SEARCH_ESCAPE,
} from './query-utils.js';

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

describe('getPaginationQueryOptions', () => {
  it('shapes limit and offset options for relational queries', () => {
    expect(getPaginationQueryOptions({ page: 2, pageSize: 15 })).toEqual({
      limit: 15,
      offset: 15,
    });
  });
});

describe('escaped search conditions', () => {
  it('creates escaped contains conditions and skips empty global search input', () => {
    expect(createEscapedContainsSearchCondition(sql`name`, '50%')).toBeDefined();
    expect(createGlobalSearchCondition('', [sql`name`])).toBeUndefined();
    expect(createGlobalSearchCondition('loader', [])).toBeUndefined();
    expect(createGlobalSearchCondition('loader', [sql`name`, sql`model_code`])).toBeDefined();
  });
});

describe('getSortOrder', () => {
  it('maps sort directions to order expressions', () => {
    expect(getSortOrder(sql`name`, 'asc')).toBeDefined();
    expect(getSortOrder(sql`name`, 'desc')).toBeDefined();
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
