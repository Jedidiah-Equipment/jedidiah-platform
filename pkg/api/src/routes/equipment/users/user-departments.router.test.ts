import { listUserDepartments } from '@pkg/core/equipment';
import { auditEvents, type Db, user } from '@pkg/db';
import { userDepartment } from '@pkg/db/equipment';
import { createUserAccessSummaryForUser } from '@pkg/domain';
import type { EquipmentRole } from '@pkg/schema';
import pino from 'pino';
import { describe, expect } from 'vitest';
import { createTester, NOOP_ROUTER_DEPENDENCIES } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { createAppRouterCaller } from '@/trpc/router.js';

const test = createTester(({ auth, db }) => ({ auth, db }));

describe('userDepartments', () => {
  test('searches departments before paging without duplicates or cross-business users', async ({ context }) => {
    for (const id of ['a', 'b', 'c']) {
      await createUser(context.db, {
        id,
        email: `${id}@example.com`,
        name: id === 'a' ? 'Paint person' : id,
        role: 'sales',
      });
    }
    await context.db.insert(user).values({
      id: 'contracting-only',
      email: 'contracting-only@example.com',
      name: 'Paint contractor',
      role: null,
      contractingRole: 'driver',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await context.db.insert(userDepartment).values([
      { userId: 'contracting-only', department: 'paint' },
      { userId: 'b', department: 'paint' },
      { userId: 'b', department: 'assembly' },
      { userId: 'c', department: 'paint' },
    ]);
    const caller = context.createCaller();
    const first = await caller.userDepartments.listUsers({ search: 'paint', limit: 1 });
    expect(first.items.map((person) => person.id)).toEqual(['a']);
    expect(first.total).toBe(3);
    expect(first.nextCursor).toBe(1);
    const next = await caller.userDepartments.listUsers({ search: 'paint', limit: 1, cursor: first.nextCursor });
    expect(next.items.map((person) => person.id)).toEqual(['b']);
    const filtered = await caller.userDepartments.listUsers({ department: 'paint', limit: 1, sortDirection: 'desc' });
    expect(filtered.items.map((person) => person.id)).toEqual(['c']);
    expect(filtered.total).toBe(2);
    const combined = await caller.userDepartments.listUsers({ search: 'assembly', department: 'paint', limit: 0 });
    expect(combined.items.map((person) => person.id)).toEqual(['b']);
    expect(combined.total).toBe(1);
    expect(combined.nextCursor).toBeNull();
    expect(
      (await caller.users.list({ business: 'contracting', search: 'paint' })).items.map((person) => person.id),
    ).toEqual(['contracting-only']);
    await expect(context.createAnonCaller().userDepartments.listUsers({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(context.createCaller(mockSession('sales')).userDepartments.listUsers({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('rejects non-admin department membership mutations', async ({ context }) => {
    await createUser(context.db, {
      email: 'department-target@example.com',
      id: 'department-target-user-id',
      name: 'Department Target',
      role: 'sales',
    });
    const caller = context.createCaller(mockSession('procurement-manager'));

    await expect(
      caller.userDepartments.set({
        departments: ['paint'],
        userId: 'department-target-user-id',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('replaces department memberships and writes audit events per change', async ({ context }) => {
    const multiDepartmentUserId = '00000000-0000-4000-8000-000000000001';

    await createUser(context.db, {
      email: 'admin@example.com',
      id: 'test-user-id',
      name: 'Test User',
      role: 'admin',
    });
    await createUser(context.db, {
      email: 'multi-department@example.com',
      id: multiDepartmentUserId,
      name: 'Multi Department User',
      role: 'sales',
    });

    await context.createCaller().userDepartments.set({
      departments: ['paint', 'fabrication'],
      userId: multiDepartmentUserId,
    });

    await expect(context.createCaller().userDepartments.list()).resolves.toEqual({
      memberships: [{ departments: ['fabrication', 'paint'], userId: multiDepartmentUserId }],
    });

    await context.createCaller().userDepartments.set({
      departments: ['fabrication'],
      userId: multiDepartmentUserId,
    });

    await expect(context.createCaller().userDepartments.list()).resolves.toEqual({
      memberships: [{ departments: ['fabrication'], userId: multiDepartmentUserId }],
    });

    const membershipAuditEvents = await context.db.select().from(auditEvents);

    expect(membershipAuditEvents).toHaveLength(3);
    expect(membershipAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: 'test-user-id',
          changes: expect.objectContaining({
            member: {
              from: false,
              to: true,
            },
          }),
          entityId: multiDepartmentUserId,
          entityType: 'user',
          summary: 'Updated user "multi-department@example.com"',
        }),
        expect.objectContaining({
          actorUserId: 'test-user-id',
          changes: expect.objectContaining({
            member: {
              from: true,
              to: false,
            },
          }),
          entityId: multiDepartmentUserId,
          entityType: 'user',
          summary: 'Updated user "multi-department@example.com"',
        }),
      ]),
    );
  });

  test('keeps department memberships out of the current user access summary', async ({ context }) => {
    const currentDepartmentUserId = '00000000-0000-4000-8000-000000000002';

    await createUser(context.db, {
      email: 'admin@example.com',
      id: 'test-user-id',
      name: 'Test User',
      role: 'admin',
    });
    await createUser(context.db, {
      email: 'current-department@example.com',
      id: currentDepartmentUserId,
      name: 'Current Department User',
      role: 'job-viewer',
    });

    const session = mockSession('job-viewer');
    session.user.id = currentDepartmentUserId;

    await context.createCaller().userDepartments.set({
      departments: ['supply'],
      userId: currentDepartmentUserId,
    });

    const caller = createAppRouterCaller(NOOP_ROUTER_DEPENDENCIES)({
      access: createUserAccessSummaryForUser(session.user),
      appEnv: 'production',
      auth: context.auth,
      changelogLoader: () => [],
      db: context.db,
      log: pino({ level: 'silent' }),
      session,
      storage: {
        deleteObject: async () => undefined,
        get: async () => {
          throw new Error('Storage object not found');
        },
        put: async () => undefined,
      },
    });

    await expect(caller.auth.access()).resolves.toEqual({
      contractingRole: null,
      equipmentRole: 'job-viewer',
      permissions: ['equipment_job:read', 'equipment_product_unit:read'],
      userId: currentDepartmentUserId,
    });

    await expect(
      listUserDepartments({
        db: context.db,
        userId: currentDepartmentUserId,
      }),
    ).resolves.toEqual(['supply']);

    await context.createCaller().userDepartments.set({
      departments: [],
      userId: currentDepartmentUserId,
    });

    await expect(
      listUserDepartments({
        db: context.db,
        userId: currentDepartmentUserId,
      }),
    ).resolves.toEqual([]);
  });
});

async function createUser(db: Db, input: { email: string; id: string; name: string; role: EquipmentRole }) {
  const now = new Date();

  await db
    .insert(user)
    .values({
      email: input.email,
      emailVerified: true,
      id: input.id,
      name: input.name,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}
