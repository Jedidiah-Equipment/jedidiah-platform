import { listUserDepartments } from '@pkg/core';
import { auditEvents, type Db, user } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { AppRole } from '@pkg/schema';
import pino from 'pino';
import { beforeEach, describe, expect } from 'vitest';

import { parseBetterAuthRole } from '@/auth/session.js';
import { clearMockEmailMessages, getMockEmailMessages } from '@/email/mock-email.js';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { createAppRouterCaller } from '@/trpc/router.js';

const test = createTester(({ db }) => ({ db }));

const THUMBNAIL_DATA_URL = 'data:image/webp;base64,aaaa';

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
      role: 'sales',
    });

    const result = await context.createCaller().users.list();

    expect(result.users).toEqual([
      {
        departments: [],
        email: 'viewer@example.com',
        emailVerified: true,
        id: 'viewer-user-id',
        name: 'Viewer User',
        phoneNumber: null,
        role: 'sales',
        thumbnailDataUrl: null,
      },
    ]);
  });

  test('returns stored phone numbers in list responses', async ({ context }) => {
    await createUser(context.db, {
      email: 'caller@example.com',
      id: 'phone-user-id',
      name: 'Phone User',
      phoneNumber: '+27821234567',
      role: 'sales',
    });

    await expect(context.createCaller().users.list()).resolves.toMatchObject({
      users: [{ id: 'phone-user-id', phoneNumber: '+27821234567' }],
    });
  });

  test('maps user image storage to thumbnailDataUrl in list responses', async ({ context }) => {
    await createUser(context.db, {
      email: 'thumbnail@example.com',
      id: 'thumbnail-user-id',
      image: THUMBNAIL_DATA_URL,
      name: 'Thumbnail User',
      role: 'sales',
    });

    await expect(context.createCaller().users.list()).resolves.toMatchObject({
      users: [
        {
          id: 'thumbnail-user-id',
          thumbnailDataUrl: THUMBNAIL_DATA_URL,
        },
      ],
    });
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
      role: 'sales',
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
      role: 'sales',
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
      role: 'job-department-manager',
    });

    const session = mockSession('job-department-manager');
    session.user.id = currentDepartmentUserId;

    await context.createCaller().users.setDepartments({
      departments: ['supply'],
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
      storage: {
        deleteObject: async () => undefined,
        get: async () => {
          throw new Error('Storage object not found');
        },
        put: async () => undefined,
      },
    });

    await expect(caller.auth.access()).resolves.toMatchObject({
      departments: ['supply'],
      permissions: ['job-stage:read', 'job-stage:update', 'job:read'],
      role: 'job-department-manager',
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

describe('users.updateThumbnail', () => {
  test('updates and removes user thumbnails with audit changes', async ({ context }) => {
    await createUser(context.db, {
      email: 'admin@example.com',
      id: 'test-user-id',
      name: 'Test User',
      role: 'admin',
    });
    await createUser(context.db, {
      email: 'thumbnail-target@example.com',
      id: 'thumbnail-target-user-id',
      image: THUMBNAIL_DATA_URL,
      name: 'Thumbnail Target',
      role: 'sales',
    });

    const updated = await context.createCaller().users.updateThumbnail({
      thumbnailDataUrl: null,
      userId: 'thumbnail-target-user-id',
    });

    expect(updated.thumbnailDataUrl).toBeNull();

    const events = await context.db.select().from(auditEvents);
    expect(events).toMatchObject([
      {
        action: 'updated',
        changes: {
          thumbnailDataUrl: {
            from: THUMBNAIL_DATA_URL,
            to: null,
          },
        },
        entityId: 'thumbnail-target-user-id',
        entityType: 'user',
      },
    ]);
  });
});

describe('users.sendVerificationEmail', () => {
  beforeEach(() => {
    clearMockEmailMessages();
  });

  test('rejects unauthenticated callers', async ({ context }) => {
    await expect(
      context.createAnonCaller().users.sendVerificationEmail({ userId: '00000000-0000-4000-8000-000000000099' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  test('rejects non-admin roles', async ({ context }) => {
    await expect(
      context
        .createCaller(mockSession('sales'))
        .users.sendVerificationEmail({ userId: '00000000-0000-4000-8000-000000000099' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('returns NOT_FOUND for unknown userId', async ({ context }) => {
    await expect(
      context.createCaller().users.sendVerificationEmail({ userId: '00000000-0000-4000-8000-000000000099' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('returns BAD_REQUEST when user email is already verified', async ({ context }) => {
    await createUser(context.db, {
      email: 'verified@example.com',
      emailVerified: true,
      id: '00000000-0000-4000-8000-000000000010',
      name: 'Verified User',
      role: 'sales',
    });

    await expect(
      context.createCaller().users.sendVerificationEmail({ userId: '00000000-0000-4000-8000-000000000010' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('sends mock verification email for unverified user', async ({ context }) => {
    await createUser(context.db, {
      email: 'unverified@example.com',
      emailVerified: false,
      id: '00000000-0000-4000-8000-000000000011',
      name: 'Unverified User',
      role: 'sales',
    });

    await context.createCaller().users.sendVerificationEmail({
      userId: '00000000-0000-4000-8000-000000000011',
    });

    const messages = getMockEmailMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ to: 'unverified@example.com', type: 'email-verification' });
    expect(messages[0]?.url).toContain('/verify-email?token=');
  });
});

async function createUser(
  db: Db,
  input: {
    email: string;
    emailVerified?: boolean;
    id: string;
    image?: string | null;
    name: string;
    phoneNumber?: string | null;
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
      image: input.image ?? null,
      name: input.name,
      phoneNumber: input.phoneNumber ?? null,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}
