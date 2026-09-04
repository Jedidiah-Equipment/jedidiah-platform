import { getTableName, is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { applicationSchemas, schema } from './schema.js';

// Business-blind mechanism stays in `public` (ADR 0016); every other table belongs to a business schema.
const publicTables = ['account', 'audit_events', 'changelog_view', 'session', 'user', 'verification'];
const businessSchemas = ['equipment'];

const declaredTables = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => ({ name: getTableName(table), schema: getTableConfig(table).schema ?? 'public' }));

describe('database schema namespaces', () => {
  it('keeps only business-blind mechanism in public', () => {
    const inPublic = declaredTables.filter((table) => table.schema === 'public').map((table) => table.name);

    expect([...new Set(inPublic)].sort()).toEqual(publicTables);
  });

  it('declares every other table in a business schema', () => {
    const misdeclared = declaredTables.filter(
      (table) => table.schema !== 'public' && !businessSchemas.includes(table.schema),
    );

    expect(misdeclared).toEqual([]);
  });

  it('derives the application schema list from the same declarations', () => {
    expect(applicationSchemas).toEqual(['public', ...businessSchemas].sort());
  });
});
