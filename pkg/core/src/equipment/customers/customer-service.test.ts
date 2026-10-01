import { auditEvents, type Db, sql, user } from '@pkg/db';
import { customers, jobs, products, productUnitOwnershipTransfers, quotes } from '@pkg/db/equipment';
import { getPlantDateNow } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { CustomerCreateInput, QuoteCreateInput } from '@pkg/schema/equipment';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { getQuote } from '../quotes/quote-read-service.js';
import { cancelQuote, createQuote } from '../quotes/quote-service.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { getProductUnit } from '../units/product-unit-read-service.js';
import { reassignProductUnitToQuote } from '../units/product-unit-reassignment.js';
import {
  createProductUnit,
  lockUnitForOwnership,
  quoteEverPlacedAUnit,
  transferProductUnitOwnership,
} from '../units/product-unit-service.js';
import {
  createCustomer,
  getCustomer,
  getCustomerMergePreview,
  mapCustomer,
  mergeCustomer,
  patchCustomer,
} from './customer-service.js';

const test = createTester(async ({ db }) => {
  const now = new Date();
  await db.insert(user).values({
    createdAt: now,
    email: 'actor@example.com',
    emailVerified: true,
    id: 'actor-user-id',
    name: 'Actor User',
    role: 'admin',
    quoteSalesperson: true,
    updatedAt: now,
  });

  return { db };
});

describe('patchCustomer', () => {
  test('changes only the named field and leaves the rest untouched', async ({ context }) => {
    const created = await createCustomer({
      actorUserId: 'actor-user-id',
      db: context.db,
      input: CustomerCreateInput.parse({
        address: '1 Quarry Road',
        companyName: 'Acme Mining',
        contactPerson: 'Jane Buyer',
        email: 'old@acme.example',
        notes: 'Needs follow-up',
        phone: '+27123456789',
        vatNumber: 'VAT-123',
      }),
    });

    const updated = await patchCustomer({
      actorUserId: 'actor-user-id',
      db: context.db,
      input: { id: created.id, email: 'new@acme.example' },
    });

    expect(updated.email).toBe('new@acme.example');
    expect(updated.address).toBe('1 Quarry Road');
    expect(updated.contactPerson).toBe('Jane Buyer');
    expect(updated.phone).toBe('+27123456789');
    expect(updated.notes).toBe('Needs follow-up');
    expect(updated.vatNumber).toBe('VAT-123');
    expect(updated.companyName).toBe('Acme Mining');
  });

  test('clears a nullable field on an explicit null', async ({ context }) => {
    const created = await createCustomer({
      actorUserId: 'actor-user-id',
      db: context.db,
      input: CustomerCreateInput.parse({ companyName: 'Acme Mining', notes: 'Remove me' }),
    });

    const updated = await patchCustomer({
      actorUserId: 'actor-user-id',
      db: context.db,
      input: { id: created.id, notes: null },
    });

    expect(updated.notes).toBeNull();
    expect(updated.companyName).toBe('Acme Mining');
  });
});

describe('mapCustomer', () => {
  it('maps customer rows to customer DTOs', () => {
    const createdAt = new Date('2026-05-17T10:00:00.000Z');
    const updatedAt = new Date('2026-05-17T11:00:00.000Z');

    expect(
      mapCustomer({
        address: '12 Main Road',
        companyName: 'Acme Mining',
        contactPerson: 'Jane Buyer',
        createdAt,
        email: 'sales@acme.example',
        id: '00000000-0000-4000-8000-000000000001',
        notes: null,
        phone: '+27 11 555 0100',
        thumbnailDataUrl: null,
        updatedAt,
        vatNumber: 'VAT-123456',
      }),
    ).toEqual({
      address: '12 Main Road',
      companyName: 'Acme Mining',
      contactPerson: 'Jane Buyer',
      createdAt: createdAt.toISOString(),
      email: 'sales@acme.example',
      id: '00000000-0000-4000-8000-000000000001',
      notes: null,
      phone: '+27 11 555 0100',
      thumbnailDataUrl: null,
      updatedAt: updatedAt.toISOString(),
      vatNumber: 'VAT-123456',
    });
  });
});

