import { auditEvents, type Db, user } from '@pkg/db';
import type { Part, PartCreateInput, Supplier } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

async function createSupplier(caller: AppRouterCaller, name = 'Acme Supplies'): Promise<Supplier> {
  return caller.suppliers.create({ companyName: name, email: createEmail(name) });
}

async function createPart(
  caller: AppRouterCaller,
  supplierId: string,
  overrides: Partial<PartCreateInput> = {},
): Promise<Part> {
  return caller.parts.create({
    category: 'Bearings',
    code: 'P-100',
    description: 'Main bearing',
    drawingCode: null,
    finish: 'Zinc',
    name: 'Bearing',
    supplierCode: 'SUP-100',
    supplierId,
    ...overrides,
  });
}

function partNames(parts: Part[]): string[] {
  return parts.map((part) => part.name);
}

describe('parts.create', () => {
  test('rejects unauthenticated part creates', async ({ context }) => {
    await expect(
      context.createAnonCaller().parts.create({
        category: 'Bearings',
        code: 'P-100',
        description: 'Main bearing',
        drawingCode: null,
        finish: 'Zinc',
        name: 'Bearing',
        supplierCode: 'SUP-100',
        supplierId: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('rejects non-admin part creates', async ({ context }) => {
    const supplier = await createSupplier(context.createCaller());

    await expect(
      context.createCaller(mockSession('product-editor')).parts.create({
        category: 'Bearings',
        code: 'P-100',
        description: 'Main bearing',
        drawingCode: null,
        finish: 'Zinc',
        name: 'Bearing',
        supplierCode: 'SUP-100',
        supplierId: supplier.id,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('creates parts with supplier details and records audit events', async ({ context }) => {
    const session = mockSession('admin');
    const caller = context.createCaller(session);
    const supplier = await createSupplier(caller);

    const created = await createPart(caller, supplier.id);

    expect(created).toMatchObject({
      category: 'Bearings',
      code: 'P-100',
      drawingCode: null,
      name: 'Bearing',
      supplier: {
        companyName: 'Acme Supplies',
        id: supplier.id,
      },
      supplierCode: 'SUP-100',
      supplierId: supplier.id,
    });

    const events = await listAuditEvents(context.db);

    expect(events.at(-1)).toMatchObject({
      action: 'created',
      actorUserId: session.user.id,
      changes: null,
      entityId: created.id,
      entityType: 'part',
      summary: 'Created part "Bearing"',
    });
  });

  test('returns conflicts for duplicate codes and duplicate supplier codes per supplier', async ({ context }) => {
    const caller = context.createCaller();
    const supplier = await createSupplier(caller);
    const otherSupplier = await createSupplier(caller, 'Other Supplies');
    await createPart(caller, supplier.id);

    await expect(
      createPart(caller, otherSupplier.id, {
        supplierCode: 'OTHER-100',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A part with this code already exists.',
    });

    await expect(
      createPart(caller, supplier.id, {
        code: 'P-101',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A part with this supplier code already exists for this supplier.',
    });
  });

  test('returns not found for missing suppliers', async ({ context }) => {
    await expect(createPart(context.createCaller(), '00000000-0000-4000-8000-000000000001')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Supplier not found.',
    });
  });
});

describe('parts.bulkImport', () => {
  test('rejects unauthenticated and unauthorized bulk imports', async ({ context }) => {
    await expect(
      context.createAnonCaller().parts.bulkImport({
        rows: [bulkImportRow()],
      }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    await expect(
      context.createCaller(mockSession('product-editor')).parts.bulkImport({
        rows: [bulkImportRow()],
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('bulk imports parts and returns counts', async ({ context }) => {
    const caller = context.createCaller();

    await expect(
      caller.parts.bulkImport({
        rows: [bulkImportRow()],
      }),
    ).resolves.toEqual({
      importedCount: 1,
      updatedCount: 0,
    });

    await expect(
      caller.parts.bulkImport({
        rows: [
          bulkImportRow({
            description: 'Updated main bearing',
          }),
        ],
      }),
    ).resolves.toEqual({
      importedCount: 0,
      updatedCount: 1,
    });
  });

  test('returns public conflict messages for bulk import identity conflicts', async ({ context }) => {
    const caller = context.createCaller();
    await caller.parts.bulkImport({ rows: [bulkImportRow()] });

    await expect(
      caller.parts.bulkImport({
        rows: [
          bulkImportRow({
            supplierCode: 'BET-100',
            supplierName: 'Beta Supplies',
          }),
        ],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A CSV row matches an existing part code with a different supplier or supplier code.',
    });
  });
});

describe('parts.list and parts.categories', () => {
  test('rejects unauthenticated and unauthorized reads', async ({ context }) => {
    await expect(context.createAnonCaller().parts.list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(context.createCaller(mockSession('product-editor')).parts.categories()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('lists, searches, filters, sorts, and returns distinct categories', async ({ context }) => {
    const caller = context.createCaller();
    const acme = await createSupplier(caller, 'Acme Supplies');
    const beta = await createSupplier(caller, 'Beta Supplies');
    await createPart(caller, acme.id, {
      category: 'Bearings',
      code: 'P-100',
      name: 'Bearing',
      supplierCode: 'AC-100',
    });
    await createPart(caller, beta.id, {
      category: 'Fasteners',
      code: 'P-200',
      drawingCode: 'DR-200',
      name: 'Bolt',
      supplierCode: 'BT-200',
    });
    await createPart(caller, acme.id, {
      category: 'Bearings',
      code: 'P-300',
      name: 'Roller',
      supplierCode: 'AC-300',
    });

    const list = await caller.parts.list({
      category: 'Bearings',
      columnFilters: {
        name: 'bearing',
        supplierName: 'acme',
      },
      search: 'bearings',
      sortBy: 'code',
      sortDirection: 'desc',
    });
    const supplierSearch = await caller.parts.list({ search: 'beta' });
    const drawingSearch = await caller.parts.list({ search: 'DR-200' });
    const categories = await caller.parts.categories();

    expect(partNames(list.items)).toEqual(['Bearing']);
    expect(supplierSearch.items.map((part) => part.code)).toEqual(['P-200']);
    expect(drawingSearch.items.map((part) => part.code)).toEqual(['P-200']);
    expect(categories.categories).toEqual(['Bearings', 'Fasteners']);
  });

  test('escapes part list search wildcards', async ({ context }) => {
    const caller = context.createCaller();
    const supplier = await createSupplier(caller);
    await createPart(caller, supplier.id);

    const globalWildcardResult = await caller.parts.list({ search: '_' });
    const nameWildcardResult = await caller.parts.list({ columnFilters: { name: '%' } });
    const supplierNameWildcardResult = await caller.parts.list({ columnFilters: { supplierName: '%' } });

    expect(globalWildcardResult.items).toHaveLength(0);
    expect(nameWildcardResult.items).toHaveLength(0);
    expect(supplierNameWildcardResult.items).toHaveLength(0);
  });
});

describe('parts.get', () => {
  test('gets parts by id', async ({ context }) => {
    const caller = context.createCaller();
    const supplier = await createSupplier(caller);
    const created = await createPart(caller, supplier.id);

    await expect(caller.parts.get({ id: created.id })).resolves.toMatchObject({
      id: created.id,
      name: 'Bearing',
      supplierId: supplier.id,
    });
  });

  test('returns not found for missing parts', async ({ context }) => {
    await expect(
      context.createCaller().parts.get({ id: '00000000-0000-4000-8000-000000000001' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Part not found.',
    });
  });
});

describe('parts.update', () => {
  test('updates parts and records changed fields in audit events', async ({ context }) => {
    const session = mockSession('admin');
    const caller = context.createCaller(session);
    const supplier = await createSupplier(caller);
    const created = await createPart(caller, supplier.id);

    const updated = await caller.parts.update({
      ...created,
      drawingCode: 'DR-100',
      finish: 'Painted',
      name: 'Bearing Assembly',
    });

    expect(updated).toMatchObject({
      drawingCode: 'DR-100',
      finish: 'Painted',
      id: created.id,
      name: 'Bearing Assembly',
    });

    const events = await listAuditEvents(context.db);

    expect(events.at(-1)).toMatchObject({
      action: 'updated',
      actorUserId: session.user.id,
      changes: {
        drawingCode: {
          from: null,
          to: 'DR-100',
        },
        finish: {
          from: 'Zinc',
          to: 'Painted',
        },
        name: {
          from: 'Bearing',
          to: 'Bearing Assembly',
        },
      },
      entityId: created.id,
      entityType: 'part',
      summary: 'Renamed part "Bearing" to "Bearing Assembly"',
    });
  });

  test('returns not found for missing part updates', async ({ context }) => {
    const supplier = await createSupplier(context.createCaller());

    await expect(
      context.createCaller().parts.update({
        category: 'Bearings',
        code: 'P-100',
        description: 'Main bearing',
        drawingCode: null,
        finish: 'Zinc',
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Bearing',
        supplierCode: 'SUP-100',
        supplierId: supplier.id,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Part not found.',
    });
  });
});

async function listAuditEvents(db: Db) {
  return db.select().from(auditEvents).orderBy(auditEvents.occurredAt);
}

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'admin',
    updatedAt: now,
  });
}

function createEmail(companyName: string): string {
  return `${companyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}@example.com`;
}

function bulkImportRow(overrides: Partial<Parameters<AppRouterCaller['parts']['bulkImport']>[0]['rows'][number]> = {}) {
  return {
    category: 'Bearings',
    code: 'P-100',
    description: 'Main bearing',
    drawingCode: null,
    finish: 'Zinc',
    name: 'Bearing',
    supplierCode: 'SUP-100',
    supplierName: 'Acme Supplies',
    ...overrides,
  };
}
