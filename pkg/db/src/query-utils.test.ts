import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createDatabaseClient } from './database-client.js';
import {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  createLikeSearchPattern,
  getPaginationQueryOptions,
  getSortOrder,
  isUniqueViolation,
  LIKE_SEARCH_ESCAPE,
  onCalendarDays,
  paginateWithWindowTotal,
} from './query-utils.js';
import { createEphemeralTestDatabase, dropTestDatabase } from './test-utils.js';

describe('createLikeSearchPattern', () => {
  it('wraps search terms for contains matching', () => {
    expect(createLikeSearchPattern('loader')).toBe('%loader%');
  });

  it('escapes LIKE wildcards and the shared escape character', () => {
    expect(createLikeSearchPattern('50%_!')).toBe('%50!%!_!!%');
    expect(LIKE_SEARCH_ESCAPE).toBe('!');
  });
});

describe('getPaginationQueryOptions', () => {
  it('shapes limit and offset options for relational queries', () => {
    expect(getPaginationQueryOptions({ cursor: 30, limit: 15 })).toEqual({
      limit: 15,
      offset: 30,
    });
  });

  it('omits pagination options when the limit is zero', () => {
    expect(getPaginationQueryOptions({ cursor: 30, limit: 0 })).toEqual({});
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

describe('onCalendarDays', () => {
  it('is no condition without ends and a condition once either end is given', () => {
    expect(onCalendarDays(sql`invoiced_at`, 'Africa/Johannesburg', {})).toBeUndefined();
    expect(onCalendarDays(sql`invoiced_at`, 'Africa/Johannesburg', { from: '2026-10-01' })).toBeDefined();
    expect(onCalendarDays(sql`invoiced_at`, 'Africa/Johannesburg', { to: '2026-10-08' })).toBeDefined();
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

describe('paginateWithWindowTotal', () => {
  it('reads the total off the page, or off the unpaged match once the cursor is past the last row', async () => {
    const { databaseName, databaseUrl } = await createEphemeralTestDatabase();
    const { db, close } = createDatabaseClient(databaseUrl, { max: 1 });

    try {
      const matching = () =>
        db
          .select({
            n: sql<number>`n`.mapWith(Number),
            total: sql<number>`count(*) over ()`.mapWith(Number),
          })
          .from(sql`generate_series(1, 3) as n`)
          .orderBy(sql`n`)
          .$dynamic();

      await expect(paginateWithWindowTotal(matching, { cursor: 2, limit: 2 })).resolves.toEqual({
        rows: [{ n: 3, total: 3 }],
        total: 3,
        nextCursor: null,
      });
      await expect(paginateWithWindowTotal(matching, { cursor: 5, limit: 2 })).resolves.toEqual({
        rows: [],
        total: 3,
        nextCursor: null,
      });
    } finally {
      await close();
      await dropTestDatabase(databaseName);
    }
  });
});
