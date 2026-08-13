import { auditEvents, type Db, partBom, parts, stockMovements, supplier, user } from '@pkg/db';
import { type PartBulkImportRow, PartListInput } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { savePartBom } from './part-bom-service.js';
import {
  bulkExportParts,
  bulkImportParts,
  createPart,
  listPartStorageLocations,
  listParts,
  updatePart,
} from './part-service.js';

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
    isInternallyFabricated: false,
    lineNumber: 2,
    name: 'Bearing',
    supplierCode: 'SUP-100',
    supplierName: 'Acme Supplies',
    unitOfMeasure: 'piece',
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
            standardPurchaseLengthMm: 6000,
            supplierCode: 'SUP-200',
            unitOfMeasure: 'mm',
          }),
          // A Built Part is counted in pieces: linear stock is bought and cut, never made.
          importRow({
            code: 'P-300',
            isInternallyFabricated: true,
            name: 'Weld bracket',
            supplierCode: 'SUP-300',
            supplierName: null,
          }),
        ],
      },
    });

    const lengthParts = await listParts({
      db: context.db,
      input: PartListInput.parse({ columnFilters: { unitOfMeasure: 'mm' }, limit: 0 }),
    });
    const countedParts = await listParts({
      db: context.db,
      input: PartListInput.parse({ columnFilters: { unitOfMeasure: 'piece' }, limit: 0 }),
    });
    const internallyFabricatedParts = await listParts({
      db: context.db,
      input: PartListInput.parse({ columnFilters: { isInternallyFabricated: true }, limit: 0 }),
    });

    expect(lengthParts.items.map((part) => part.code)).toEqual(['P-200']);
    expect(countedParts.items.map((part) => part.code)).toEqual(['P-100', 'P-300']);
    expect(internallyFabricatedParts.items.map((part) => part.code)).toEqual(['P-300']);
  });

  test('filters parts by storage location and lists distinct locations in order', async ({ context }) => {
    await context.db
      .insert(supplier)
      .values({ companyName: 'Acme Supplies', id: '00000000-0000-4000-8000-000000000001' });
    await Promise.all([
      createPart({
        actorUserId,
        db: context.db,
        input: partInput({ code: 'P-100', storageLocation: 'Rack B' }),
      }),
      createPart({
        actorUserId,
        db: context.db,
        input: partInput({ code: 'P-200', storageLocation: 'Rack A' }),
      }),
      createPart({
        actorUserId,
        db: context.db,
        input: partInput({ code: 'P-300', storageLocation: null }),
      }),
    ]);

    const filtered = await listParts({
      db: context.db,
      input: PartListInput.parse({ columnFilters: { storageLocation: 'Rack A' }, limit: 0 }),
    });
    const locations = await listPartStorageLocations({ db: context.db });

    expect(filtered.items.map((part) => part.code)).toEqual(['P-200']);
    expect(locations).toEqual({ locations: ['Rack A', 'Rack B'] });
  });
});

