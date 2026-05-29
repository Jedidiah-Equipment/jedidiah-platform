import { auditEvents, type Db, user } from '@pkg/db';
import type { Supplier } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { expectIsoDatetime, mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

const THUMBNAIL_DATA_URL = 'data:image/webp;base64,aaaa';

async function createSupplier(
  caller: AppRouterCaller,
  companyName: string,
  overrides: Partial<Parameters<AppRouterCaller['suppliers']['create']>[0]> = {},
): Promise<Supplier> {
  return caller.suppliers.create({
    companyName,
    email: createEmail(companyName),
    ...overrides,
  });
}

async function createSuppliers(caller: AppRouterCaller, names: string[]): Promise<Supplier[]> {
  const created: Supplier[] = [];

  for (const name of names) {
    created.push(await createSupplier(caller, name));
  }

  return created;
}

function supplierNames(suppliers: Supplier[]): string[] {
  return suppliers.map((supplier) => supplier.companyName);
}

function createEmail(companyName: string): string {
  return `${companyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}@example.com`;
}

describe('suppliers.create', () => {
  test('rejects unauthenticated supplier creates', async ({ context }) => {
    await expect(
      context.createAnonCaller().suppliers.create({
        companyName: 'Anonymous Supplier',
        email: 'anonymous@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('rejects non-admin supplier creates', async ({ context }) => {
    await expect(
      context.createCaller(mockSession('product-editor')).suppliers.create({
        companyName: 'Editor Supplier',
        email: 'editor@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('creates suppliers and records audit events', async ({ context }) => {
    const session = mockSession('admin');
    const caller = context.createCaller(session);
    const created = await createSupplier(caller, 'Acme Supplies', {
      address: '12 Main Road',
      contactPerson: 'Jane Buyer',
      notes: 'Prefers email',
      phone: '+27 11 555 0100',
    });

    expect(created).toMatchObject({
      address: '12 Main Road',
      companyName: 'Acme Supplies',
      contactPerson: 'Jane Buyer',
      email: 'acme-supplies@example.com',
      notes: 'Prefers email',
      phone: '+27 11 555 0100',
    });
    expectIsoDatetime(created.createdAt);
    expectIsoDatetime(created.updatedAt);

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

  test('returns conflict for duplicate supplier company names', async ({ context }) => {
    const caller = context.createCaller();
    await createSupplier(caller, 'Duplicate Supplier');

    await expect(createSupplier(caller, 'Duplicate Supplier')).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A supplier with this name already exists.',
    });
  });

  test('allows duplicate supplier emails', async ({ context }) => {
    const caller = context.createCaller();
    const first = await createSupplier(caller, 'First Supplier', { email: 'duplicate@example.com' });
    const second = await createSupplier(caller, 'Second Supplier', { email: 'duplicate@example.com' });

    expect(first.id).not.toBe(second.id);
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

  test('lists suppliers with default company name sorting', async ({ context }) => {
    const caller = context.createCaller();
    await createSuppliers(caller, ['Zeta Supplies', 'Acme Supplies']);

    const result = await caller.suppliers.list({});

    expect(supplierNames(result.items)).toEqual(['Acme Supplies', 'Zeta Supplies']);
    expect(result.total).toBe(2);
    expect(result.sortBy).toBe('companyName');
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
      sortBy: 'companyName',
      sortDirection: 'asc',
    });

    expect(supplierNames(result.items)).toEqual(['Charlie']);
    expect(result.total).toBe(3);
  });

  test('searches supplier company names, emails, and IDs globally', async ({ context }) => {
    const caller = context.createCaller();
    const acme = await createSupplier(caller, 'Acme Supplies', { email: 'sales@acme.example' });
    const beta = await createSupplier(caller, 'Beta Parts', { email: 'procurement@beta.example' });
    await createSupplier(caller, 'Cargo Works', { email: 'hello@cargo.example' });

    const nameResult = await caller.suppliers.list({ search: 'acme' });
    const emailResult = await caller.suppliers.list({ search: 'procurement' });
    const idResult = await caller.suppliers.list({ search: beta.id.slice(0, 8) });

    expect(nameResult.items.map((supplier) => supplier.id)).toEqual([acme.id]);
    expect(emailResult.items.map((supplier) => supplier.id)).toEqual([beta.id]);
    expect(idResult.items.map((supplier) => supplier.id)).toEqual([beta.id]);
  });

  test('filters and sorts supplier lists by columns', async ({ context }) => {
    const caller = context.createCaller();
    await createSupplier(caller, 'Acme Supplies', { email: 'sales@acme.example' });
    await createSupplier(caller, 'Beta Supplies', { email: 'orders@beta.example' });
    await createSupplier(caller, 'Cargo Works', { email: 'hello@cargo.example' });

    const result = await caller.suppliers.list({
      page: 1,
      pageSize: 10,
      columnFilters: {
        companyName: 'supplies',
      },
      search: '',
      sortBy: 'email',
      sortDirection: 'desc',
    });

    expect(supplierNames(result.items)).toEqual(['Acme Supplies', 'Beta Supplies']);
    expect(result.total).toBe(2);
    expect(result.sortBy).toBe('email');
  });

  test('combines global search and column filters before paging and counting', async ({ context }) => {
    const caller = context.createCaller();
    await createSuppliers(caller, ['Alpha Supplies', 'Bravo Supplies', 'Bravo Parts', 'Charlie Supplies']);

    const result = await caller.suppliers.list({
      page: 1,
      pageSize: 10,
      columnFilters: {
        companyName: 'bravo',
      },
      search: 'supplies',
      sortBy: 'companyName',
      sortDirection: 'asc',
    });

    expect(supplierNames(result.items)).toEqual(['Bravo Supplies']);
    expect(result.total).toBe(1);
  });

  test('escapes supplier list search wildcards', async ({ context }) => {
    const caller = context.createCaller();
    await createSupplier(caller, 'Literal Supplier', { email: 'literal@example.com' });

    const globalWildcardResult = await caller.suppliers.list({ search: '_' });
    const companyWildcardResult = await caller.suppliers.list({ columnFilters: { companyName: '%' } });
    const emailWildcardResult = await caller.suppliers.list({ columnFilters: { email: '_' } });
    const idWildcardResult = await caller.suppliers.list({ columnFilters: { id: '%' } });

    expect(globalWildcardResult.items).toHaveLength(0);
    expect(companyWildcardResult.items).toHaveLength(0);
    expect(emailWildcardResult.items).toHaveLength(0);
    expect(idWildcardResult.items).toHaveLength(0);
  });
});

describe('suppliers.get', () => {
  test('gets suppliers by id', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createSupplier(caller, 'Acme Supplies');

    await expect(caller.suppliers.get({ id: created.id })).resolves.toMatchObject({
      companyName: 'Acme Supplies',
      id: created.id,
    });
  });

  test('returns supplier thumbnails from get and list', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createSupplier(caller, 'Thumbnail Supplier', { thumbnailDataUrl: THUMBNAIL_DATA_URL });

    await expect(caller.suppliers.get({ id: created.id })).resolves.toMatchObject({
      id: created.id,
      thumbnailDataUrl: THUMBNAIL_DATA_URL,
    });

    await expect(caller.suppliers.list({ search: 'Thumbnail' })).resolves.toMatchObject({
      items: [
        {
          id: created.id,
          thumbnailDataUrl: THUMBNAIL_DATA_URL,
        },
      ],
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
        companyName: 'Anonymous Supplier',
        email: 'anonymous@example.com',
        id: '00000000-0000-4000-8000-000000000001',
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
        companyName: 'Editor Supplier Plus',
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
      address: '12 Main Road',
      companyName: 'Acme Supplies Ltd',
      contactPerson: 'Jane Buyer',
      email: 'sales@acme.example',
      id: created.id,
      notes: null,
      phone: '+27 11 555 0100',
    });

    expect(updated).toMatchObject({
      address: '12 Main Road',
      companyName: 'Acme Supplies Ltd',
      contactPerson: 'Jane Buyer',
      email: 'sales@acme.example',
      id: created.id,
      phone: '+27 11 555 0100',
    });
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());

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
          address: {
            from: null,
            to: '12 Main Road',
          },
          companyName: {
            from: 'Acme Supplies',
            to: 'Acme Supplies Ltd',
          },
          contactPerson: {
            from: null,
            to: 'Jane Buyer',
          },
          email: {
            from: 'acme-supplies@example.com',
            to: 'sales@acme.example',
          },
          phone: {
            from: null,
            to: '+27 11 555 0100',
          },
        },
        entityId: created.id,
        entityType: 'supplier',
        summary: 'Renamed supplier "Acme Supplies" to "Acme Supplies Ltd"',
      },
    ]);
  });

  test('stores blank optional fields as null on update', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createSupplier(caller, 'Blank Supplier', {
      address: 'Known address',
      contactPerson: 'Known person',
      notes: 'Known notes',
      phone: 'Known phone',
    });

    const updated = await caller.suppliers.update({
      address: ' ',
      companyName: created.companyName,
      contactPerson: '',
      email: created.email,
      id: created.id,
      notes: ' ',
      phone: '',
    });

    expect(updated).toMatchObject({
      address: null,
      contactPerson: null,
      notes: null,
      phone: null,
    });
  });

  test('updates and removes supplier thumbnails with audit changes', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createSupplier(caller, 'Thumbnail Audit Supplier', { thumbnailDataUrl: THUMBNAIL_DATA_URL });

    const updated = await caller.suppliers.update({
      ...created,
      thumbnailDataUrl: null,
    });

    expect(updated.thumbnailDataUrl).toBeNull();

    const events = await listAuditEvents(context.db);
    expect(events.at(-1)).toMatchObject({
      action: 'updated',
      changes: {
        thumbnailDataUrl: {
          from: THUMBNAIL_DATA_URL,
          to: null,
        },
      },
      entityId: created.id,
      entityType: 'supplier',
    });
  });

  test('returns conflict for duplicate supplier company name updates', async ({ context }) => {
    const caller = context.createCaller();
    const first = await createSupplier(caller, 'First Supplier');
    await createSupplier(caller, 'Second Supplier');

    await expect(
      caller.suppliers.update({
        ...first,
        companyName: 'Second Supplier',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'A supplier with this name already exists.',
    });
  });

  test('returns not found for missing supplier updates', async ({ context }) => {
    await expect(
      context.createCaller().suppliers.update({
        companyName: 'Missing',
        email: 'missing@example.com',
        id: '00000000-0000-4000-8000-000000000001',
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
