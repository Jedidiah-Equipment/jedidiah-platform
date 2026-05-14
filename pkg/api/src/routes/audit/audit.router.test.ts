import type { Database } from '@pkg/db';
import { auditEvents, user } from '@pkg/db/schema';
import { describe, expect } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(({ db }) => ({ db }));

const firstProductId = '00000000-0000-4000-8000-000000000001';
const secondProductId = '00000000-0000-4000-8000-000000000002';

describe('audit.list', () => {
  test('rejects unauthenticated audit reads', async ({ context }) => {
    await expect(context.createAnonCaller().audit.list({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('rejects non-admin audit reads', async ({ context }) => {
    const caller = context.createCaller(mockSession('product-editor'));

    await expect(caller.audit.list({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('lists audit events with default newest-first sorting', async ({ context }) => {
    await createActorUser(context.db, {
      email: 'admin@example.com',
      id: 'admin-user-id',
      name: 'Admin User',
      role: 'admin',
    });
    await createAuditEvent(context.db, {
      actorUserId: 'admin-user-id',
      entityId: firstProductId,
      occurredAt: new Date('2026-05-01T10:00:00.000Z'),
      summary: 'Created product "Wheel Loader"',
    });
    await createAuditEvent(context.db, {
      action: 'updated',
      actorUserId: 'admin-user-id',
      entityId: firstProductId,
      occurredAt: new Date('2026-05-02T10:00:00.000Z'),
      summary: 'Renamed product "Wheel Loader" to "Wheel Loader XL"',
    });

    const result = await context.createCaller().audit.list({});

    expect(result).toMatchObject({
      sortBy: 'occurredAt',
      sortDirection: 'desc',
      total: 2,
    });
    expect(result.items.map((event) => event.summary)).toEqual([
      'Renamed product "Wheel Loader" to "Wheel Loader XL"',
      'Created product "Wheel Loader"',
    ]);
    expect(result.items[0]).toMatchObject({
      actorEmail: 'admin@example.com',
      actorName: 'Admin User',
      actorUserId: 'admin-user-id',
    });
  });

  test('pages and sorts audit events', async ({ context }) => {
    await createAuditEvent(context.db, {
      entityId: firstProductId,
      occurredAt: new Date('2026-05-01T10:00:00.000Z'),
      summary: 'Oldest event',
    });
    await createAuditEvent(context.db, {
      entityId: firstProductId,
      occurredAt: new Date('2026-05-02T10:00:00.000Z'),
      summary: 'Middle event',
    });
    await createAuditEvent(context.db, {
      entityId: secondProductId,
      occurredAt: new Date('2026-05-03T10:00:00.000Z'),
      summary: 'Newest event',
    });

    const result = await context.createCaller().audit.list({
      page: 2,
      pageSize: 1,
      sortBy: 'occurredAt',
      sortDirection: 'asc',
    });

    expect(result.items.map((event) => event.summary)).toEqual(['Middle event']);
    expect(result.total).toBe(3);
    expect(result.sortBy).toBe('occurredAt');
    expect(result.sortDirection).toBe('asc');
  });

  test('filters audit events', async ({ context }) => {
    await createActorUser(context.db, {
      email: 'matching@example.com',
      id: 'matching-actor-id',
      name: 'Matching Actor',
      role: 'admin',
    });
    await createActorUser(context.db, {
      email: 'other@example.com',
      id: 'other-actor-id',
      name: 'Other Actor',
      role: 'admin',
    });
    await createAuditEvent(context.db, {
      actorUserId: 'matching-actor-id',
      entityId: firstProductId,
      occurredAt: new Date('2026-05-02T10:00:00.000Z'),
      summary: 'Matching event',
    });
    await createAuditEvent(context.db, {
      actorUserId: 'other-actor-id',
      entityId: firstProductId,
      occurredAt: new Date('2026-05-02T10:00:00.000Z'),
      summary: 'Wrong actor',
    });
    await createAuditEvent(context.db, {
      actorUserId: 'matching-actor-id',
      entityId: secondProductId,
      occurredAt: new Date('2026-05-02T10:00:00.000Z'),
      summary: 'Wrong entity',
    });
    await createAuditEvent(context.db, {
      actorUserId: 'matching-actor-id',
      entityId: firstProductId,
      occurredAt: new Date('2026-04-30T10:00:00.000Z'),
      summary: 'Outside date range',
    });

    const result = await context.createCaller().audit.list({
      filters: {
        actorUserIds: ['matching-actor-id'],
        entityIds: [firstProductId],
        entityTypes: ['product'],
        occurredAtStart: '2026-05-01T00:00:00.000Z',
        occurredAtEnd: '2026-05-03T00:00:00.000Z',
      },
    });

    expect(result.items.map((event) => event.summary)).toEqual(['Matching event']);
    expect(result.total).toBe(1);
  });
});

async function createActorUser(
  db: Database,
  input: {
    email: string;
    id: string;
    name: string;
    role: string;
  },
) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: input.email,
    emailVerified: true,
    id: input.id,
    name: input.name,
    role: input.role,
    updatedAt: now,
  });
}

async function createAuditEvent(
  db: Database,
  input: {
    action?: 'created' | 'updated';
    actorUserId?: string | null;
    entityId: string;
    occurredAt: Date;
    summary: string;
  },
) {
  await db.insert(auditEvents).values({
    action: input.action ?? 'created',
    actorUserId: input.actorUserId ?? null,
    changes: null,
    entityId: input.entityId,
    entityType: 'product',
    occurredAt: input.occurredAt,
    summary: input.summary,
  });
}