describe('Customer removal constraints', () => {
  test('requires the merge to know every Customer reference and keeps them restrictive', async ({ context }) => {
    const foreignKeys = await context.db.execute<{
      deleteAction: string;
      name: string;
    }>(sql`
      select
        constraint_name as "name",
        delete_rule as "deleteAction"
      from information_schema.referential_constraints
      where unique_constraint_schema = 'equipment'
        and unique_constraint_name = 'customers_pkey'
      order by constraint_name
    `);

    const references = await context.db.execute<{ table: string; column: string }>(sql`
      select kcu.table_name as "table", kcu.column_name as "column"
      from information_schema.key_column_usage kcu
      join information_schema.referential_constraints rc
        on rc.constraint_schema = kcu.constraint_schema and rc.constraint_name = kcu.constraint_name
      where rc.unique_constraint_schema = 'equipment' and rc.unique_constraint_name = 'customers_pkey'
      order by kcu.table_name, kcu.column_name
    `);
    expect([...references]).toEqual([
      { table: 'product_unit_ownership_transfer', column: 'from_customer_id' },
      { table: 'product_unit_ownership_transfer', column: 'to_customer_id' },
      { table: 'quote', column: 'customer_id' },
    ]);
    expect(foreignKeys.every((foreignKey) => foreignKey.deleteAction === 'RESTRICT')).toBe(true);
  });
});

describe('mergeCustomer', () => {
  test('fills empty survivor contact fields, preserves populated values, and audits both Customers', async ({
    context,
  }) => {
    const db = context.db;
    const source = await createCustomer({
      actorUserId: 'actor-user-id',
      db,
      input: CustomerCreateInput.parse({
        companyName: 'Duplicate',
        email: 'duplicate@example.com',
        vatNumber: 'VAT-123',
        address: '1 Quarry Road',
        contactPerson: 'Jane',
        phone: '123',
        notes: 'Source notes',
        thumbnailDataUrl: 'data:image/webp;base64,aaaa',
      }),
    });
    const target = await createCustomer({
      actorUserId: 'actor-user-id',
      db,
      input: CustomerCreateInput.parse({
        companyName: 'Survivor',
        notes: 'Keep notes',
      }),
    });
    await db.update(customers).set({ phone: '   ' }).where(eq(customers.id, target.id));
    const merged = await mergeCustomer({
      actorUserId: 'actor-user-id',
      db,
      input: { sourceId: source.id, targetId: target.id },
    });
    expect(merged).toMatchObject({
      id: target.id,
      companyName: 'Survivor',
      email: 'duplicate@example.com',
      vatNumber: 'VAT-123',
      address: '1 Quarry Road',
      contactPerson: 'Jane',
      phone: '123',
      notes: 'Keep notes',
      thumbnailDataUrl: 'data:image/webp;base64,aaaa',
    });
    await expect(getCustomer({ db, id: source.id })).rejects.toMatchObject({ code: 'customer.not_found' });
    const events = await db.select().from(auditEvents).orderBy(auditEvents.occurredAt);
    expect(events.filter((e) => e.entityId === source.id).map((e) => e.action)).toEqual(['created', 'merged']);
    expect(events.filter((e) => e.entityId === target.id).map((e) => e.action)).toEqual([
      'created',
      'updated',
      'merged',
    ]);
    expect(events.filter((e) => e.action === 'merged')).toMatchObject([
      {
        entityId: source.id,
        changes: {
          mergedIntoCustomer: { from: 'Duplicate', to: 'Survivor' },
          movedQuotes: { from: null, to: 0 },
          movedUnits: { from: null, to: 0 },
        },
      },
      {
        entityId: target.id,
        changes: {
          absorbedCustomer: { from: 'Duplicate', to: 'Survivor' },
          movedQuotes: { from: null, to: 0 },
          movedUnits: { from: null, to: 0 },
        },
      },
    ]);
  });
});

