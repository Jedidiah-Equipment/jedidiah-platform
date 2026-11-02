import { account, eq, session, user } from '@pkg/db';
import { DEFAULT_DEMO_USER_PASSWORD } from '@pkg/domain';
import { hashPassword } from 'better-auth/crypto';
import { describe, expect, test } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

import { filterSignInEligibleSession, getSessionFromHeaders } from './session.js';

const dbTest = createTester(({ auth, db }) => ({ auth, db }));

describe('filterSignInEligibleSession', () => {
  test('keeps sessions for roles with permissions', () => {
    const session = mockSession('job-viewer');

    expect(filterSignInEligibleSession(session)).toBe(session);
  });

  test('denies existing sessions for permissionless roles', () => {
    expect(filterSignInEligibleSession(mockSession('bay-operator'))).toBeNull();
  });

  test('keeps a Contracting-only session when its role grants permissions', () => {
    const session = mockSession(null);
    session.user.contractingRole = 'foreman';

    expect(filterSignInEligibleSession(session)).toBe(session);
  });
});

describe('getSessionFromHeaders', () => {
  dbTest('reads a session that is due for refresh without extending it', async ({ context }) => {
    const userId = '00000000-0000-4000-8000-000000000051';
    const now = new Date();
    await context.db.insert(user).values({
      createdAt: now,
      email: 'refresh@example.com',
      emailVerified: true,
      id: userId,
      name: 'Refresh User',
      role: 'sales',
      updatedAt: now,
    });
    await context.db.insert(account).values({
      accountId: userId,
      createdAt: now,
      id: `${userId}-credential-account`,
      password: await hashPassword(DEFAULT_DEMO_USER_PASSWORD),
      providerId: 'credential',
      updatedAt: now,
      userId,
    });

    const { headers } = await context.auth.api.signInEmail({
      body: { email: 'refresh@example.com', password: DEFAULT_DEMO_USER_PASSWORD },
      returnHeaders: true,
    });
    const cookie = headers
      .getSetCookie()
      .map((setCookie) => setCookie.split(';')[0])
      .join('; ');
    const dueForRefresh = new Date(Date.now() + 60 * 60 * 1000);
    await context.db.update(session).set({ expiresAt: dueForRefresh }).where(eq(session.userId, userId));

    const read = await getSessionFromHeaders({ cookie }, context.auth.api);

    expect(read?.user.id).toBe(userId);
    const [stored] = await context.db.select().from(session).where(eq(session.userId, userId));
    expect(stored?.expiresAt.getTime()).toBe(dueForRefresh.getTime());
  });
});
