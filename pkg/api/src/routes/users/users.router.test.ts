import { listUserDepartments } from '@pkg/core';
import { auditEvents, type Db, user } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { AppRole } from '@pkg/schema';
import pino from 'pino';
import { describe, expect } from 'vitest';

import { parseBetterAuthRole } from '@/auth/session.js';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { createAppRouterCaller } from '@/trpc/router.js';

const test = createTester(({ db }) => ({ db }));

describe('users.list', () => {
  test('rejects unauthenticated user lists', async ({ context }) => {
    await expect(context.createAnonCaller().users.list()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('allows admins to list safe user summaries', async ({ context }) => {
    await createUser(context.db, {
      email: 'viewer@example.com',
      emailVerified: true,
      id: 'viewer-user-id',
      name: 'Viewer User',
      role: 'product-viewer',
    });

    const result = await context.createCaller().users.list();

    expect(result.users).toEqual([
      {
        departments: [],
        email: 'viewer@example.com',
        emailVerified: true,
        id: 'viewer-user-id',
        name: 'Viewer User',
        role: 'product-viewer',
      },
    ]);
  });

  test('rejects unknown stored roles in list responses', async ({ context }) => {
    await createUser(context.db, {
      email: 'legacy@example.com',
      emailVerified: false,
      id: 'legacy-user-id',
      name: 'Legacy User',
      role: 'user',
    });

    await expect(context.createCaller().users.list()).rejects.toThrow();
  });

  test('rejects product editors', async ({ context }) => {
    const caller = context.createCaller(mockSession('product-editor'));

    await expect(caller.users.list()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('rejects non-admin department membership mutations', async ({ context }) => {
    await createUser(context.db, {
      email: 'department-target@example.com',
      id: 'department-target-user-id',
      name: 'Department Target',
      role: 'product-viewer',
    });
    const caller = context.createCaller(mockSession('product-editor'));

    await expect(
      caller.users.setDepartments({
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
      role: 'product-viewer',
    });

    await context.createCaller().users.setDepartments({
      departments: ['paint', 'fabrication'],
      userId: multiDepartmentUserId,
    });

    const assignedUsers = await context.createCaller().users.list();

    expect(assignedUsers.users.find((userSummary) => userSummary.id === multiDepartmentUserId)).toMatchObject({
      departments: ['fabrication', 'paint'],
      id: multiDepartmentUserId,
    });

    await context.createCaller().users.setDepartments({
      departments: ['fabrication'],
      userId: multiDepartmentUserId,
    });

    const replacedUsers = await context.createCaller().users.list();

    expect(replacedUsers.users.find((userSummary) => userSummary.id === multiDepartmentUserId)).toMatchObject({
      departments: ['fabrication'],
      id: multiDepartmentUserId,
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
        }),
      ]),
    );
  });

  test('reads assigned departments in the current user access summary', async ({ context }) => {
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
      role: 'job-stage-editor',
    });

    const session = mockSession('job-stage-editor');
    session.user.id = currentDepartmentUserId;

    await context.createCaller().users.setDepartments({
      departments: ['dispatch'],
      userId: currentDepartmentUserId,
    });

    const access = createUserAccessSummary({
      departments: await listUserDepartments({
        db: context.db,
        userId: currentDepartmentUserId,
      }),
      role: parseBetterAuthRole(session.user.role),
      userId: session.user.id,
    });
    const caller = createAppRouterCaller({
      access,
      db: context.db,
      log: pino({ level: 'silent' }),
      session,
    });

    await expect(caller.auth.access()).resolves.toMatchObject({
      departments: ['dispatch'],
      permissions: ['job-stage:read', 'job-stage:update', 'job:read'],
      role: 'job-stage-editor',
      userId: currentDepartmentUserId,
    });

    await context.createCaller().users.setDepartments({
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

async function createUser(
  db: Db,
  input: {
    email: string;
    emailVerified?: boolean;
    id: string;
    name: string;
    role: AppRole | string;
  },
) {
  const now = new Date();

  await db
    .insert(user)
    .values({
      email: input.email,
      emailVerified: input.emailVerified ?? true,
      id: input.id,
      name: input.name,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}