test('keeps the MRB reassignment history, Owner and both Quotes locked after merge', async ({ context }) => {
  const db = context.db;
  const source = await makeCustomer(db, 'MRB Farming');
  const target = await makeCustomer(db, 'MRB Farming');
  const productId = await makeProduct(db);
  const qa = await makeQuote(db, source.id, productId);
  const qb = await makeQuote(db, target.id, productId);
  const unit = await db.transaction((tx) =>
    createProductUnit({
      actorUserId: 'actor-user-id',
      initialOwner: { customerId: source.id, sourceQuoteId: qa },
      plantToday: getPlantDateNow(),
      productId,
      tx,
    }),
  );
  await db.insert(jobs).values({ productUnitId: unit.id, quoteId: qa });
  await reassignProductUnitToQuote({
    actorUserId: 'actor-user-id',
    db,
    input: { productUnitId: unit.id, toQuoteId: qb, note: 'MRB deal reassignment' },
  });
  const before = await db.select().from(productUnitOwnershipTransfers).orderBy(productUnitOwnershipTransfers.createdAt);
  await mergeCustomer({ actorUserId: 'actor-user-id', db, input: { sourceId: source.id, targetId: target.id } });
  const after = await db.select().from(productUnitOwnershipTransfers).orderBy(productUnitOwnershipTransfers.createdAt);
  expect(after).toEqual(
    before.map((row) => ({
      ...row,
      fromCustomerId: row.fromCustomerId === source.id ? target.id : row.fromCustomerId,
      toCustomerId: row.toCustomerId === source.id ? target.id : row.toCustomerId,
    })),
  );
  expect(after).toMatchObject([
    { fromCustomerId: null, toCustomerId: target.id, sourceQuoteId: qa },
    { fromCustomerId: target.id, toCustomerId: target.id, sourceQuoteId: qb },
  ]);
  await expect(getProductUnit({ db, id: unit.id })).resolves.toMatchObject({ owner: { id: target.id } });
  await expect(
    transferProductUnitOwnership({
      actorUserId: 'actor-user-id',
      db,
      input: { id: unit.id, toCustomerId: target.id, occurredOn: getPlantDateNow(), note: null },
    }),
  ).rejects.toMatchObject({ code: 'product_unit.owner_unchanged' });
  for (const quoteId of [qa, qb])
    await expect(db.transaction((tx) => quoteEverPlacedAUnit({ quoteId, db: tx }))).resolves.toBe(true);
});

async function makeCustomer(db: Db, companyName: string) {
  return createCustomer({ actorUserId: 'actor-user-id', db, input: CustomerCreateInput.parse({ companyName }) });
}
async function makeProduct(db: Db): Promise<UUID> {
  const [row] = await db
    .insert(products)
    .values({
      basePrice: 1000,
      buildTimeDays: 14,
      modelCode: 'MERGE',
      name: 'Merge Product',
      rangeId: await createProductRangeFixture(db),
    })
    .returning();
  if (!row) throw new Error('Missing product');
  return row.id;
}
async function makeQuote(
  db: Db,
  customerId: UUID,
  productId: UUID,
  status: 'draft' | 'sent' | 'accepted' | 'cancelled' = 'accepted',
): Promise<UUID> {
  const [row] = await db
    .insert(quotes)
    .values({
      customerId,
      productId,
      status,
      quotedBasePrice: 1000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'actor-user-id',
      cancellationReason: status === 'cancelled' ? 'Test cancellation' : null,
    })
    .returning();
  if (!row) throw new Error('Missing quote');
  return row.id;
}

