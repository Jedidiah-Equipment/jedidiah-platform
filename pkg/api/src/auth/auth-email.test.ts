import { account, CREDENTIAL_ACCOUNT_ISSUER, type Db, user } from '@pkg/db';
import { DEFAULT_DEMO_USER_PASSWORD } from '@pkg/domain';
import type { EquipmentRole } from '@pkg/schema';
import { hashPassword } from 'better-auth/crypto';
import { beforeEach, describe, expect } from 'vitest';

import { clearMockEmailMessages, getMockEmailMessages } from '@/email/mock-email.js';
import { createTester } from '@/test/create-tester.js';

const test = createTester(({ auth, db }) => ({ auth, db }));

// A real scrypt hash of DEFAULT_DEMO_USER_PASSWORD, produced by better-auth 1.6.23 — the version every
// production and staging credential row was written under. 1.7 pins the same `@better-auth/utils`, so
// this is expected to keep verifying; if a future bump ever does change the format, this fails here
// instead of locking every existing user out of sign-in, where the error is indistinguishable from a
// mistyped password.
const LEGACY_1_6_PASSWORD_HASH =
  '669e41d043b9aee8ba5ee688b6f59dbe:e391e0d0fc3c0566252168b2409995f8acfaee710b4657bdcfe47d3d8621b0ce5a33dd21634e24df78bf1699070718589e623509b711a2b2b614036540f2493c';

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

  test('allows a Contracting-only user whose role grants permissions', async ({ context }) => {
    await createUserWithCredential(context.db, {
      contractingRole: 'foreman',
      email: 'contracting-only@example.com',
      emailVerified: true,
      id: '00000000-0000-4000-8000-000000000043',
      name: 'Contracting Only',
      password: DEFAULT_DEMO_USER_PASSWORD,
      role: null,
    });

    await expect(
      context.auth.api.signInEmail({
        body: { email: 'contracting-only@example.com', password: DEFAULT_DEMO_USER_PASSWORD },
        asResponse: false,
      }),
    ).resolves.toMatchObject({ user: { contractingRole: 'foreman', role: null } });
  });
});

describe('auth cookies', () => {
  test('keeps the legacy session cookie name used by released mobile builds', async ({ context }) => {
    await createUserWithCredential(context.db, {
      email: 'cookie-prefix@example.com',
      emailVerified: true,
      id: '00000000-0000-4000-8000-000000000042',
      name: 'Cookie Prefix User',
      password: DEFAULT_DEMO_USER_PASSWORD,
      role: 'sales',
    });

    const { headers } = await context.auth.api.signInEmail({
      body: {
        email: 'cookie-prefix@example.com',
        password: DEFAULT_DEMO_USER_PASSWORD,
      },
      returnHeaders: true,
    });

    expect(headers.get('set-cookie')).toContain('better-auth.session_token=');
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

describe('credential accounts written by better-auth 1.6', () => {
  test('signs in with a hash produced before the 1.7 upgrade', async ({ context }) => {
    await createUserWithCredential(context.db, {
      email: 'legacy-hash@example.com',
      id: '00000000-0000-4000-8000-000000000050',
      name: 'Legacy Hash User',
      passwordHash: LEGACY_1_6_PASSWORD_HASH,
    });

    await expect(
      context.auth.api.signInEmail({
        body: { email: 'legacy-hash@example.com', password: DEFAULT_DEMO_USER_PASSWORD },
        asResponse: false,
      }),
    ).resolves.toMatchObject({ user: { email: 'legacy-hash@example.com' } });
  });
});

async function createUserWithCredential(
  db: Db,
  input: {
    contractingRole?: 'foreman';
    email: string;
    emailVerified?: boolean;
    id: string;
    name: string;
    role?: EquipmentRole | null;
  } & ({ password: string; passwordHash?: never } | { password?: never; passwordHash: string }),
) {
  const now = new Date();

  await db
    .insert(user)
    .values({
      email: input.email,
      emailVerified: input.emailVerified ?? true,
      id: input.id,
      name: input.name,
      contractingRole: input.contractingRole ?? null,
      role: input.role === undefined ? 'sales' : input.role,
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
      issuer: CREDENTIAL_ACCOUNT_ISSUER,
      password: 'passwordHash' in input ? input.passwordHash : await hashPassword(input.password),
      providerId: 'credential',
      updatedAt: now,
      userId: input.id,
    })
    .onConflictDoNothing();
}
