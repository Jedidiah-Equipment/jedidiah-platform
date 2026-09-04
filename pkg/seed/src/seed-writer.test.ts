import type { DatabaseTransaction } from '@pkg/db';
import { getTableName, getTableUniqueName } from 'drizzle-orm';
import { PgDialect, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import { clearApplicationTables, clearSnapshotTables } from './seed-writer.js';
import { snapshotCleanupTables } from './snapshot-tables.js';

type CatalogTable = { schemaname: string; tablename: string };

function catalogTable(table: PgTable): CatalogTable {
  const [schemaname, tablename] = getTableUniqueName(table).split('.');

  if (!schemaname || !tablename) {
    throw new Error(`Expected a schema-qualified table name, received ${getTableUniqueName(table)}`);
  }

  return { schemaname, tablename };
}

function createClearingTransaction(catalogTables: readonly CatalogTable[]) {
  const calls: string[] = [];
  const statements: string[] = [];
  const dialect = new PgDialect();

  const tx = {
    delete: vi.fn((table: PgTable) => {
      calls.push(`delete:${getTableName(table)}`);

      return Promise.resolve();
    }),
    execute: vi.fn((query: never) => {
      const { sql } = dialect.sqlToQuery(query);
      calls.push(`execute:${sql}`);
      statements.push(sql);

      return Promise.resolve(catalogTables);
    }),
  } as unknown as DatabaseTransaction;

  return { calls, statements, tx };
}

describe('clearSnapshotTables', () => {
  it('truncates tables in public and equipment that the snapshot does not own before deleting snapshot rows', async () => {
    const { calls, statements, tx } = createClearingTransaction([
      ...snapshotCleanupTables.map((config) => catalogTable(config.table)),
      { schemaname: 'public', tablename: 'audit_events' },
      { schemaname: 'equipment', tablename: 'purchase_order' },
      { schemaname: 'equipment', tablename: 'purchase_order_job_link' },
      { schemaname: 'equipment', tablename: 'stock_movement' },
    ]);

    await clearSnapshotTables(tx);

    const truncate = statements.find((statement) => statement.startsWith('TRUNCATE TABLE'));

    expect(truncate).toBe(
      'TRUNCATE TABLE "equipment"."purchase_order", "equipment"."purchase_order_job_link", "equipment"."stock_movement", "public"."audit_events" CASCADE',
    );
    // The sweep has to land before the ordered snapshot cleanup, or the restricting child rows it
    // removes still block their snapshot parents.
    expect(calls.indexOf(`execute:${truncate}`)).toBeLessThan(calls.findIndex((call) => call.startsWith('delete:')));
    expect(tx.delete).toHaveBeenCalledTimes(snapshotCleanupTables.length);
  });

  it('skips the truncate when every application table is snapshotted', async () => {
    const { statements, tx } = createClearingTransaction(
      snapshotCleanupTables.map((config) => catalogTable(config.table)),
    );

    await clearSnapshotTables(tx);

    expect(statements.some((statement) => statement.startsWith('TRUNCATE TABLE'))).toBe(false);
  });
});

describe('clearApplicationTables', () => {
  it('truncates snapshotted tables too and restarts identities without per-table deletes', async () => {
    const { statements, tx } = createClearingTransaction([
      { schemaname: 'public', tablename: 'user' },
      { schemaname: 'equipment', tablename: 'stock_movement' },
      { schemaname: 'equipment', tablename: 'customers' },
    ]);

    await clearApplicationTables(tx);

    expect(statements.find((statement) => statement.startsWith('TRUNCATE TABLE'))).toBe(
      'TRUNCATE TABLE "equipment"."customers", "equipment"."stock_movement", "public"."user" RESTART IDENTITY CASCADE',
    );
    expect(tx.delete).not.toHaveBeenCalled();
  });
});
