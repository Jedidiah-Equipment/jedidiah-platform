import type { DatabaseTransaction } from '@pkg/db';
import { getTableName, getTableUniqueName } from 'drizzle-orm';
import { PgDialect, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import { clearApplicationTables, clearSnapshotTables, prepareRowsForSeed } from './seed-writer.js';
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

it('derives Part Categories from Parts captured before Part Categories existed', () => {
  const partCategoryConfig = snapshotCleanupTables.find((table) => table.tableName === 'part_category');
  const partsConfig = snapshotCleanupTables.find((table) => table.tableName === 'parts');
  if (!partCategoryConfig || !partsConfig) throw new Error('Missing Part Category or Parts config');
  const legacyParts = [
    { category: 'Axle', code: 'AX-1', unitOfMeasure: 'piece' },
    { category: 'Axle ', code: 'AX-2', unitOfMeasure: 'piece' },
    { category: 'axle', code: 'AX-3', unitOfMeasure: 'piece' },
    { category: '6000', code: 'SEMP-0001', unitOfMeasure: 'mm' },
  ];
  const snapshotRows = new Map([['parts', legacyParts]]);

  const categories = prepareRowsForSeed(partCategoryConfig, [], snapshotRows);
  const seededParts = prepareRowsForSeed(partsConfig, legacyParts, snapshotRows);

  expect(categories.map((category) => category.name)).toEqual(['Axle', 'Pipe']);
  const idByName = new Map(categories.map((category) => [category.name, category.id]));
  expect(seededParts.map((part) => part.categoryId)).toEqual([
    idByName.get('Axle'),
    idByName.get('Axle'),
    idByName.get('Axle'),
    idByName.get('Pipe'),
  ]);

  const captured = [{ createdAt: new Date(), id: '00000000-0000-4000-8000-000000000001', name: 'Axle' }];
  expect(prepareRowsForSeed(partCategoryConfig, captured, snapshotRows)).toEqual(captured);
  const currentPart = { categoryId: '00000000-0000-4000-8000-000000000001', code: 'AX-1', unitOfMeasure: 'piece' };
  expect(prepareRowsForSeed(partsConfig, [currentPart], new Map())[0]).toMatchObject({
    categoryId: currentPart.categoryId,
  });
});
