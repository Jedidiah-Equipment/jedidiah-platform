import { auditEvents, type Db, user } from '@pkg/db';
import type { Customer } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { type AppRouterCaller, createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

async function createCustomer(
  caller: AppRouterCaller,
  companyName: string,
  overrides: Partial<Parameters<AppRouterCaller['customers']['create']>[0]> = {},
): Promise<Customer> {
  return caller.customers.create({
    companyName,
    email: createEmail(companyName),
    ...overrides,
  });
}

async function createCustomers(caller: AppRouterCaller, names: string[]): Promise<Customer[]> {
  const created: Customer[] = [];

  for (const name of names) {
    created.push(await createCustomer(caller, name));
  }

  return created;
}

function customerNames(customers: Customer[]): string[] {
  return customers.map((customer) => customer.companyName);
}

function createEmail(companyName: string): string {
  return `${companyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}@example.com`;
}

describe('customers.create', () => {
  test('rejects unauthenticated customer creates', async ({ context }) => {
    await expect(
      context.createAnonCaller().customers.create({
        companyName: 'Anonymous Customer',
        email: 'anonymous@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('rejects non-admin customer creates', async ({ context }) => {
    await expect(
      context.createCaller(mockSession('product-editor')).customers.create({
        companyName: 'Editor Customer',
        email: 'editor@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('creates customers and records audit events', async ({ context }) => {
    const session = mockSession('admin');
    const caller = context.createCaller(session);
    const created = await createCustomer(caller, 'Acme Mining', {
      address: '12 Main Road',
      contactPerson: 'Jane Buyer',
      notes: 'Prefers email',
      phone: '+27 11 555 0100',
    });

    expect(created).toMatchObject({
      address: '12 Main Road',
      companyName: 'Acme Mining',
      contactPerson: 'Jane Buyer',
      email: 'acme-mining@example.com',
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
        entityType: 'customer',
        summary: 'Created customer "Acme Mining"',
      },
    ]);
  });

  test('allows duplicate company names and emails', async ({ context }) => {
    const caller = context.createCaller();
    const first = await createCustomer(caller, 'Duplicate Customer', { email: 'duplicate@example.com' });
    const second = await createCustomer(caller, 'Duplicate Customer', { email: 'duplicate@example.com' });

    expect(first.id).not.toBe(second.id);
  });
});

describe('customers.list', () => {
  test('rejects unauthenticated customer lists', async ({ context }) => {
    await expect(context.createAnonCaller().customers.list({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('rejects non-admin customer lists', async ({ context }) => {
    await expect(context.createCaller(mockSession('product-viewer')).customers.list({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('lists customers with default company name sorting', async ({ context }) => {
    const caller = context.createCaller();
    await createCustomers(caller, ['Zeta Mining', 'Acme Mining']);

    const result = await caller.customers.list({});

    expect(customerNames(result.items)).toEqual(['Acme Mining', 'Zeta Mining']);
    expect(result.total).toBe(2);
    expect(result.sortBy).toBe('companyName');
    expect(result.sortDirection).toBe('asc');
  });

  test('pages and sorts customers', async ({ context }) => {
    const caller = context.createCaller();
    await createCustomers(caller, ['Alpha', 'Bravo', 'Charlie']);

    const result = await caller.customers.list({
      page: 2,
      pageSize: 2,
      columnFilters: {},
      search: '',
      sortBy: 'companyName',
      sortDirection: 'asc',
    });

    expect(customerNames(result.items)).toEqual(['Charlie']);
    expect(result.total).toBe(3);
  });

  test('searches customer company names, emails, and IDs globally', async ({ context }) => {
    const caller = context.createCaller();
    const acme = await createCustomer(caller, 'Acme Mining', { email: 'sales@acme.example' });
    const beta = await createCustomer(caller, 'Beta Quarries', { email: 'procurement@beta.example' });
    await createCustomer(caller, 'Cargo Works', { email: 'hello@cargo.example' });

    const nameResult = await caller.customers.list({ search: 'acme' });
    const emailResult = await caller.customers.list({ search: 'procurement' });
    const idResult = await caller.customers.list({ search: beta.id.slice(0, 8) });

    expect(nameResult.items.map((customer) => customer.id)).toEqual([acme.id]);
    expect(emailResult.items.map((customer) => customer.id)).toEqual([beta.id]);
    expect(idResult.items.map((customer) => customer.id)).toEqual([beta.id]);
  });

  test('filters and sorts customer lists by columns', async ({ context }) => {
    const caller = context.createCaller();
    await createCustomer(caller, 'Acme Mining', { email: 'sales@acme.example' });
    await createCustomer(caller, 'Beta Mining', { email: 'orders@beta.example' });
    await createCustomer(caller, 'Cargo Works', { email: 'hello@cargo.example' });

    const result = await caller.customers.list({
      page: 1,
      pageSize: 10,
      columnFilters: {
        companyName: 'mining',
      },
      search: '',
      sortBy: 'email',
      sortDirection: 'desc',
    });

    expect(customerNames(result.items)).toEqual(['Acme Mining', 'Beta Mining']);
    expect(result.total).toBe(2);
    expect(result.sortBy).toBe('email');
  });

  test('combines global search and column filters before paging and counting', async ({ context }) => {
    const caller = context.createCaller();
    await createCustomers(caller, ['Alpha Mining', 'Bravo Mining', 'Bravo Quarry', 'Charlie Mining']);

    const result = await caller.customers.list({
      page: 1,
      pageSize: 10,
      columnFilters: {
        companyName: 'bravo',
      },
      search: 'mining',
      sortBy: 'companyName',
      sortDirection: 'asc',
    });

    expect(customerNames(result.items)).toEqual(['Bravo Mining']);
    expect(result.total).toBe(1);
  });

  test('escapes customer list search wildcards', async ({ context }) => {
    const caller = context.createCaller();
    await createCustomer(caller, 'Literal Customer', { email: 'literal@example.com' });

    const globalWildcardResult = await caller.customers.list({ search: '_' });
    const companyWildcardResult = await caller.customers.list({ columnFilters: { companyName: '%' } });
    const emailWildcardResult = await caller.customers.list({ columnFilters: { email: '_' } });
    const idWildcardResult = await caller.customers.list({ columnFilters: { id: '%' } });

    expect(globalWildcardResult.items).toHaveLength(0);
    expect(companyWildcardResult.items).toHaveLength(0);
    expect(emailWildcardResult.items).toHaveLength(0);
    expect(idWildcardResult.items).toHaveLength(0);
  });
});

describe('customers.get', () => {
  test('gets customers by id', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createCustomer(caller, 'Acme Mining');

    await expect(caller.customers.get({ id: created.id })).resolves.toMatchObject({
      companyName: 'Acme Mining',
      id: created.id,
    });
  });

  test('returns not found for missing customers', async ({ context }) => {
    await expect(
      context.createCaller().customers.get({ id: '00000000-0000-4000-8000-000000000001' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Customer not found.',
    });
  });
});

describe('customers.update', () => {
  test('rejects unauthenticated customer updates', async ({ context }) => {
    await expect(
      context.createAnonCaller().customers.update({
        companyName: 'Anonymous Customer',
        email: 'anonymous@example.com',
        id: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('rejects non-admin customer updates', async ({ context }) => {
    const adminCaller = context.createCaller();
    const editorCaller = context.createCaller(mockSession('product-editor'));
    const created = await createCustomer(adminCaller, 'Editor Customer');

    await expect(
      editorCaller.customers.update({
        ...created,
        companyName: 'Editor Customer Plus',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('updates customers and records changed fields in audit events', async ({ context }) => {
    const session = mockSession('admin');
    const caller = context.createCaller(session);
    const created = await createCustomer(caller, 'Acme Mining');

    const updated = await caller.customers.update({
      address: '12 Main Road',
      companyName: 'Acme Mining Ltd',
      contactPerson: 'Jane Buyer',
      email: 'sales@acme.example',
      id: created.id,
      notes: null,
      phone: '+27 11 555 0100',
    });

    expect(updated).toMatchObject({
      address: '12 Main Road',
      companyName: 'Acme Mining Ltd',
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
            from: 'Acme Mining',
            to: 'Acme Mining Ltd',
          },
          contactPerson: {
            from: null,
            to: 'Jane Buyer',
          },
          email: {
            from: 'acme-mining@example.com',
            to: 'sales@acme.example',
          },
          phone: {
            from: null,
            to: '+27 11 555 0100',
          },
        },
        entityId: created.id,
        entityType: 'customer',
        summary: 'Renamed customer "Acme Mining" to "Acme Mining Ltd"',
      },
    ]);
  });

  test('stores blank optional fields as null on update', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createCustomer(caller, 'Blank Customer', {
      address: 'Known address',
      contactPerson: 'Known person',
      notes: 'Known notes',
      phone: 'Known phone',
    });

    const updated = await caller.customers.update({
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

  test('returns not found for missing customer updates', async ({ context }) => {
    await expect(
      context.createCaller().customers.update({
        companyName: 'Missing',
        email: 'missing@example.com',
        id: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Customer not found.',
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

function expectIsoDatetime(value: string) {
  expect(new Date(value).toISOString()).toBe(value);
}
