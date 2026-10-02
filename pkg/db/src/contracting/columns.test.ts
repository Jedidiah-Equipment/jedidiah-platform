import { jobStatuses, rateBases, readingRoles, readingVerifications } from '@pkg/schema/contracting';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { quotedList } from '../schema/contracting/columns.js';

describe('quotedList', () => {
  it.each([
    {
      name: 'job statuses',
      values: jobStatuses,
      literals: "'upcoming', 'active', 'completed', 'priced', 'invoiced', 'cancelled'",
    },
    { name: 'rate bases', values: rateBases, literals: "'time', 'measure'" },
    { name: 'reading roles', values: readingRoles, literals: "'baseline', 'arrival', 'departure', 'spot'" },
    {
      name: 'reading verifications',
      values: readingVerifications,
      literals: "'pending', 'agrees', 'disagrees', 'low-confidence', 'not-applicable'",
    },
  ])('keeps $name as literals without query parameters', ({ values, literals }) => {
    const query = new PgDialect().sqlToQuery(sql`CHECK (value IN (${quotedList(values)}))`);

    expect(query.sql).toBe(`CHECK (value IN (${literals}))`);
    expect(query.params).toEqual([]);
  });

  it.each([
    { value: "x') OR TRUE --", literal: "'x'') OR TRUE --'" },
    { value: "O'Brien", literal: "'O''Brien'" },
    { value: String.raw`x\'); DROP TABLE jobs; --`, literal: String.raw`'x\''); DROP TABLE jobs; --'` },
  ])('escapes SQL syntax inside a string literal ($value)', ({ value, literal }) => {
    const query = new PgDialect().sqlToQuery(sql`CHECK (value IN (${quotedList([value])}))`);

    expect(query.sql).toBe(`CHECK (value IN (${literal}))`);
    expect(query.params).toEqual([]);
  });

  it('inlines only the enum list and keeps surrounding values parameterized', () => {
    const query = new PgDialect().sqlToQuery(
      sql`SELECT ${'runtime input'} WHERE value IN (${quotedList(['active', 'completed'])})`,
    );

    expect(query.sql).toBe("SELECT $1 WHERE value IN ('active', 'completed')");
    expect(query.params).toEqual(['runtime input']);
  });
});