test('moves every Quote status and counts only Units currently owned in preview and audit', async ({ context }) => {
  const db = context.db;
  const source = await makeCustomer(db, 'Duplicate');
  const target = await makeCustomer(db, 'Survivor');
  const third = await makeCustomer(db, 'Third');
  const productId = await makeProduct(db);
  const quoteIds: UUID[] = [];
  for (const status of ['draft', 'sent', 'accepted', 'cancelled'] as const)
    quoteIds.push(await makeQuote(db, source.id, productId, status));
  const owned = await db.transaction((tx) =>
    createProductUnit({
      actorUserId: 'actor-user-id',
      initialOwner: { customerId: source.id, sourceQuoteId: quoteIds[2] as UUID },
      plantToday: getPlantDateNow(),
      productId,
      tx,
    }),
  );
  const sold = await db.transaction((tx) =>
    createProductUnit({
      actorUserId: 'actor-user-id',
      initialOwner: { customerId: source.id, sourceQuoteId: quoteIds[0] as UUID },
      plantToday: getPlantDateNow(),
      productId,
      tx,
    }),
  );
  await db.transaction(async (tx) => {
    const ownership = await lockUnitForOwnership(tx, sold.id);
    if (!ownership) throw new Error('Missing Unit');
    await ownership.record({
      actorUserId: 'actor-user-id',
      occurredOn: getPlantDateNow(),
      sourceQuoteId: null,
      toCustomerId: third.id,
    });
  });
  await expect(getCustomerMergePreview({ db, sourceId: source.id })).resolves.toEqual({ quoteCount: 4, unitCount: 1 });
  await mergeCustomer({ actorUserId: 'actor-user-id', db, input: { sourceId: source.id, targetId: target.id } });
  for (const id of quoteIds) await expect(getQuote({ db, id })).resolves.toMatchObject({ customerId: target.id });
  await expect(getProductUnit({ db, id: owned.id })).resolves.toMatchObject({ owner: { id: target.id } });
  await expect(getProductUnit({ db, id: sold.id })).resolves.toMatchObject({ owner: { id: third.id } });
  const events = await db.select().from(auditEvents).where(eq(auditEvents.action, 'merged'));
  expect(events).toHaveLength(2);
  for (const event of events)
    expect(event.changes).toMatchObject({ movedQuotes: { from: null, to: 4 }, movedUnits: { from: null, to: 1 } });
  expect(
    await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'updated'), eq(auditEvents.entityId, target.id))),
  ).toHaveLength(0);
});

test('preserves the vacated survivor Quote lock when a Unit moves on to a third Customer', async ({ context }) => {
  const db = context.db;
  const source = await makeCustomer(db, 'Duplicate');
  const target = await makeCustomer(db, 'Survivor');
  const third = await makeCustomer(db, 'Third');
  const productId = await makeProduct(db);
  const qa = await makeQuote(db, source.id, productId);
  const qb = await makeQuote(db, target.id, productId);
  const qc = await makeQuote(db, third.id, productId);
  const unit = await db.transaction((tx) =>
    createProductUnit({
      actorUserId: 'actor-user-id',
      initialOwner: { customerId: source.id, sourceQuoteId: qa },
      plantToday: getPlantDateNow(),
      productId,
      tx,
    }),
  );
  await db.insert(jobs).values({ productUnitId: unit.id, quoteId: qa });
  for (const toQuoteId of [qb, qc])
    await reassignProductUnitToQuote({
      actorUserId: 'actor-user-id',
      db,
      input: { productUnitId: unit.id, toQuoteId, note: null },
    });
  await mergeCustomer({ actorUserId: 'actor-user-id', db, input: { sourceId: source.id, targetId: target.id } });
  await expect(getQuote({ db, id: qb })).resolves.toMatchObject({ hasEverSourcedJob: true, job: null });
  await expect(getProductUnit({ db, id: unit.id })).resolves.toMatchObject({ owner: { id: third.id } });
});

test('still reverses an Allocation sale to Stock when its Customer was merged', async ({ context }) => {
  const db = context.db;
  const source = await makeCustomer(db, 'Duplicate');
  const target = await makeCustomer(db, 'Survivor');
  const productId = await makeProduct(db);
  const unit = await db.transaction((tx) =>
    createProductUnit({
      actorUserId: 'actor-user-id',
      initialOwner: null,
      plantToday: getPlantDateNow(),
      productId,
      tx,
    }),
  );
  await db.insert(jobs).values({ productUnitId: unit.id, completedOn: getPlantDateNow() });
  const quote = await createQuote({
    actorUserId: 'actor-user-id',
    db,
    input: QuoteCreateInput.parse({
      customer: { type: 'existing', customerId: source.id },
      offering: { kind: 'product', productId, productUnitId: unit.id },
      salesPersonId: 'actor-user-id',
      status: 'accepted',
    }),
  });
  await mergeCustomer({ actorUserId: 'actor-user-id', db, input: { sourceId: source.id, targetId: target.id } });
  await cancelQuote({
    actorUserId: 'actor-user-id',
    db,
    id: quote.id,
    cancellationReason: 'Sale fell through',
    mayCancelLockedQuote: true,
  });
  await expect(getProductUnit({ db, id: unit.id })).resolves.toMatchObject({ owner: null });
  const transfers = await db
    .select()
    .from(productUnitOwnershipTransfers)
    .orderBy(productUnitOwnershipTransfers.createdAt);
  expect(transfers).toMatchObject([
    { fromCustomerId: null, toCustomerId: target.id, sourceQuoteId: quote.id },
    { fromCustomerId: target.id, toCustomerId: null, sourceQuoteId: quote.id },
  ]);
});

