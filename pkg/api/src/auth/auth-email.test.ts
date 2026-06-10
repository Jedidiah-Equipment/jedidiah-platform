import { account, type Db, user } from '@pkg/db';
import { DEFAULT_DEMO_USER_PASSWORD } from '@pkg/domain';
import type { AppRole } from '@pkg/schema';
import { hashPassword } from 'better-auth/crypto';
import { beforeEach, describe, expect } from 'vitest';

import { clearMockEmailMessages, getMockEmailMessages } from '@/email/mock-email.js';
import { createTester } from '@/test/create-tester.js';

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
