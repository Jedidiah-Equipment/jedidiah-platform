import { auditEvents, type Db, user } from '@pkg/db';
import type { Supplier } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

async function createSupplier(caller: AppRouterCaller, name: string): Promise<Supplier> {
  return caller.suppliers.create({ name });
}

async function createSuppliers(caller: AppRouterCaller, names: string[]): Promise<Supplier[]> {
  const created: Supplier[] = [];

  for (const name of names) {
    created.push(await createSupplier(caller, name));
  }

  return created;
}

function supplierNames(suppliers: Supplier[]): string[] {
  return suppliers.map((supplier) => supplier.name);
}

describe('suppliers.create', () => {
  test('rejects unauthenticated supplier creates', async ({ context }) => {
    await expect(context.createAnonCaller().suppliers.create({ name: 'Anonymous Supplier' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('rejects non-admin supplier creates', async ({ context }) => {
    await expect(
      context.createCaller(mockSession('product-editor')).suppliers.create({ name: 'Editor Supplier' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('creates suppliers and records audit events', async ({ context }) => {
    const session = mockSession('admin');
    const caller = context.createCaller(session);
    const created = await createSupplier(caller, 'Acme Supplies');

    expect(created).toMatchObject({
      name: 'Acme Supplies',
    });

    const events = await listAuditEvents(context.db);

    expect(events).toMatchObject([
      {
        action: 'created',
        actorUserId: session.user.id,
        changes: null,
        entityId: created.id,
        entityType: 'supplier',
        summary: 'Created supplier "Acme Supplies"',
      },
    ]);
  });

  test('returns conflict for duplicate supplier names', async ({ context }) => {
    const caller = context.createCaller();
    await createSupplier(caller, 'Duplicate Supplier');

    await expect(createSupplier(caller, 'Duplicate Supplier')).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A supplier with this name already exists.',
    });
  });
});

describe('suppliers.list', () => {
  test('rejects unauthenticated supplier lists', async ({ context }) => {
    await expect(context.createAnonCaller().suppliers.list({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('rejects non-admin supplier lists', async ({ context }) => {
    await expect(context.createCaller(mockSession('product-editor')).suppliers.list({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('lists suppliers with default name sorting', async ({ context }) => {
    const caller = context.createCaller();
    await createSuppliers(caller, ['Zeta Supplies', 'Acme Supplies']);

    const result = await caller.suppliers.list({});

    expect(supplierNames(result.items)).toEqual(['Acme Supplies', 'Zeta Supplies']);
    expect(result.total).toBe(2);
    expect(result.sortBy).toBe('name');
    expect(result.sortDirection).toBe('asc');
  });

  test('pages and sorts suppliers', async ({ context }) => {
    const caller = context.createCaller();
    await createSuppliers(caller, ['Alpha', 'Bravo', 'Charlie']);

    const result = await caller.suppliers.list({
      page: 2,
      pageSize: 2,
      columnFilters: {},
      search: '',
      sortBy: 'name',
      sortDirection: 'asc',
    });

    expect(supplierNames(result.items)).toEqual(['Charlie']);
    expect(result.total).toBe(3);
  });

  test('searches supplier names and IDs globally', async ({ context }) => {
    const caller = context.createCaller();
    const acme = await createSupplier(caller, 'Acme Supplies');
    const beta = await createSupplier(caller, 'Beta Parts');
    await createSupplier(caller, 'Cargo Works');

    const nameResult = await caller.suppliers.list({ search: 'acme' });
    const idResult = await caller.suppliers.list({ search: beta.id.slice(0, 8) });

    expect(nameResult.items.map((supplier) => supplier.id)).toEqual([acme.id]);
    expect(idResult.items.map((supplier) => supplier.id)).toEqual([beta.id]);
  });

  test('filters and sorts supplier lists by columns', async ({ context }) => {
    const caller = context.createCaller();
    await createSupplier(caller, 'Acme Supplies');
    await createSupplier(caller, 'Beta Supplies');
    await createSupplier(caller, 'Cargo Works');

    const result = await caller.suppliers.list({
      page: 1,
      pageSize: 10,
      columnFilters: {
        name: 'supplies',
      },
      search: '',
      sortBy: 'name',
      sortDirection: 'desc',
    });

    expect(supplierNames(result.items)).toEqual(['Beta Supplies', 'Acme Supplies']);
    expect(result.total).toBe(2);
  });

  test('combines global search and column filters before paging and counting', async ({ context }) => {
    const caller = context.createCaller();
    await createSuppliers(caller, ['Alpha Supplies', 'Bravo Supplies', 'Bravo Parts', 'Charlie Supplies']);

    const result = await caller.suppliers.list({
      page: 1,
      pageSize: 10,
      columnFilters: {
        name: 'bravo',
      },
      search: 'supplies',
      sortBy: 'name',
      sortDirection: 'asc',
    });

    expect(supplierNames(result.items)).toEqual(['Bravo Supplies']);
    expect(result.total).toBe(1);
  });

  test('escapes supplier list search wildcards', async ({ context }) => {
    const caller = context.createCaller();
    await createSupplier(caller, 'Literal Supplier');

    const globalWildcardResult = await caller.suppliers.list({ search: '_' });
    const nameWildcardResult = await caller.suppliers.list({ columnFilters: { name: '%' } });
    const idWildcardResult = await caller.suppliers.list({ columnFilters: { id: '%' } });

    expect(globalWildcardResult.items).toHaveLength(0);
    expect(nameWildcardResult.items).toHaveLength(0);
    expect(idWildcardResult.items).toHaveLength(0);
  });
});

describe('suppliers.get', () => {
  test('gets suppliers by id', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createSupplier(caller, 'Acme Supplies');

    await expect(caller.suppliers.get({ id: created.id })).resolves.toMatchObject({
      id: created.id,
      name: 'Acme Supplies',
    });
  });

  test('returns not found for missing suppliers', async ({ context }) => {
    await expect(
      context.createCaller().suppliers.get({ id: '00000000-0000-4000-8000-000000000001' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Supplier not found.',
    });
  });
});

describe('suppliers.update', () => {
  test('rejects unauthenticated supplier updates', async ({ context }) => {
    await expect(
      context.createAnonCaller().suppliers.update({
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Anonymous Supplier',
      }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('rejects non-admin supplier updates', async ({ context }) => {
    const adminCaller = context.createCaller();
    const editorCaller = context.createCaller(mockSession('product-editor'));
    const created = await createSupplier(adminCaller, 'Editor Supplier');

    await expect(
      editorCaller.suppliers.update({
        ...created,
        name: 'Editor Supplier Plus',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('updates suppliers and records changed fields in audit events', async ({ context }) => {
    const session = mockSession('admin');
    const caller = context.createCaller(session);
    const created = await createSupplier(caller, 'Acme Supplies');

    const updated = await caller.suppliers.update({
      id: created.id,
      name: 'Acme Supplies Ltd',
    });

    expect(updated).toMatchObject({
      id: created.id,
      name: 'Acme Supplies Ltd',
    });

    const events = await listAuditEvents(context.db);

    expect(events).toMatchObject([
      {
        action: 'created',
        changes: null,
      },
      {
        action: 'updated',
        actorUserId: session.user.id,
        changes: {
          name: {
            from: 'Acme Supplies',
            to: 'Acme Supplies Ltd',
          },
        },
        entityId: created.id,
        entityType: 'supplier',
        summary: 'Renamed supplier "Acme Supplies" to "Acme Supplies Ltd"',
      },
    ]);
  });

  test('returns conflict for duplicate supplier name updates', async ({ context }) => {
    const caller = context.createCaller();
    const first = await createSupplier(caller, 'First Supplier');
    await createSupplier(caller, 'Second Supplier');

    await expect(
      caller.suppliers.update({
        id: first.id,
        name: 'Second Supplier',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A supplier with this name already exists.',
    });
  });

  test('returns not found for missing supplier updates', async ({ context }) => {
    await expect(
      context.createCaller().suppliers.update({
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Missing',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Supplier not found.',
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
