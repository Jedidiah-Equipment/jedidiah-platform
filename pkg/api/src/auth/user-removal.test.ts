import { account, and, auditEvents, type Db, eq, user } from '@pkg/db';
import type { ContractingRole, EquipmentRole } from '@pkg/schema';
import { hashPassword } from 'better-auth/crypto';
import { describe, expect } from 'vitest';
import { createTester, type TesterScope } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { SIGN_IN_DISABLED_MESSAGE } from './sign-in-eligibility.js';

const PASSWORD = 'test123';

const test = createTester(async ({ auth, db }) => {
  await createUser(db, { id: 'super', role: 'super-admin' });
  return { auth, db, cookies: await signIn(auth, 'super') };
});

describe('Remove', () => {
  test('removes a User nothing references and audits the removal', async ({ context }) => {
    await createUser(context.db, { id: 'duplicate', role: 'bay-operator' });

    await expect(
      context.auth.api.removeUser({ body: { userId: 'duplicate' }, headers: context.cookies }),
    ).resolves.toEqual({ success: true });

    expect(await context.db.query.user.findFirst({ where: eq(user.id, 'duplicate') })).toBeUndefined();
    expect(await userEvents(context.db, 'duplicate')).toEqual([
      expect.objectContaining({
        action: 'deleted',
        actorUserId: 'super',
        summary: expect.stringContaining('duplicate@example.com'),
      }),
    ]);
  });

  test('refuses a User with history, even one only a SET NULL key names, and audits nothing', async ({ context }) => {
    await createUser(context.db, { id: 'veteran', role: 'sales' });
    await actedOnce(context.db, 'veteran');

    await expect(
      context.auth.api.removeUser({ body: { userId: 'veteran' }, headers: context.cookies }),
    ).rejects.toMatchObject({
      status: 'FORBIDDEN',
      body: { code: 'USER_HAS_HISTORY', message: 'This person has history. Disable them instead.' },
    });
    expect(await context.db.query.user.findFirst({ where: eq(user.id, 'veteran') })).toBeDefined();
    expect(await userEvents(context.db, 'veteran')).toEqual([]);
  });

  test('serves the same verdict the dialog offers from', async ({ context }) => {
    await createUser(context.db, { id: 'fresh' });
    await createUser(context.db, { id: 'veteran', role: 'sales' });
    await actedOnce(context.db, 'veteran');
    const caller = context.createCaller(mockSession('super-admin'));

    await expect(caller.users.removal({ userId: 'fresh' })).resolves.toEqual({ hasHistory: false });
    await expect(caller.users.removal({ userId: 'veteran' })).resolves.toEqual({ hasHistory: true });
  });
});

