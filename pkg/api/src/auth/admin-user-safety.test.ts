import { account, type DatabaseClient, type Db, user } from '@pkg/db';
import type { AppRole } from '@pkg/schema';
import { hashPassword } from 'better-auth/crypto';
import { describe, expect } from 'vitest';

import { createTester, type TesterScope } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(({ auth, databaseClient, db }) => ({ auth, databaseClient, db }));

type AuthPolicyContext = {
  auth: TesterScope['auth'];
  db: Db;
  databaseClient: DatabaseClient;
};

describe('admin user safety policy', () => {
  test('rejects self-role changes through setRole', async ({ context }) => {
    const admin = mockSession('admin');
    const headers = await createSignedInAdmin(context, admin);

    await expect(
      context.auth.api.setRole({
        body: {
          role: 'product-viewer',
          userId: admin.user.id,
        },
        headers,
      }),
    ).rejects.toThrow('You cannot change your own role.');
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
    await setStoredRole(context.databaseClient, admin.user.id, 'product-viewer');

    await expect(
      context.auth.api.setRole({
        body: {
          role: 'product-viewer',
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
        role: 'product-viewer',
        userId: 'other-admin-user-id',
      },
      headers,
    });

    expect(result.user.role).toBe('product-viewer');
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
    await setStoredRole(context.databaseClient, admin.user.id, 'product-viewer');

    await expect(
      context.auth.api.adminUpdateUser({
        body: {
          data: {
            role: 'product-viewer',
          },
          userId: 'only-other-admin-user-id',
        },
        headers,
      }),
    ).rejects.toThrow('You cannot remove the last admin.');
  });
});

async function createSignedInAdmin(context: AuthPolicyContext, session = mockSession('admin')): Promise<Headers> {
  await createUser(context.db, {
    email: session.user.email,
    id: session.user.id,
    name: session.user.name,
    password: '12345678',
    role: 'admin',
  });

  const { headers } = await context.auth.api.signInEmail({
    body: {
      email: session.user.email,
      password: '12345678',
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

async function setStoredRole(databaseClient: DatabaseClient, userId: string, role: AppRole): Promise<void> {
  await databaseClient.queryClient`
    UPDATE "user"
    SET role = ${role}, updated_at = ${new Date().toISOString()}
    WHERE id = ${userId}
  `;
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
