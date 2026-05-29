import { auditEvents, type Db, parts, supplier, user } from '@pkg/db';
import { type PartBulkImportRow, PartListInput } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { bulkImportParts, listParts } from './part-service.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

const actorUserId = 'test-user-id';

function importRow(overrides: Partial<PartBulkImportRow> = {}): PartBulkImportRow {
  return {
    category: 'Bearings',
    code: 'P-100',
    description: 'Main bearing',
    drawingCode: null,
    finish: 'Zinc',
    lineNumber: 2,
    name: 'Bearing',
    supplierCode: 'SUP-100',
    supplierName: 'Acme Supplies',
    unitOfMeasure: 'quantity',
    ...overrides,
  };
}

describe('listParts', () => {
  test('filters parts by unit of measure', async ({ context }) => {
    await bulkImportParts({
      actorUserId,
      db: context.db,
      input: {
        rows: [
          importRow(),
          importRow({
            code: 'P-200',
            name: 'Linear rail',
            supplierCode: 'SUP-200',
            unitOfMeasure: 'mm',
          }),
        ],
      },
    });

    const lengthParts = await listParts({
      db: context.db,
      input: PartListInput.parse({ columnFilters: { unitOfMeasure: 'mm' }, pageSize: 0 }),
    });
    const countedParts = await listParts({
      db: context.db,
      input: PartListInput.parse({ columnFilters: { unitOfMeasure: 'quantity' }, pageSize: 0 }),
    });

    expect(lengthParts.items.map((part) => part.code)).toEqual(['P-200']);
    expect(countedParts.items.map((part) => part.code)).toEqual(['P-100']);
  });
});