describe('updatePart', () => {
  test('audits every stock field changed through a part update', async ({ context }) => {
    await context.db
      .insert(supplier)
      .values({ companyName: 'Acme Supplies', id: '00000000-0000-4000-8000-000000000001' });
    const created = await createPart({ actorUserId, db: context.db, input: partInput() });

    await updatePart({
      actorUserId,
      db: context.db,
      input: {
        ...created,
        minimumStock: 5,
        standardPurchaseLengthMm: 6000,
        stockTrackingMode: 'periodic',
        storageLocation: 'Rack A',
        unitOfMeasure: 'mm',
      },
    });

    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);

    expect(events.at(-1)).toMatchObject({
      action: 'updated',
      changes: {
        minimumStock: { from: null, to: 5 },
        standardPurchaseLengthMm: { from: null, to: 6000 },
        stockTrackingMode: { from: 'perpetual', to: 'periodic' },
        storageLocation: { from: null, to: 'Rack A' },
      },
      entityType: 'part',
    });
  });

  test('rejects a Unit of Measure change after the Part ledger starts', async ({ context }) => {
    await context.db
      .insert(supplier)
      .values({ companyName: 'Acme Supplies', id: '00000000-0000-4000-8000-000000000001' });
    const created = await createPart({ actorUserId, db: context.db, input: partInput() });
    await context.db.insert(stockMovements).values({
      actorUserId,
      delta: 1,
      movementType: 'adjustment',
      partId: created.id,
      reason: 'opening-balance',
    });

    await expect(
      updatePart({
        actorUserId,
        db: context.db,
        input: { ...created, standardPurchaseLengthMm: 6_000, unitOfMeasure: 'mm' },
      }),
    ).rejects.toMatchObject({ code: 'part.unit_of_measure_locked' });
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
            standardPurchaseLengthMm: 6000,
            supplierCode: 'BET-200',
            supplierName: 'Beta Supplies',
            unitOfMeasure: 'mm',
          }),
        ],
      },
    });

    const suppliers = await context.db.select().from(supplier).orderBy(supplier.companyName);
    const importedParts = await listParts({ db: context.db, input: PartListInput.parse({ limit: 0 }) });
    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);

    expect(result).toEqual({ errors: [], importedCount: 2, updatedCount: 0 });
    expect(suppliers.map((row) => row.companyName)).toEqual(['Acme Supplies', 'Beta Supplies']);
    expect(importedParts.items.map((part) => part.code)).toEqual(['P-100', 'P-200']);
    expect(importedParts.items.map((part) => part.isInternallyFabricated)).toEqual([false, false]);
    expect(importedParts.items.map((part) => part.unitOfMeasure)).toEqual(['piece', 'mm']);
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

  test('matches existing suppliers case-insensitively without treating supplier code as identity', async ({
    context,
  }) => {
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
    const importedParts = await listParts({ db: context.db, input: PartListInput.parse({ limit: 0 }) });

    expect(result).toEqual({ errors: [], importedCount: 1, updatedCount: 0 });
    expect(suppliers).toHaveLength(1);
    expect(importedParts.items.map((part) => part.code).sort()).toEqual(['P-100', 'P-101']);
    expect(importedParts.items.every((part) => part.supplier?.companyName === 'Acme Supplies')).toBe(true);
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
            standardPurchaseLengthMm: 6000,
            unitOfMeasure: 'mm',
          }),
        ],
      },
    });
    const importedParts = await listParts({ db: context.db, input: PartListInput.parse({ limit: 0 }) });
    const events = await context.db.select().from(auditEvents).orderBy(auditEvents.occurredAt);

    expect(result).toEqual({ errors: [], importedCount: 0, updatedCount: 1 });
    expect(importedParts.items[0]).toMatchObject({
      description: 'Updated main bearing',
      finish: 'Painted',
      name: 'Bearing Assembly',
      standardPurchaseLengthMm: 6000,
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
          from: 'piece',
          to: 'mm',
        },
      },
      entityType: 'part',
      summary: 'Renamed part "Bearing" to "Bearing Assembly"',
    });
  });

  test('does not let a CSV update reinterpret an existing stock ledger', async ({ context }) => {
    await bulkImportParts({ actorUserId, db: context.db, input: { rows: [importRow()] } });
    const [part] = await context.db.select().from(parts);

    if (!part) {
      throw new Error('Imported Part was not returned');
    }

    await context.db.insert(stockMovements).values({
      actorUserId,
      delta: 1,
      movementType: 'adjustment',
      partId: part.id,
      reason: 'opening-balance',
    });

    await expect(
      bulkImportParts({
        actorUserId,
        db: context.db,
        input: {
          rows: [importRow({ standardPurchaseLengthMm: 6_000, unitOfMeasure: 'mm' })],
        },
      }),
    ).rejects.toMatchObject({ code: 'part.unit_of_measure_locked' });
  });

  test('creates a distinct part when only supplier code matches', async ({ context }) => {
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
    const importedParts = await listParts({ db: context.db, input: PartListInput.parse({ limit: 0 }) });

    expect(result).toEqual({ errors: [], importedCount: 1, updatedCount: 0 });
    expect(importedParts.items.map((part) => part.code).sort()).toEqual(['P-100', 'P-101']);
    expect(importedParts.items.every((part) => part.supplierCode === 'SUP-100')).toBe(true);
  });

  test('imports repeated supplier codes as distinct part codes', async ({ context }) => {
    const result = await bulkImportParts({
      actorUserId,
      db: context.db,
      input: {
        rows: [
          importRow({
            code: 'FAB1-1',
            lineNumber: 2,
            name: 'GP408',
            supplierCode: 'NC',
            supplierName: 'Jedidiah Fabrication',
          }),
          importRow({
            code: 'FAB1-2',
            lineNumber: 3,
            name: 'GP408',
            supplierCode: 'NC',
            supplierName: 'Jedidiah Fabrication',
          }),
          importRow({
            code: 'FAB1-4',
            lineNumber: 4,
            name: 'GP408',
            supplierCode: 'NC',
            supplierName: 'Jedidiah Fabrication',
          }),
        ],
      },
    });
    const importedParts = await listParts({ db: context.db, input: PartListInput.parse({ limit: 0 }) });

    expect(result).toEqual({ errors: [], importedCount: 3, updatedCount: 0 });
    expect(importedParts.items.map((part) => part.code).sort()).toEqual(['FAB1-1', 'FAB1-2', 'FAB1-4']);
    expect(importedParts.items.every((part) => part.supplierCode === 'NC')).toBe(true);
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

describe('bulkImportParts and the Supplier-or-BOM invariant', () => {
  /**
   * A Part has either a Supplier or a BOM, never both. `updatePart` protects that with
   * `assertBomCleared`; the bulk path does not call it, and does not need to — the identity guard
   * refuses the row first, because a Built Part stores no Supplier and the row must name one. This
   * pins that refusal, since it is the only thing standing between a CSV and a Part holding both.
   */
  test('refuses to make a Built Part bought while its BOM still stands', async ({ context }) => {
    await bulkImportParts({
      actorUserId,
      db: context.db,
      input: {
        rows: [
          importRow({ code: 'C-100', supplierCode: 'SUP-100' }),
          importRow({ code: 'B-100', isInternallyFabricated: true, name: 'Weld bracket', supplierName: null }),
        ],
      },
    });
    const [component] = await context.db.select().from(parts).where(eq(parts.code, 'C-100'));
    const [built] = await context.db.select().from(parts).where(eq(parts.code, 'B-100'));
    if (!component || !built) throw new Error('Expected the import to have created both Parts');
    await savePartBom({
      actorUserId,
      db: context.db,
      input: { lines: [{ componentPartId: component.id, quantity: 2 }], partId: built.id },
    });

    // The row flips the Built Part back to bought. Its BOM is still stored, and the DB's XOR check
    // cannot see `part_bom`, so nothing below this guard would stop it.
    const result = await bulkImportParts({
      actorUserId,
      db: context.db,
      input: {
        rows: [
          importRow({ code: 'B-100', isInternallyFabricated: false, name: 'Weld bracket', supplierCode: 'SUP-900' }),
        ],
      },
    });
    const [after] = await context.db.select().from(parts).where(eq(parts.code, 'B-100'));

    expect(result.errors).toEqual([
      'Line 2: Part code B-100 already exists with supplier no supplier (built in-house) / supplier code SUP-100; CSV row has Acme Supplies / SUP-900.',
    ]);
    expect(result.updatedCount).toBe(0);
    // Still built, still supplier-less, so it never comes to hold a Supplier and a BOM at once.
    expect(after).toMatchObject({ isInternallyFabricated: true, supplierId: null });
    const bomLines = await context.db.select().from(partBom).where(eq(partBom.parentPartId, built.id));
    expect(bomLines).toHaveLength(1);
  });
});

describe('bulkExportParts', () => {
  test('leaves a Part the imported file left out alone, since an import never removes', async ({ context }) => {
    await bulkImportParts({
      actorUserId,
      db: context.db,
      input: { rows: [importRow({ code: 'P-100' }), importRow({ code: 'P-200', supplierCode: 'SUP-200' })] },
    });

    // The user's edited file keeps only one of the two rows.
    await bulkImportParts({
      actorUserId,
      db: context.db,
      input: { rows: [importRow({ code: 'P-100', name: 'Renamed Bearing' })] },
    });

    const rows = await bulkExportParts({ db: context.db, input: {} });

    expect(rows.map((row) => [row.code, row.name])).toEqual([
      ['P-100', 'Renamed Bearing'],
      ['P-200', 'Bearing'],
    ]);
  });

  test('gives back what a bulk import put in, ordered by Part code', async ({ context }) => {
    await bulkImportParts({
      actorUserId,
      db: context.db,
      input: {
        rows: [
          importRow({ code: 'P-200', name: 'Washer', supplierCode: 'SUP-200' }),
          importRow({
            code: 'P-100',
            drawingCode: 'DR-100',
            standardPurchaseLengthMm: 6000,
            unitOfMeasure: 'mm',
          }),
        ],
      },
    });

    const rows = await bulkExportParts({ db: context.db, input: {} });

    expect(rows).toEqual([
      {
        category: 'Bearings',
        code: 'P-100',
        description: 'Main bearing',
        drawingCode: 'DR-100',
        finish: 'Zinc',
        isInternallyFabricated: false,
        name: 'Bearing',
        standardPurchaseLengthMm: 6000,
        supplierCode: 'SUP-100',
        supplierName: 'Acme Supplies',
        unitOfMeasure: 'mm',
      },
      {
        category: 'Bearings',
        code: 'P-200',
        description: 'Main bearing',
        drawingCode: null,
        finish: 'Zinc',
        isInternallyFabricated: false,
        name: 'Washer',
        standardPurchaseLengthMm: null,
        supplierCode: 'SUP-200',
        supplierName: 'Acme Supplies',
        unitOfMeasure: 'piece',
      },
    ]);
  });

  test('leaves the Supplier blank on a built Part, which is bought from nobody', async ({ context }) => {
    await bulkImportParts({
      actorUserId,
      db: context.db,
      input: {
        rows: [importRow({ code: 'B-100', isInternallyFabricated: true, supplierName: null })],
      },
    });

    const rows = await bulkExportParts({ db: context.db, input: {} });

    expect(rows).toEqual([expect.objectContaining({ code: 'B-100', supplierName: null })]);
  });

  test('leaves out a Part whose Supplier is removed, which the import could not read back', async ({ context }) => {
    await bulkImportParts({
      actorUserId,
      db: context.db,
      input: {
        rows: [
          importRow({ code: 'P-100' }),
          importRow({ code: 'P-300', supplierCode: 'OTH-300', supplierName: 'Other Supplies' }),
        ],
      },
    });
    await context.db.update(supplier).set({ deletedAt: new Date() }).where(eq(supplier.companyName, 'Other Supplies'));

    const rows = await bulkExportParts({ db: context.db, input: {} });

    expect(rows.map((row) => row.code)).toEqual(['P-100']);
  });

  test('narrows to one Supplier when scoped, the same scoping the import accepts', async ({ context }) => {
    await bulkImportParts({
      actorUserId,
      db: context.db,
      input: {
        rows: [
          importRow({ code: 'P-100' }),
          importRow({ code: 'P-300', supplierCode: 'OTH-300', supplierName: 'Other Supplies' }),
        ],
      },
    });
    const [acme] = await context.db.select().from(supplier).where(eq(supplier.companyName, 'Acme Supplies'));
    if (!acme) throw new Error('Expected the import to have created Acme Supplies');

    const rows = await bulkExportParts({ db: context.db, input: { supplierId: acme.id } });

    expect(rows.map((row) => row.code)).toEqual(['P-100']);
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

function partInput(overrides: Partial<Parameters<typeof createPart>[0]['input']> = {}) {
  return {
    category: 'Bearings',
    code: 'P-100',
    description: 'Main bearing',
    drawingCode: null,
    finish: 'Zinc',
    isInternallyFabricated: false,
    minimumStock: null,
    name: 'Bearing',
    standardPurchaseLengthMm: null,
    stockTrackingMode: 'perpetual' as const,
    storageLocation: null,
    supplierCode: 'SUP-100',
    supplierId: '00000000-0000-4000-8000-000000000001',
    unitOfMeasure: 'piece' as const,
    ...overrides,
  };
}
