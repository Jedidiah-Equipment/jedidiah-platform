import { auditEvents, type Db, user } from '@pkg/db';
import type { AuditEntityType, ContractingRole, EquipmentRole } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(({ db }) => ({ db }));

function contractingSession(role: ContractingRole) {
  const session = mockSession(null);
  session.user.contractingRole = role;
  return session;
}

const firstProductId = '00000000-0000-4000-8000-000000000001';
const secondProductId = '00000000-0000-4000-8000-000000000002';

describe('audit.list', () => {
  test('rejects unauthenticated audit reads', async ({ context }) => {
    await expect(context.createAnonCaller().audit.list({ business: 'equipment' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('rejects non-admin audit reads', async ({ context }) => {
    const caller = context.createCaller(mockSession('procurement-manager'));

    await expect(caller.audit.list({ business: 'equipment' })).rejects.toMatchObject({
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

    const result = await context.createCaller().audit.list({ business: 'equipment' });

    expect(result).toMatchObject({
      nextCursor: null,
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
      business: 'equipment',
      cursor: 1,
      limit: 1,
      sortBy: 'occurredAt',
      sortDirection: 'asc',
    });

    expect(result.items.map((event) => event.summary)).toEqual(['Middle event']);
    expect(result.nextCursor).toBe(2);
    expect(result.total).toBe(3);
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
      business: 'equipment',
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
  test('gates each business log on that business audit permission', async ({ context }) => {
    const contractingAdmin = context.createCaller(contractingSession('contracting-admin'));
    const equipmentAdmin = context.createCaller(mockSession('admin'));
    const superAdmin = context.createCaller(mockSession('super-admin'));

    await expect(contractingAdmin.audit.list({ business: 'equipment' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(equipmentAdmin.audit.list({ business: 'contracting' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      context.createCaller(contractingSession('contracting-manager')).audit.list({ business: 'contracting' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(contractingAdmin.audit.list({ business: 'contracting' })).resolves.toMatchObject({ total: 0 });
    await expect(superAdmin.audit.list({ business: 'contracting' })).resolves.toMatchObject({ total: 0 });
    await expect(superAdmin.audit.list({ business: 'equipment' })).resolves.toMatchObject({ total: 0 });
  });

  test('lists only the events a business owns', async ({ context }) => {
    await createActorUser(context.db, { email: 'eq@example.com', id: 'equipment-user-id', name: 'Eq', role: 'sales' });
    await createActorUser(context.db, {
      contractingRole: 'foreman',
      email: 'con@example.com',
      id: 'contracting-user-id',
      name: 'Con',
      role: null,
    });
    await createActorUser(context.db, {
      email: 'sa@example.com',
      id: 'super-user-id',
      name: 'Sa',
      role: 'super-admin',
    });
    await createAuditEvent(context.db, { entityId: firstProductId, summary: 'Product event' });
    await createAuditEvent(context.db, {
      entityId: secondProductId,
      entityType: 'contracting_machine',
      summary: 'Machine event',
    });
    await createAuditEvent(context.db, {
      entityId: 'equipment-user-id',
      entityType: 'user',
      summary: 'Equipment user',
    });
    await createAuditEvent(context.db, {
      entityId: 'contracting-user-id',
      entityType: 'user',
      summary: 'Contracting user',
    });
    await createAuditEvent(context.db, { entityId: 'super-user-id', entityType: 'user', summary: 'Super user' });
    await createAuditEvent(context.db, { entityId: 'removed-user-id', entityType: 'user', summary: 'Removed user' });

    const caller = context.createCaller(mockSession('super-admin'));
    const summaries = async (business: 'contracting' | 'equipment') =>
      (await caller.audit.list({ business })).items.map((event) => event.summary).sort();

    expect(await summaries('equipment')).toEqual(['Equipment user', 'Product event', 'Removed user', 'Super user']);
    expect(await summaries('contracting')).toEqual(['Contracting user', 'Machine event']);
    await expect(
      caller.audit.list({ business: 'contracting', filters: { entityTypes: ['product'] } }),
    ).resolves.toMatchObject({ items: [], total: 0 });
  });
});

describe('audit.actors', () => {
  test('lists the people who acted in a business log, behind its audit permission', async ({ context }) => {
    await createActorUser(context.db, {
      email: 'b@example.com',
      id: 'equipment-actor-id',
      name: 'Beth',
      role: 'admin',
    });
    await createActorUser(context.db, {
      contractingRole: 'contracting-admin',
      email: 'a@example.com',
      id: 'contracting-actor-id',
      name: 'Anna',
      role: null,
    });
    await createAuditEvent(context.db, { actorUserId: 'equipment-actor-id', entityId: firstProductId, summary: 'One' });
    await createAuditEvent(context.db, { actorUserId: 'equipment-actor-id', entityId: firstProductId, summary: 'Two' });
    await createAuditEvent(context.db, {
      actorUserId: 'contracting-actor-id',
      entityId: secondProductId,
      entityType: 'contracting_machine',
      summary: 'Three',
    });
    await createAuditEvent(context.db, {
      entityId: secondProductId,
      entityType: 'contracting_machine',
      summary: 'Four',
    });

    await expect(
      context.createCaller(contractingSession('contracting-admin')).audit.actors({ business: 'contracting' }),
    ).resolves.toEqual([{ email: 'a@example.com', id: 'contracting-actor-id', name: 'Anna' }]);
    await expect(context.createCaller(mockSession('admin')).audit.actors({ business: 'equipment' })).resolves.toEqual([
      { email: 'b@example.com', id: 'equipment-actor-id', name: 'Beth' },
    ]);
    await expect(
      context.createCaller(mockSession('admin')).audit.actors({ business: 'contracting' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

async function createActorUser(
  db: Db,
  input: {
    email: string;
    id: string;
    name: string;
    contractingRole?: ContractingRole;
    role: EquipmentRole | null;
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
    contractingRole: input.contractingRole ?? null,
    updatedAt: now,
  });
}

async function createAuditEvent(
  db: Db,
  input: {
    action?: 'created' | 'updated';
    actorUserId?: string | null;
    entityId: string;
    entityType?: AuditEntityType;
    occurredAt?: Date;
    summary: string;
  },
) {
  await db.insert(auditEvents).values({
    action: input.action ?? 'created',
    actorUserId: input.actorUserId ?? null,
    changes: null,
    entityId: input.entityId,
    entityType: input.entityType ?? 'product',
    occurredAt: input.occurredAt ?? new Date('2026-05-01T10:00:00.000Z'),
    summary: input.summary,
  });
}