describe('bulkImportParts', () => {
  test('creates missing suppliers and parts with audit events', async ({ context }) => {
    const result = await bulkImportParts({
      actorUserId,
      db: context.db,
      input: {
        rows: [
          importRow(),
          importRow({
            code: 'P-200',
            name: 'Bolt',
            supplierCode: 'BET-200',
            supplierName: 'Beta Supplies',
            unitOfMeasure: 'mm',
          }),
        ],
      },
    });

    const suppliers = await context.db.select().from(supplier).orderBy(supplier.companyName);
    const importedParts = await listParts({ db: context.db, input: PartListInput.parse({ pageSize: 0 }) });
    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);

    expect(result).toEqual({ errors: [], importedCount: 2, updatedCount: 0 });
    expect(suppliers.map((row) => row.companyName)).toEqual(['Acme Supplies', 'Beta Supplies']);
    expect(importedParts.items.map((part) => part.code)).toEqual(['P-100', 'P-200']);
    expect(importedParts.items.map((part) => part.unitOfMeasure)).toEqual(['quantity', 'mm']);
    expect(events).toMatchObject([
      {
        action: 'created',
        actorUserId,
        entityType: 'supplier',
        summary: 'Created supplier "Acme Supplies"',
      },
      {
        action: 'created',
        actorUserId,
        entityType: 'part',
        summary: 'Created part "Bearing"',
      },
      {
        action: 'created',
        actorUserId,
        entityType: 'supplier',
        summary: 'Created supplier "Beta Supplies"',
      },
      {
        action: 'created',
        actorUserId,
        entityType: 'part',
        summary: 'Created part "Bolt"',
      },
    ]);
  });

  test('is idempotent when importing identical rows again', async ({ context }) => {
    const input = { rows: [importRow()] };

    await bulkImportParts({ actorUserId, db: context.db, input });
    const result = await bulkImportParts({ actorUserId, db: context.db, input });
    const events = await context.db.select().from(auditEvents);

    expect(result).toEqual({ errors: [], importedCount: 0, updatedCount: 0 });
    expect(events).toHaveLength(2);
  });

  test('matches existing suppliers case-insensitively', async ({ context }) => {
    await bulkImportParts({ actorUserId, db: context.db, input: { rows: [importRow()] } });

    const result = await bulkImportParts({
      actorUserId,
      db: context.db,
      input: {
        rows: [
          importRow({
            code: 'P-101',
            supplierName: 'ACME SUPPLIES',
          }),
        ],
      },
    });
    const suppliers = await context.db.select().from(supplier);
    const importedParts = await listParts({ db: context.db, input: PartListInput.parse({ pageSize: 0 }) });

    expect(result).toEqual({ errors: [], importedCount: 0, updatedCount: 1 });
    expect(suppliers).toHaveLength(1);
    expect(importedParts.items[0]).toMatchObject({
      code: 'P-101',
      supplier: {
        companyName: 'Acme Supplies',
      },
    });
  });

  test('updates changed rows when the part identity matches', async ({ context }) => {
    const input = { rows: [importRow()] };
    await bulkImportParts({ actorUserId, db: context.db, input });

    const result = await bulkImportParts({
      actorUserId,
      db: context.db,
      input: {
        rows: [
          importRow({
            description: 'Updated main bearing',
            finish: 'Painted',
            name: 'Bearing Assembly',
            unitOfMeasure: 'mm',
          }),
        ],
      },
    });
    const importedParts = await listParts({ db: context.db, input: PartListInput.parse({ pageSize: 0 }) });
    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);

    expect(result).toEqual({ errors: [], importedCount: 0, updatedCount: 1 });
    expect(importedParts.items[0]).toMatchObject({
      description: 'Updated main bearing',
      finish: 'Painted',
      name: 'Bearing Assembly',
      unitOfMeasure: 'mm',
    });
    expect(events.at(-1)).toMatchObject({
      action: 'updated',
      actorUserId,
      changes: {
        description: {
          from: 'Main bearing',
          to: 'Updated main bearing',
        },
        finish: {
          from: 'Zinc',
          to: 'Painted',
        },
        name: {
          from: 'Bearing',
          to: 'Bearing Assembly',
        },
        unitOfMeasure: {
          from: 'quantity',
          to: 'mm',
        },
      },
      entityType: 'part',
      summary: 'Renamed part "Bearing" to "Bearing Assembly"',
    });
  });

  test('updates by supplier and supplier code when code changes', async ({ context }) => {
    await bulkImportParts({ actorUserId, db: context.db, input: { rows: [importRow()] } });

    const result = await bulkImportParts({
      actorUserId,
      db: context.db,
      input: {
        rows: [
          importRow({
            code: 'P-101',
          }),
        ],
      },
    });
    const importedParts = await listParts({ db: context.db, input: PartListInput.parse({ pageSize: 0 }) });

    expect(result).toEqual({ errors: [], importedCount: 0, updatedCount: 1 });
    expect(importedParts.items.map((part) => part.code)).toEqual(['P-101']);
  });

  test('skips conflicts and imports remaining rows', async ({ context }) => {
    await bulkImportParts({ actorUserId, db: context.db, input: { rows: [importRow()] } });

    const result = await bulkImportParts({
      actorUserId,
      db: context.db,
      input: {
        rows: [
          importRow({
            lineNumber: 4,
            supplierCode: 'BET-100',
            supplierName: 'Beta Supplies',
          }),
          importRow({
            code: 'P-200',
            lineNumber: 5,
            name: 'Bolt',
            supplierCode: 'BET-200',
            supplierName: 'Beta Supplies',
          }),
        ],
      },
    });

    const importedParts = await context.db.select().from(parts);
    const suppliers = await context.db.select().from(supplier);
    expect(result).toEqual({
      errors: [
        'Line 4: Part code P-100 already exists with supplier Acme Supplies / supplier code SUP-100; CSV row has Beta Supplies / BET-100.',
      ],
      importedCount: 1,
      updatedCount: 0,
    });
    expect(importedParts.map((part) => part.code).sort()).toEqual(['P-100', 'P-200']);
    expect(suppliers.map((row) => row.companyName).sort()).toEqual(['Acme Supplies', 'Beta Supplies']);
  });

  test('does not create a supplier for a skipped conflict row', async ({ context }) => {
    await bulkImportParts({ actorUserId, db: context.db, input: { rows: [importRow()] } });

    const result = await bulkImportParts({
      actorUserId,
      db: context.db,
      input: {
        rows: [
          importRow({
            lineNumber: 4,
            supplierCode: 'BET-100',
            supplierName: 'Beta Supplies',
          }),
        ],
      },
    });

    const suppliers = await context.db.select().from(supplier);

    expect(result).toEqual({
      errors: [
        'Line 4: Part code P-100 already exists with supplier Acme Supplies / supplier code SUP-100; CSV row has Beta Supplies / BET-100.',
      ],
      importedCount: 0,
      updatedCount: 0,
    });
    expect(suppliers.map((row) => row.companyName)).toEqual(['Acme Supplies']);
  });
});

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: actorUserId,
    name: 'Test User',
    role: 'admin',
    updatedAt: now,
  });
}