test('refuses self merges and missing Customers without changing the survivor', async ({ context }) => {
  const db = context.db;
  const customer = await makeCustomer(db, 'Survivor');
  const missing = '00000000-0000-4000-8000-000000000001';
  await expect(
    mergeCustomer({ actorUserId: 'actor-user-id', db, input: { sourceId: customer.id, targetId: customer.id } }),
  ).rejects.toMatchObject({ code: 'customer.merge_self', metadata: { id: customer.id } });
  for (const input of [
    { sourceId: missing, targetId: customer.id },
    { sourceId: customer.id, targetId: missing },
  ])
    await expect(mergeCustomer({ actorUserId: 'actor-user-id', db, input })).rejects.toMatchObject({
      code: 'customer.not_found',
      metadata: { id: missing },
    });
  await expect(getCustomer({ db, id: customer.id })).resolves.toEqual(customer);
});

test('serialises crossing merges with shared ownership history without deadlocking', async ({ context }) => {
  const db = context.db;
  const a = await makeCustomer(db, 'A');
  const b = await makeCustomer(db, 'B');
  const productId = await makeProduct(db);
  const qa = await makeQuote(db, a.id, productId);
  const qb = await makeQuote(db, b.id, productId);
  const unit = await db.transaction((tx) =>
    createProductUnit({
      actorUserId: 'actor-user-id',
      initialOwner: { customerId: a.id, sourceQuoteId: qa },
      plantToday: getPlantDateNow(),
      productId,
      tx,
    }),
  );
  await db.insert(jobs).values({ productUnitId: unit.id, quoteId: qa });
  await reassignProductUnitToQuote({
    actorUserId: 'actor-user-id',
    db,
    input: { productUnitId: unit.id, toQuoteId: qb, note: null },
  });
  const results = await Promise.allSettled([
    mergeCustomer({ actorUserId: 'actor-user-id', db, input: { sourceId: a.id, targetId: b.id } }),
    mergeCustomer({ actorUserId: 'actor-user-id', db, input: { sourceId: b.id, targetId: a.id } }),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({
    reason: { code: 'customer.not_found' },
  });
});

test('waits for a Quote edit before merging and preserves the edit', async ({ context }) => {
  const db = context.db;
  const source = await makeCustomer(db, 'Duplicate');
  const target = await makeCustomer(db, 'Survivor');
  const productId = await makeProduct(db);
  const quoteId = await makeQuote(db, source.id, productId, 'draft');
  const held = deferred();
  const release = deferred();
  const writer = db.transaction(async (tx) => {
    await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for('update');
    held.resolve();
    await release.promise;
    await tx.update(quotes).set({ notes: 'Concurrent edit' }).where(eq(quotes.id, quoteId));
  });
  await held.promise;
  const merging = mergeCustomer({
    actorUserId: 'actor-user-id',
    db,
    input: { sourceId: source.id, targetId: target.id },
  });
  try {
    await expect
      .poll(async () => {
        const rows = await db.execute<{ count: number }>(
          sql`select count(*)::int as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
        );
        return rows[0]?.count ?? 0;
      })
      .toBeGreaterThan(0);
  } finally {
    release.resolve();
    await writer;
  }
  await merging;
  await expect(getQuote({ db, id: quoteId })).resolves.toMatchObject({
    customerId: target.id,
    notes: 'Concurrent edit',
  });
});

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
