import { account, type Db, jobBayOperatorAssignments, jobBays, sql, user } from '@pkg/db';
import { DEFAULT_DEMO_USER_PASSWORD, toPlantDateOnly } from '@pkg/domain';
import { AppRole, type AppRole as AppRoleType } from '@pkg/schema';
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

  test('rejects assigning super-admin from an admin account', async ({ context }) => {
    const headers = await createSignedInAdmin(context);
    await createUser(context.db, {
      email: 'target-super-admin@example.com',
      id: 'target-super-admin-user-id',
      name: 'Target Super Admin',
      role: 'sales',
    });

    await expect(
      context.auth.api.setRole({
        body: {
          role: 'super-admin',
          userId: 'target-super-admin-user-id',
        },
        headers,
      }),
    ).rejects.toThrow('Only a super admin can assign or remove the super admin role.');
  });

  test('rejects removing super-admin from an admin account', async ({ context }) => {
    const headers = await createSignedInAdmin(context);
    await createUser(context.db, {
      email: 'existing-super-admin@example.com',
      id: 'existing-super-admin-user-id',
      name: 'Existing Super Admin',
      role: 'super-admin',
    });

    await expect(
      context.auth.api.setRole({
        body: {
          role: 'sales',
          userId: 'existing-super-admin-user-id',
        },
        headers,
      }),
    ).rejects.toThrow('Only a super admin can assign or remove the super admin role.');
  });

  test('rejects creating a super-admin from an admin account', async ({ context }) => {
    const headers = await createSignedInAdmin(context);

    await expect(
      context.auth.api.createUser({
        body: {
          email: 'created-super-admin@example.com',
          name: 'Created Super Admin',
          password: DEFAULT_DEMO_USER_PASSWORD,
          role: 'super-admin',
        },
        headers,
      }),
    ).rejects.toThrow('Only a super admin can assign or remove the super admin role.');
  });

  test('allows a super-admin to assign and remove super-admin', async ({ context }) => {
    const superAdmin = mockSession('super-admin');
    const headers = await createSignedInAdmin(context, superAdmin);
    await createUser(context.db, {
      email: 'promoted-user@example.com',
      id: 'promoted-user-id',
      name: 'Promoted User',
      role: 'sales',
    });

    const promoted = await context.auth.api.setRole({
      body: {
        role: 'super-admin',
        userId: 'promoted-user-id',
      },
      headers,
    });

    expect(promoted.user.role).toBe('super-admin');

    const demoted = await context.auth.api.setRole({
      body: {
        role: 'sales',
        userId: 'promoted-user-id',
      },
      headers,
    });

    expect(demoted.user.role).toBe('sales');
  });

  test('allows a super-admin to create a super-admin', async ({ context }) => {
    const headers = await createSignedInAdmin(context, mockSession('super-admin'));

    const created = await context.auth.api.createUser({
      body: {
        email: 'created-by-super-admin@example.com',
        name: 'Created By Super Admin',
        password: DEFAULT_DEMO_USER_PASSWORD,
        role: 'super-admin',
      },
      headers,
    });

    expect(created.user.role).toBe('super-admin');
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

  test('rejects changing a bay operator role while they hold an open assignment', async ({ context }) => {
    const headers = await createSignedInAdmin(context);
    await createUser(context.db, {
      email: 'assigned-operator@example.com',
      id: 'assigned-operator-user-id',
      name: 'Assigned Operator',
      role: 'bay-operator',
    });
    await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000b91',
      name: 'Fabrication Bay 1',
    });
    await createBayOperatorAssignment(context.db, {
      bayId: '00000000-0000-4000-8000-000000000b91',
      id: '00000000-0000-4000-8000-000000000a91',
      operatorUserId: 'assigned-operator-user-id',
    });

    await expect(
      context.auth.api.setRole({
        body: {
          role: 'sales',
          userId: 'assigned-operator-user-id',
        },
        headers,
      }),
    ).rejects.toThrow('Unassign from Fabrication Bay 1 first');
  });

  test('rejects bay operator role changes through adminUpdateUser while they hold an open assignment', async ({
    context,
  }) => {
    const headers = await createSignedInAdmin(context);
    await createUser(context.db, {
      email: 'update-assigned-operator@example.com',
      id: 'update-assigned-operator-user-id',
      name: 'Update Assigned Operator',
      role: 'bay-operator',
    });
    await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000b96',
      name: 'Fabrication Bay 5',
    });
    await createBayOperatorAssignment(context.db, {
      bayId: '00000000-0000-4000-8000-000000000b96',
      id: '00000000-0000-4000-8000-000000000a96',
      operatorUserId: 'update-assigned-operator-user-id',
    });

    await expect(
      context.auth.api.adminUpdateUser({
        body: {
          data: {
            role: 'sales',
          },
          userId: 'update-assigned-operator-user-id',
        },
        headers,
      }),
    ).rejects.toThrow('Unassign from Fabrication Bay 5 first');
  });

  test('names multiple open bay assignments deterministically when rejecting role changes', async ({ context }) => {
    const headers = await createSignedInAdmin(context);
    await createUser(context.db, {
      email: 'multi-assigned-operator@example.com',
      id: 'multi-assigned-operator-user-id',
      name: 'Multi Assigned Operator',
      role: 'bay-operator',
    });
    await createBay(context.db, {
      department: 'paint',
      id: '00000000-0000-4000-8000-000000000b93',
      name: 'Paint Bay 2',
    });
    await createBay(context.db, {
      department: 'fabrication',
      id: '00000000-0000-4000-8000-000000000b92',
      name: 'Fabrication Bay 1',
    });
    await createBayOperatorAssignment(context.db, {
      bayId: '00000000-0000-4000-8000-000000000b93',
      id: '00000000-0000-4000-8000-000000000a93',
      operatorUserId: 'multi-assigned-operator-user-id',
    });
    await createBayOperatorAssignment(context.db, {
      bayId: '00000000-0000-4000-8000-000000000b92',
      id: '00000000-0000-4000-8000-000000000a92',
      operatorUserId: 'multi-assigned-operator-user-id',
    });

    await expect(
      context.auth.api.setRole({
        body: {
          role: 'sales',
          userId: 'multi-assigned-operator-user-id',
        },
        headers,
      }),
    ).rejects.toThrow('Unassign from Fabrication Bay 1 and Paint Bay 2 first');
  });

  test('allows role changes when a bay operator has only closed assignments', async ({ context }) => {
    const headers = await createSignedInAdmin(context);
    await createUser(context.db, {
      email: 'previous-operator@example.com',
      id: 'previous-operator-user-id',
      name: 'Previous Operator',
      role: 'bay-operator',
    });
    await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000b94',
      name: 'Fabrication Bay 3',
    });
    await createBayOperatorAssignment(context.db, {
      bayId: '00000000-0000-4000-8000-000000000b94',
      id: '00000000-0000-4000-8000-000000000a94',
      operatorUserId: 'previous-operator-user-id',
      unassignedAt: new Date('2026-06-05T10:00:00.000Z'),
    });

    const result = await context.auth.api.setRole({
      body: {
        role: 'sales',
        userId: 'previous-operator-user-id',
      },
      headers,
    });

    expect(result.user.role).toBe('sales');
  });

  test('allows role changes for bay operators without open assignments', async ({ context }) => {
    const headers = await createSignedInAdmin(context);
    await createUser(context.db, {
      email: 'unassigned-operator@example.com',
      id: 'unassigned-operator-user-id',
      name: 'Unassigned Operator',
      role: 'bay-operator',
    });

    const result = await context.auth.api.setRole({
      body: {
        role: 'sales',
        userId: 'unassigned-operator-user-id',
      },
      headers,
    });

    expect(result.user.role).toBe('sales');
  });

  test('allows no-op role assignment for a bay operator with an open assignment', async ({ context }) => {
    const headers = await createSignedInAdmin(context);
    await createUser(context.db, {
      email: 'same-role-operator@example.com',
      id: 'same-role-operator-user-id',
      name: 'Same Role Operator',
      role: 'bay-operator',
    });
    await createBay(context.db, {
      id: '00000000-0000-4000-8000-000000000b95',
      name: 'Fabrication Bay 4',
    });
    await createBayOperatorAssignment(context.db, {
      bayId: '00000000-0000-4000-8000-000000000b95',
      id: '00000000-0000-4000-8000-000000000a95',
      operatorUserId: 'same-role-operator-user-id',
    });

    const result = await context.auth.api.setRole({
      body: {
        role: 'bay-operator',
        userId: 'same-role-operator-user-id',
      },
      headers,
    });

    expect(result.user.role).toBe('bay-operator');
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
    role: AppRole.parse(session.user.role),
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

async function setStoredRole(db: Db, userId: string, role: AppRoleType): Promise<void> {
  await db.execute(sql`
    UPDATE "user"
    SET role = ${role}, updated_at = ${new Date().toISOString()}
    WHERE id = ${userId}
  `);
}

async function createBay(
  db: Db,
  input: {
    department?: 'fabrication' | 'paint';
    id: string;
    name: string;
  },
) {
  const now = new Date('2026-06-05T08:00:00.000Z');

  await db.insert(jobBays).values({
    createdAt: now,
    department: input.department ?? 'fabrication',
    id: input.id,
    name: input.name,
    scheduleOrigin: toPlantDateOnly(now),
    updatedAt: now,
  });
}

async function createBayOperatorAssignment(
  db: Db,
  input: {
    bayId: string;
    id: string;
    operatorUserId: string;
    unassignedAt?: Date;
  },
) {
  const assignedAt = new Date('2026-06-05T09:00:00.000Z');

  await db.insert(jobBayOperatorAssignments).values({
    assignedAt,
    bayId: input.bayId,
    id: input.id,
    operatorUserId: input.operatorUserId,
    unassignedAt: input.unassignedAt,
  });
}

async function createUser(
  db: Db,
  input: {
    email: string;
    emailVerified?: boolean;
    id: string;
    name: string;
    password?: string;
    role: AppRoleType | string;
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
