import { account, type Db, sql, user } from '@pkg/db';
import { DEFAULT_DEMO_USER_PASSWORD } from '@pkg/domain';
import type { AppRole } from '@pkg/schema';
import { hashPassword } from 'better-auth/crypto';
import { describe, expect } from 'vitest';

import { createTester, type TesterScope } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(({ auth, db }) => ({ auth, db }));

type AuthPolicyContext = {
  auth: TesterScope['auth'];
  db: Db;
};

describe('admin user safety policy', () => {
  test('rejects self-role changes through setRole', async ({ context }) => {
    const admin = mockSession('admin');
    const headers = await createSignedInAdmin(context, admin);

    await expect(
      context.auth.api.setRole({
        body: {
          role: 'sales',
          userId: admin.user.id,
        },
        headers,
      }),
    ).rejects.toThrow('You cannot change your own role.');
  });

  test('rejects unsupported role values through setRole', async ({ context }) => {
    const admin = mockSession('admin');
    const headers = await createSignedInAdmin(context, admin);

    await createUser(context.db, {
      email: 'target-user@example.com',
      id: 'target-user-id',
      name: 'Target User',
      role: 'sales',
    });

    await expect(
      context.auth.api.setRole({
        body: {
          role: 'manager' as never,
          userId: 'target-user-id',
        },
        headers,
      }),
    ).rejects.toThrow();
  });

  test('rejects demoting the last admin through setRole', async ({ context }) => {
    const admin = mockSession('admin');
    const headers = await createSignedInAdmin(context, admin);
    await createUser(context.db, {
      email: 'other-admin@example.com',
      id: 'other-admin-user-id',
      name: 'Other Admin',
      role: 'admin',
    });
    await setStoredRole(context.db, admin.user.id, 'sales');

    await expect(
      context.auth.api.setRole({
        body: {
          role: 'sales',
          userId: 'other-admin-user-id',
        },
        headers,
      }),
    ).rejects.toThrow('You cannot remove the last admin.');
  });

  test('allows changing another admin role when another admin remains', async ({ context }) => {
    const admin = mockSession('admin');
    const headers = await createSignedInAdmin(context, admin);
    await createUser(context.db, {
      email: 'other-admin@example.com',
      id: 'other-admin-user-id',
      name: 'Other Admin',
      role: 'admin',
    });

    const result = await context.auth.api.setRole({
      body: {
        role: 'sales',
        userId: 'other-admin-user-id',
      },
      headers,
    });

    expect(result.user.role).toBe('sales');
  });

  test('rejects role removal from the last admin through adminUpdateUser', async ({ context }) => {
    const admin = mockSession('admin');
    const headers = await createSignedInAdmin(context, admin);

    await createUser(context.db, {
      email: 'only-other-admin@example.com',
      id: 'only-other-admin-user-id',
      name: 'Only Other Admin',
      role: 'admin',
    });
    await setStoredRole(context.db, admin.user.id, 'sales');

    await expect(
      context.auth.api.adminUpdateUser({
        body: {
          data: {
            role: 'sales',
          },
          userId: 'only-other-admin-user-id',
        },
        headers,
      }),
    ).rejects.toThrow('You cannot remove the last admin.');
  });
});

describe('user phone number validation', () => {
  test('rejects invalid phone numbers when creating a user', async ({ context }) => {
    const headers = await createSignedInAdmin(context);

    await expect(
      context.auth.api.createUser({
        body: {
          email: 'invalid-phone@example.com',
          name: 'Invalid Phone',
          password: DEFAULT_DEMO_USER_PASSWORD,
          role: 'sales',
          data: { phoneNumber: '0821234567' },
        },
        headers,
      }),
    ).rejects.toThrow();
  });

  test('persists valid South African phone numbers', async ({ context }) => {
    const headers = await createSignedInAdmin(context);

    await context.auth.api.createUser({
      body: {
        email: 'valid-phone@example.com',
        name: 'Valid Phone',
        password: DEFAULT_DEMO_USER_PASSWORD,
        role: 'sales',
        data: { phoneNumber: '+27821234567' },
      },
      headers,
    });

    const [created] = await context.db
      .select({ phoneNumber: user.phoneNumber })
      .from(user)
      .where(sql`${user.email} = 'valid-phone@example.com'`);

    expect(created?.phoneNumber).toBe('+27821234567');
  });
});

async function createSignedInAdmin(context: AuthPolicyContext, session = mockSession('admin')): Promise<Headers> {
  await createUser(context.db, {
    email: session.user.email,
    id: session.user.id,
    name: session.user.name,
    password: DEFAULT_DEMO_USER_PASSWORD,
    role: 'admin',
  });

  const { headers } = await context.auth.api.signInEmail({
    body: {
      email: session.user.email,
      password: DEFAULT_DEMO_USER_PASSWORD,
    },
    returnHeaders: true,
  });

  return convertSetCookieToCookie(headers);
}

function convertSetCookieToCookie(headers: Headers): Headers {
  const cookieHeaders = new Headers(headers);
  const cookies = cookieHeaders.get('cookie') ? [cookieHeaders.get('cookie') ?? ''] : [];

  cookieHeaders.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      cookies.push(value.split(';')[0]?.trim() ?? '');
    }
  });

  cookieHeaders.set('cookie', cookies.filter(Boolean).join('; '));
  return cookieHeaders;
}

async function setStoredRole(db: Db, userId: string, role: AppRole): Promise<void> {
  await db.execute(sql`
    UPDATE "user"
    SET role = ${role}, updated_at = ${new Date().toISOString()}
    WHERE id = ${userId}
  `);
}

async function createUser(
  db: Db,
  input: {
    email: string;
    emailVerified?: boolean;
    id: string;
    name: string;
    password?: string;
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

  if (!input.password) {
    return;
  }

  await db
    .insert(account)
    .values({
      accountId: input.id,
      createdAt: now,
      id: `${input.id}-credential-account`,
      password: await hashPassword(input.password),
      providerId: 'credential',
      updatedAt: now,
      userId: input.id,
    })
    .onConflictDoNothing();
}
