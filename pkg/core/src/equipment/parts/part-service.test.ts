import { auditEvents, type Db, user } from '@pkg/db';
import { partCategories, parts, stockMovements, supplier } from '@pkg/db/equipment';
import { type PartBulkImportRow, PartListInput } from '@pkg/schema/equipment';
import { describe, expect } from 'vitest';

import { createTester } from '../../test/create-tester.js';
import { bulkImportParts } from './part-bulk-service.js';
import { createPart, listPartStorageLocations, listParts, updatePart } from './part-service.js';

const BEARINGS_ID = '00000000-0000-4000-8000-0000000000b1';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  await db.insert(partCategories).values({ id: BEARINGS_ID, name: 'Bearings' });

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
  test('reports when stock history locks a Part Unit of Measure', async ({ context }) => {
    await bulkImportParts({ actorUserId, db: context.db, input: { rows: [importRow()] } });
    const [part] = await context.db.select().from(parts);

    if (!part) {
      throw new Error('Imported Part was not returned');
    }

    await context.db.insert(stockMovements).values({
      actorUserId,
      delta: 0,
      movementType: 'revaluation',
      partId: part.id,
      unitCost: 100,
    });

    const result = await listParts({ db: context.db, input: PartListInput.parse({ limit: 0 }) });

    expect(result.items).toEqual([expect.objectContaining({ code: 'P-100', unitOfMeasureLocked: true })]);
  });

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

describe('Parts by Part Category', () => {
  test('filters by Part Category id, and sorts and searches by its name', async ({ context }) => {
    await context.db
      .insert(supplier)
      .values({ companyName: 'Acme Supplies', id: '00000000-0000-4000-8000-000000000001' });
    const [axle] = await context.db.insert(partCategories).values({ name: 'Axle' }).returning();
    if (!axle) throw new Error('Part Category insert did not return a row');
    await createPart({ actorUserId, db: context.db, input: partInput({ code: 'P-100' }) });
    await createPart({ actorUserId, db: context.db, input: partInput({ categoryId: axle.id, code: 'P-200' }) });

    const filtered = await listParts({ db: context.db, input: PartListInput.parse({ categoryId: axle.id, limit: 0 }) });
    const sorted = await listParts({
      db: context.db,
      input: PartListInput.parse({ limit: 0, sortBy: 'category', sortDirection: 'asc' }),
    });
    const searched = await listParts({ db: context.db, input: PartListInput.parse({ limit: 0, search: 'axle' }) });
    const columnFiltered = await listParts({
      db: context.db,
      input: PartListInput.parse({ columnFilters: { category: 'xl' }, limit: 0 }),
    });

    expect(filtered.items).toEqual([expect.objectContaining({ category: 'Axle', categoryId: axle.id, code: 'P-200' })]);
    expect(sorted.items.map((part) => part.category)).toEqual(['Axle', 'Bearings']);
    expect(searched.items.map((part) => part.code)).toEqual(['P-200']);
    expect(columnFiltered.items.map((part) => part.code)).toEqual(['P-200']);
  });

  test('refuses to create or move a Part into a Part Category that does not exist', async ({ context }) => {
    await context.db
      .insert(supplier)
      .values({ companyName: 'Acme Supplies', id: '00000000-0000-4000-8000-000000000001' });
    const missingId = '00000000-0000-4000-8000-000000000999';
    const created = await createPart({ actorUserId, db: context.db, input: partInput() });

    await expect(
      createPart({ actorUserId, db: context.db, input: partInput({ categoryId: missingId, code: 'P-200' }) }),
    ).rejects.toMatchObject({ code: 'part.category_not_found' });
    await expect(
      updatePart({ actorUserId, db: context.db, input: { ...created, categoryId: missingId } }),
    ).rejects.toMatchObject({ code: 'part.category_not_found' });
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
    averageUtilizationPercent: null,
    categoryId: BEARINGS_ID,
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
