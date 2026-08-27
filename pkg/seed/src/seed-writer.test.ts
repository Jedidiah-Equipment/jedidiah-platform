import type { DatabaseTransaction } from '@pkg/db';
import { getTableName } from 'drizzle-orm';
import { PgDialect, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import { clearSnapshotTables } from './seed-writer.js';
import { snapshotCleanupTables, snapshotTableNames } from './snapshot-tables.js';

function createClearingTransaction(publicTableNames: readonly string[]) {
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

      return Promise.resolve(publicTableNames.map((tablename) => ({ tablename })));
    }),
  } as unknown as DatabaseTransaction;

  return { calls, statements, tx };
}

describe('clearSnapshotTables', () => {
  it('truncates tables the snapshot does not own before deleting snapshot rows', async () => {
    const { calls, statements, tx } = createClearingTransaction([
      ...snapshotTableNames,
      'purchase_order',
      'purchase_order_job_link',
      'stock_movement',
    ]);

    await clearSnapshotTables(tx);

    const truncate = statements.find((statement) => statement.startsWith('TRUNCATE TABLE'));

    expect(truncate).toBe('TRUNCATE TABLE "purchase_order", "purchase_order_job_link", "stock_movement" CASCADE');
    // The sweep has to land before the ordered snapshot cleanup, or the restricting child rows it
    // removes still block their snapshot parents.
    expect(calls.indexOf(`execute:${truncate}`)).toBeLessThan(calls.findIndex((call) => call.startsWith('delete:')));
    expect(tx.delete).toHaveBeenCalledTimes(snapshotCleanupTables.length);
  });

  it('skips the truncate when every public table is snapshotted', async () => {
    const { statements, tx } = createClearingTransaction(snapshotTableNames);

    await clearSnapshotTables(tx);

    expect(statements.some((statement) => statement.startsWith('TRUNCATE TABLE'))).toBe(false);
  });
});
