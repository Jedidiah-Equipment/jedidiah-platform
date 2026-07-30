import { auditEvents, customers, type Db, user } from '@pkg/db';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { defineAuditDescriptor } from './audit-service.js';
import { mutateEntity } from './mutate-entity.js';

const actorUserId = 'actor-user-id';

type CustomerRow = typeof customers.$inferSelect;

const descriptor = defineAuditDescriptor<CustomerRow>({
  entityType: 'customer',
  noun: 'customer',
  primaryLabelField: 'companyName',
  entityId: (row) => row.id,
  toRecord: (row) => ({ companyName: row.companyName, email: row.email }),
});

const test = createTester(async ({ db }) => {
  const now = new Date();
  await db.insert(user).values({
    createdAt: now,
    email: 'actor@example.com',
    emailVerified: true,
    id: actorUserId,
    name: 'Actor User',
    role: 'admin',
    updatedAt: now,
  });

  const [row] = await db
    .insert(customers)
    .values({ companyName: 'Acme Mining', email: 'old@acme.example' })
    .returning();

  if (!row) {
    throw new Error('Customer insert did not return a row');
  }

  return { customer: row, db };
});

async function readAuditEvents(db: Db, entityId: string) {
  return db.select().from(auditEvents).where(eq(auditEvents.entityId, entityId));
}

async function readCustomer(db: Db, id: string): Promise<CustomerRow> {
  const [row] = await db.select().from(customers).where(eq(customers.id, id));

  if (!row) {
    throw new Error(`Customer ${id} disappeared`);
  }

  return row;
}

class NotFound extends Error {}

describe('mutateEntity', () => {
  test('writes one update event carrying the descriptor diff', async ({ context }) => {
    const result = await mutateEntity({
      actorUserId,
      db: context.db,
      descriptor,
      id: context.customer.id,
      notFound: () => new NotFound(),
      project: (_tx, row) => row.companyName,
      set: () => ({ companyName: 'Acme Quarrying', updatedAt: new Date() }),
      table: customers,
    });

    expect(result).toBe('Acme Quarrying');

    const events = await readAuditEvents(context.db, context.customer.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'updated',
      actorUserId,
      entityType: 'customer',
      summary: 'Renamed customer "Acme Mining" to "Acme Quarrying"',
    });
    expect(events[0]?.changes).toEqual({ companyName: { from: 'Acme Mining', to: 'Acme Quarrying' } });
  });

  test('writes no event and projects the unchanged row when nothing audited changed', async ({ context }) => {
    const result = await mutateEntity({
      actorUserId,
      db: context.db,
      descriptor,
      id: context.customer.id,
      notFound: () => new NotFound(),
      project: (_tx, row) => row.updatedAt,
      set: () => ({ companyName: 'Acme Mining', updatedAt: new Date() }),
      table: customers,
    });

    // The projection is built from `before`: skipping the diff also skips the write, so the row's
    // `updatedAt` is untouched rather than bumped by the `set` above.
    expect(result).toEqual(context.customer.updatedAt);
    await expect(readAuditEvents(context.db, context.customer.id)).resolves.toEqual([]);
  });

  test('runs assert under the lock before the write, leaving row and audit log untouched', async ({ context }) => {
    const seen: string[] = [];

    await expect(
      mutateEntity({
        actorUserId,
        assert: (_tx, before) => {
          seen.push(before.companyName);
          throw new Error('assert rejected');
        },
        db: context.db,
        descriptor,
        id: context.customer.id,
        notFound: () => new NotFound(),
        project: (_tx, row) => row.companyName,
        set: () => ({ companyName: 'Never Written', updatedAt: new Date() }),
        table: customers,
      }),
    ).rejects.toThrow('assert rejected');

    expect(seen).toEqual(['Acme Mining']);
    await expect(readCustomer(context.db, context.customer.id)).resolves.toMatchObject({
      companyName: 'Acme Mining',
    });
    await expect(readAuditEvents(context.db, context.customer.id)).resolves.toEqual([]);
  });

  test('rolls back the row update and its audit event together when project throws', async ({ context }) => {
    await expect(
      mutateEntity({
        actorUserId,
        db: context.db,
        descriptor,
        id: context.customer.id,
        notFound: () => new NotFound(),
        project: () => {
          throw new Error('projection failed');
        },
        set: () => ({ companyName: 'Acme Quarrying', updatedAt: new Date() }),
        table: customers,
      }),
    ).rejects.toThrow('projection failed');

    await expect(readCustomer(context.db, context.customer.id)).resolves.toMatchObject({
      companyName: 'Acme Mining',
    });
    await expect(readAuditEvents(context.db, context.customer.id)).resolves.toEqual([]);
  });

  test('raises notFound when the lock select misses', async ({ context }) => {
    await expect(
      mutateEntity({
        actorUserId,
        db: context.db,
        descriptor,
        id: '00000000-0000-4000-8000-000000000999',
        notFound: () => new NotFound(),
        project: (_tx, row) => row.companyName,
        set: () => ({ companyName: 'Acme Quarrying', updatedAt: new Date() }),
        table: customers,
      }),
    ).rejects.toBeInstanceOf(NotFound);
  });

  test('raises notFound when lockWhere excludes a row that exists', async ({ context }) => {
    await expect(
      mutateEntity({
        actorUserId,
        db: context.db,
        descriptor,
        id: context.customer.id,
        lockWhere: eq(customers.companyName, 'Some Other Company'),
        notFound: () => new NotFound(),
        project: (_tx, row) => row.companyName,
        set: () => ({ companyName: 'Acme Quarrying', updatedAt: new Date() }),
        table: customers,
      }),
    ).rejects.toBeInstanceOf(NotFound);

    await expect(readAuditEvents(context.db, context.customer.id)).resolves.toEqual([]);
  });
});
