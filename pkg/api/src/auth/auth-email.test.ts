import { account, type Db, sql, user } from '@pkg/db';
import { DEFAULT_DEMO_USER_PASSWORD } from '@pkg/domain';
import type { AppRole } from '@pkg/schema';
import { hashPassword } from 'better-auth/crypto';
import { beforeEach, describe, expect } from 'vitest';

import { clearMockEmailMessages, getMockEmailMessages } from '@/email/mock-email.js';
import { createTester } from '@/test/create-tester.js';
import { getSessionFromHeaders } from './session.js';

const test = createTester(({ auth, db }) => ({ auth, db }));

describe('public sign-up is disabled', () => {
  test('rejects direct email/password sign-up', async ({ context }) => {
    await expect(
      context.auth.api.signUpEmail({
        body: {
          email: 'new@example.com',
          name: 'New User',
          password: DEFAULT_DEMO_USER_PASSWORD,
        },
        asResponse: false,
      }),
    ).rejects.toThrow();
  });
});

describe('email sign-in eligibility', () => {
  test('rejects bay operators with a clear account-disabled message', async ({ context }) => {
    await createUserWithCredential(context.db, {
      email: 'operator@example.com',
      emailVerified: true,
      id: '00000000-0000-4000-8000-000000000040',
      name: 'Bay Operator',
      password: DEFAULT_DEMO_USER_PASSWORD,
      role: 'bay-operator',
    });

    await expect(
      context.auth.api.signInEmail({
        body: {
          email: 'operator@example.com',
          password: DEFAULT_DEMO_USER_PASSWORD,
        },
        asResponse: false,
      }),
    ).rejects.toThrow('This account is not enabled for sign-in.');
  });

  test('allows users whose role has at least one permission', async ({ context }) => {
    await createUserWithCredential(context.db, {
      email: 'eligible@example.com',
      emailVerified: true,
      id: '00000000-0000-4000-8000-000000000041',
      name: 'Eligible User',
      password: DEFAULT_DEMO_USER_PASSWORD,
      role: 'sales',
    });

    await expect(
      context.auth.api.signInEmail({
        body: {
          email: 'eligible@example.com',
          password: DEFAULT_DEMO_USER_PASSWORD,
        },
        asResponse: false,
      }),
    ).resolves.toMatchObject({
      user: {
        email: 'eligible@example.com',
        role: 'sales',
      },
    });
  });

  test('treats existing sessions as unauthenticated after a role becomes permissionless', async ({ context }) => {
    await createUserWithCredential(context.db, {
      email: 'demoted@example.com',
      emailVerified: true,
      id: '00000000-0000-4000-8000-000000000042',
      name: 'Demoted User',
      password: DEFAULT_DEMO_USER_PASSWORD,
      role: 'sales',
    });

    const { headers } = await context.auth.api.signInEmail({
      body: {
        email: 'demoted@example.com',
        password: DEFAULT_DEMO_USER_PASSWORD,
      },
      returnHeaders: true,
    });
    const cookieHeaders = convertSetCookieToCookie(headers);

    await expect(getSessionFromHeaders(Object.fromEntries(cookieHeaders), context.auth.api)).resolves.toMatchObject({
      user: {
        email: 'demoted@example.com',
        role: 'sales',
      },
    });

    await setStoredRole(context.db, '00000000-0000-4000-8000-000000000042', 'bay-operator');

    await expect(getSessionFromHeaders(Object.fromEntries(cookieHeaders), context.auth.api)).resolves.toBeNull();
  });
});

describe('password reset email callback', () => {
  beforeEach(() => {
    clearMockEmailMessages();
  });

  test('captures password-reset mock email with app base URL', async ({ context }) => {
    await createUserWithCredential(context.db, {
      email: 'resetme@example.com',
      emailVerified: true,
      id: '00000000-0000-4000-8000-000000000020',
      name: 'Reset Me',
      password: DEFAULT_DEMO_USER_PASSWORD,
    });

    await context.auth.api.requestPasswordReset({
      body: { email: 'resetme@example.com', redirectTo: '/login' },
      asResponse: false,
    });

    const messages = getMockEmailMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ to: 'resetme@example.com', type: 'password-reset' });
    expect(messages[0]?.url).toContain('/reset-password?token=');
    expect(messages[0]?.token).toBeTruthy();
  });

  test('returns without sending email when address is unknown', async ({ context }) => {
    await expect(
      context.auth.api.requestPasswordReset({
        body: { email: 'nonexistent@example.com', redirectTo: '/login' },
        asResponse: false,
      }),
    ).resolves.toBeDefined();

    expect(getMockEmailMessages()).toHaveLength(0);
  });
});

describe('email verification callback', () => {
  beforeEach(() => {
    clearMockEmailMessages();
  });

  test('captures email-verification mock email with app base URL', async ({ context }) => {
    await createUserWithCredential(context.db, {
      email: 'toverify@example.com',
      emailVerified: false,
      id: '00000000-0000-4000-8000-000000000030',
      name: 'To Verify',
      password: DEFAULT_DEMO_USER_PASSWORD,
    });

    await context.auth.api.sendVerificationEmail({
      body: { email: 'toverify@example.com' },
      asResponse: false,
    });

    const messages = getMockEmailMessages();
    const verificationMessage = messages.find((m) => m.to === 'toverify@example.com');
    expect(verificationMessage).toMatchObject({ to: 'toverify@example.com', type: 'email-verification' });
    expect(verificationMessage?.url).toContain('/verify-email?token=');
  });
});

async function createUserWithCredential(
  db: Db,
  input: {
    email: string;
    emailVerified?: boolean;
    id: string;
    name: string;
    password: string;
    role?: AppRole;
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
      role: input.role ?? 'sales',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

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