describe('Disable and Enable', () => {
  test('a Disabled User cannot sign in, is never told they are banned, and Enable reverses it', async ({ context }) => {
    await createUser(context.db, { id: 'seller', role: 'sales' });

    await context.auth.api.banUser({ body: { userId: 'seller' }, headers: context.cookies });
    await expect(signIn(context.auth, 'seller')).rejects.toMatchObject({
      status: 'FORBIDDEN',
      body: { code: 'BANNED_USER', message: SIGN_IN_DISABLED_MESSAGE },
    });

    await context.auth.api.unbanUser({ body: { userId: 'seller' }, headers: context.cookies });
    await expect(signIn(context.auth, 'seller')).resolves.toBeInstanceOf(Headers);

    expect((await userEvents(context.db, 'seller')).map(({ action, changes }) => ({ action, changes }))).toEqual([
      { action: 'updated', changes: { disabled: { from: false, to: true } } },
      { action: 'updated', changes: { disabled: { from: true, to: false } } },
    ]);
  });

  test('refuses to disable through update-user, which would skip the leaving gates and the audit', async ({
    context,
  }) => {
    await createUser(context.db, { id: 'admin-a', role: 'admin' });

    await expect(
      context.auth.api.adminUpdateUser({
        body: { userId: 'admin-a', data: { banned: true } },
        headers: context.cookies,
      }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST', body: { code: 'DISABLE_THROUGH_BAN_USER' } });
    expect(await context.db.query.user.findFirst({ where: eq(user.id, 'admin-a') })).toMatchObject({ banned: false });
  });

  test('counts only enabled admins toward the last admin', async ({ context }) => {
    await createUser(context.db, { id: 'admin-a', role: 'admin' });
    await createUser(context.db, { id: 'admin-b', role: 'admin' });

    await context.auth.api.banUser({ body: { userId: 'admin-a' }, headers: context.cookies });
    await expect(
      context.auth.api.banUser({ body: { userId: 'admin-b' }, headers: context.cookies }),
    ).rejects.toMatchObject({ body: { code: 'YOU_CANNOT_REMOVE_THE_LAST_ADMIN' } });
    await expect(
      context.auth.api.setRole({ body: { userId: 'admin-b', role: 'sales' }, headers: context.cookies }),
    ).rejects.toMatchObject({ body: { code: 'YOU_CANNOT_REMOVE_THE_LAST_ADMIN' } });
    expect(await userEvents(context.db, 'admin-b')).toEqual([]);
  });
});

describe('who may take a User out', () => {
  test('an admin cannot take out a super-admin, and nobody can take out themselves', async ({ context }) => {
    await createUser(context.db, { id: 'admin', role: 'admin' });
    await createUser(context.db, { id: 'other-admin', role: 'admin' });
    const adminCookies = await signIn(context.auth, 'admin');

    for (const leave of [context.auth.api.banUser, context.auth.api.removeUser]) {
      await expect(leave({ body: { userId: 'super' }, headers: adminCookies })).rejects.toMatchObject({
        body: { code: 'ONLY_SUPER_ADMIN_CAN_ASSIGN_SUPER_ADMIN' },
      });
    }
    await expect(context.auth.api.banUser({ body: { userId: 'admin' }, headers: adminCookies })).rejects.toMatchObject({
      body: { code: 'YOU_CANNOT_BAN_YOURSELF' },
    });
    await expect(
      context.auth.api.removeUser({ body: { userId: 'admin' }, headers: adminCookies }),
    ).rejects.toMatchObject({ body: { code: 'YOU_CANNOT_REMOVE_YOURSELF' } });
  });
});

/** An audit event the User performed: its actor key is ON DELETE SET NULL, and still history. */
async function actedOnce(db: Db, actorUserId: string) {
  await db.insert(auditEvents).values({
    actorUserId,
    entityType: 'customer',
    entityId: 'customer-1',
    action: 'created',
    summary: 'Created customer',
  });
}

function userEvents(db: Db, userId: string) {
  return db
    .select({
      action: auditEvents.action,
      actorUserId: auditEvents.actorUserId,
      changes: auditEvents.changes,
      summary: auditEvents.summary,
    })
    .from(auditEvents)
    .where(and(eq(auditEvents.entityType, 'user'), eq(auditEvents.entityId, userId)))
    .orderBy(auditEvents.occurredAt);
}

async function createUser(
  db: Db,
  input: { id: string; role?: EquipmentRole; contractingRole?: ContractingRole },
): Promise<void> {
  const now = new Date();
  await db.insert(user).values({
    id: input.id,
    name: input.id,
    email: `${input.id}@example.com`,
    emailVerified: true,
    role: input.role ?? null,
    contractingRole: input.contractingRole ?? null,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(account).values({
    id: `${input.id}-credential`,
    accountId: input.id,
    userId: input.id,
    providerId: 'credential',
    password: await hashPassword(PASSWORD),
    createdAt: now,
    updatedAt: now,
  });
}

async function signIn(auth: TesterScope['auth'], userId: string): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email: `${userId}@example.com`, password: PASSWORD },
    returnHeaders: true,
  });
  return new Headers({
    cookie: headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; '),
  });
}
