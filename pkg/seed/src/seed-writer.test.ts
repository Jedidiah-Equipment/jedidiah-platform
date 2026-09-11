import type { DatabaseTransaction } from '@pkg/db';
import { getTableName, getTableUniqueName } from 'drizzle-orm';
import { PgDialect, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import {
  clearApplicationTables,
  clearSnapshotTables,
  prepareRowsForSeed,
  prepareSnapshotsForSeed,
} from './seed-writer.js';
import { snapshotCleanupTables, snapshotTables } from './snapshot-tables.js';

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
  it('truncates tables in every application schema that the snapshot does not own before deleting snapshot rows', async () => {
    const { calls, statements, tx } = createClearingTransaction([
      ...snapshotCleanupTables.map((config) => catalogTable(config.table)),
      { schemaname: 'public', tablename: 'audit_events' },
      { schemaname: 'contracting', tablename: 'machine_assignment' },
      { schemaname: 'equipment', tablename: 'purchase_order' },
      { schemaname: 'equipment', tablename: 'purchase_order_job_link' },
      { schemaname: 'equipment', tablename: 'stock_movement' },
    ]);

    await clearSnapshotTables(tx);

    const truncate = statements.find((statement) => statement.startsWith('TRUNCATE TABLE'));

    expect(truncate).toBe(
      'TRUNCATE TABLE "contracting"."machine_assignment", "equipment"."purchase_order", "equipment"."purchase_order_job_link", "equipment"."stock_movement", "public"."audit_events" CASCADE',
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

it('initializes Labor rates for old snapshots and preserves captured rates', () => {
  const config = snapshotCleanupTables.find((table) => table.tableName === 'labor_department_rate');
  if (!config) throw new Error('Missing Labor rates config');
  expect(prepareRowsForSeed(config, [])).toEqual(
    expect.arrayContaining([
      { department: 'fabrication', costToCompanyRate: 220, billingRate: 550, consumablesPercentage: 60 },
      { department: 'workshop', costToCompanyRate: null, billingRate: 320, consumablesPercentage: null },
    ]),
  );
  const captured = [{ department: 'fabrication', costToCompanyRate: 250, billingRate: 600, consumablesPercentage: 70 }];
  expect(prepareRowsForSeed(config, captured)).toEqual(captured);
  const legacy = [{ id: 'fabrication', costToCompanyRate: 250, billingRate: 600, consumablesPercentage: 70 }];
  expect(prepareRowsForSeed(config, legacy)).toEqual(captured);
});

describe('prepareRowsForSeed', () => {
  it('falls back to the demo fleet, timestamps revived, when a contracting snapshot has no rows', () => {
    const machines = snapshotTables.find((config) => config.tableName === 'contracting_machine');
    if (!machines) throw new Error('Missing contracting_machine snapshot table config');

    const rows = prepareRowsForSeed(machines, []);

    expect(rows.map((row) => row.code)).toEqual(['KOL220-1', 'JD140-1', 'JD140-2']);
    expect(rows[0]?.createdAt).toBeInstanceOf(Date);
    expect(prepareRowsForSeed(machines, [{ code: 'REAL-1' }])).toEqual([{ code: 'REAL-1' }]);
  });

  it('drops the whole demo fleet once any of its tables holds a captured row', () => {
    const fleet = snapshotTables.filter((config) => config.emptySnapshotGroup === 'demo-fleet');
    const [categories] = fleet;
    if (!categories || fleet.length !== 3) throw new Error('Expected the three demo-fleet snapshot tables');

    const rows = (read: ReturnType<typeof prepareSnapshotsForSeed>) => read.map(({ rows }) => rows.length);

    expect(rows(prepareSnapshotsForSeed(fleet.map((config) => ({ config, rows: [] }))))).toEqual([4, 3, 2]);
    expect(
      rows(
        prepareSnapshotsForSeed(
          fleet.map((config) => ({ config, rows: config === categories ? [{ name: 'Real' }] : [] })),
        ),
      ),
    ).toEqual([1, 0, 0]);
  });
});
