import { account, CREDENTIAL_ACCOUNT_ISSUER, type Db, jobBayOperatorAssignments, jobBays, sql, user } from '@pkg/db';
import { DEFAULT_DEMO_USER_PASSWORD, toPlantDateOnly } from '@pkg/domain';
import { type ContractingRole, EquipmentRole, type EquipmentRole as EquipmentRoleType } from '@pkg/schema';
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

  test('forbids role changes from a Contracting-only account instead of throwing a parse error', async ({
    context,
  }) => {
    await createUser(context.db, {
      contractingRole: 'foreman',
      email: 'foreman@example.com',
      id: 'foreman-user-id',
      name: 'Foreman User',
      password: DEFAULT_DEMO_USER_PASSWORD,
    });
    const { headers } = await context.auth.api.signInEmail({
      body: { email: 'foreman@example.com', password: DEFAULT_DEMO_USER_PASSWORD },
      returnHeaders: true,
    });

    await expect(
      context.auth.api.setRole({
        body: { role: 'sales', userId: 'target-user-id' },
        headers: convertSetCookieToCookie(headers),
      }),
    ).rejects.toMatchObject({ status: 'FORBIDDEN' });
  });

  test('assigns the Stores role and allows the user to sign in', async ({ context }) => {
    const headers = await createSignedInAdmin(context);
    await createUser(context.db, {
      email: 'stores-user@example.com',
      id: 'stores-user-id',
      name: 'Stores User',
      password: DEFAULT_DEMO_USER_PASSWORD,
      role: 'sales',
    });

    const result = await context.auth.api.setRole({
      body: {
        role: 'stores',
        userId: 'stores-user-id',
      },
      headers,
    });

    expect(result.user.role).toBe('stores');
    await expect(
      context.auth.api.signInEmail({
        body: {
          email: 'stores-user@example.com',
          password: DEFAULT_DEMO_USER_PASSWORD,
        },
      }),
    ).resolves.toMatchObject({ user: { email: 'stores-user@example.com', role: 'stores' } });
  });

  test('rejects demoting the last admin through setRole', async ({ context }) => {
    const headers = await createSignedInAdmin(context, mockSession('super-admin'));
    await createUser(context.db, {
      email: 'other-admin@example.com',
      id: 'other-admin-user-id',
      name: 'Other Admin',
      role: 'admin',
    });

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
          data: { equipmentRole: 'super-admin' },
          email: 'created-super-admin@example.com',
          name: 'Created Super Admin',
          password: DEFAULT_DEMO_USER_PASSWORD,
        },
        headers,
      }),
    ).rejects.toThrow('Only a super admin can assign or remove the super admin role.');
  });

  test('rejects Better Auth role spellings on create-user and update-user', async ({ context }) => {
    const headers = await createSignedInAdmin(context, mockSession('super-admin'));

    await expect(
      context.auth.api.createUser({
        body: {
          email: 'native-role@example.com',
          name: 'Native Role',
          password: DEFAULT_DEMO_USER_PASSWORD,
          role: 'sales',
        },
        headers,
      }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' });
    await expect(
      context.auth.api.createUser({
        body: {
          data: { role: 'sales' },
          email: 'data-role@example.com',
          name: 'Data Role',
          password: DEFAULT_DEMO_USER_PASSWORD,
        },
        headers,
      }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' });
    await expect(
      context.auth.api.adminUpdateUser({
        body: { data: { role: 'sales' }, userId: 'target-user-id' },
        headers,
      }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' });
  });

  test('creates a user with no equipment role as having none, not the Better Auth default', async ({ context }) => {
    const headers = await createSignedInAdmin(context);

    await context.auth.api.createUser({
      body: {
        email: 'no-role@example.com',
        name: 'No Role',
        password: DEFAULT_DEMO_USER_PASSWORD,
      },
      headers,
    });

    const [created] = await context.db
      .select({ contractingRole: user.contractingRole, equipmentRole: user.role })
      .from(user)
      .where(sql`${user.email} = 'no-role@example.com'`);

    expect(created).toEqual({ contractingRole: null, equipmentRole: null });
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
        data: { equipmentRole: 'super-admin' },
        email: 'created-by-super-admin@example.com',
        name: 'Created By Super Admin',
        password: DEFAULT_DEMO_USER_PASSWORD,
      },
      headers,
    });

    expect(created.user.role).toBe('super-admin');
  });

  test('persists shared-device state in the admin user insert', async ({ context }) => {
    const headers = await createSignedInAdmin(context);

    await context.auth.api.createUser({
      body: {
        data: { equipmentRole: 'stores', isDevice: true },
        email: 'stores-device@example.com',
        name: 'Stores Device',
        password: DEFAULT_DEMO_USER_PASSWORD,
      },
      headers,
    });

    const [created] = await context.db
      .select({ isDevice: user.isDevice })
      .from(user)
      .where(sql`${user.email} = 'stores-device@example.com'`);

    expect(created?.isDevice).toBe(true);
  });

  test('creates a contracting-only user without temporary Equipment access', async ({ context }) => {
    const headers = await createSignedInAdmin(context);

    await context.auth.api.createUser({
      body: {
        data: { contractingRole: 'foreman', equipmentRole: null },
        email: 'contracting-only@example.com',
        name: 'Contracting Only',
        password: DEFAULT_DEMO_USER_PASSWORD,
      },
      headers,
    });

    const [created] = await context.db
      .select({ contractingRole: user.contractingRole, equipmentRole: user.role })
      .from(user)
      .where(sql`${user.email} = 'contracting-only@example.com'`);

    expect(created).toEqual({ contractingRole: 'foreman', equipmentRole: null });
  });

  test('rejects role removal from the last admin through adminUpdateUser', async ({ context }) => {
    const headers = await createSignedInAdmin(context, mockSession('super-admin'));

    await createUser(context.db, {
      email: 'only-other-admin@example.com',
      id: 'only-other-admin-user-id',
      name: 'Only Other Admin',
      role: 'admin',
    });
    await expect(
      context.auth.api.adminUpdateUser({
        body: {
          data: {
            equipmentRole: 'sales',
          },
          userId: 'only-other-admin-user-id',
        },
        headers,
      }),
    ).rejects.toThrow('You cannot remove the last admin.');
  });

  test('rejects removing the equipment role from the last admin', async ({ context }) => {
    const headers = await createSignedInAdmin(context, mockSession('super-admin'));

    await createUser(context.db, {
      email: 'only-nullable-admin@example.com',
      id: 'only-nullable-admin-user-id',
      name: 'Only Nullable Admin',
      role: 'admin',
    });
    await expect(
      context.auth.api.adminUpdateUser({
        body: {
          data: {
            equipmentRole: null,
          },
          userId: 'only-nullable-admin-user-id',
        },
        headers,
      }),
    ).rejects.toThrow('You cannot remove the last admin.');
  });

  test('clears Equipment access while preserving Contracting access', async ({ context }) => {
    const headers = await createSignedInAdmin(context);
    await createUser(context.db, {
      contractingRole: 'foreman',
      email: 'contracting-only-target@example.com',
      id: 'contracting-only-target-id',
      name: 'Contracting Only Target',
      role: 'sales',
    });

    await context.auth.api.adminUpdateUser({
      body: {
        data: { equipmentRole: null },
        userId: 'contracting-only-target-id',
      },
      headers,
    });

    const [updated] = await context.db
      .select({ contractingRole: user.contractingRole, equipmentRole: user.role })
      .from(user)
      .where(sql`${user.id} = 'contracting-only-target-id'`);

    expect(updated).toEqual({ contractingRole: 'foreman', equipmentRole: null });
  });

  test('rejects clearing your own Equipment role', async ({ context }) => {
    const admin = mockSession('admin');
    const headers = await createSignedInAdmin(context, admin);

    await expect(
      context.auth.api.adminUpdateUser({
        body: { data: { equipmentRole: null }, userId: admin.user.id },
        headers,
      }),
    ).rejects.toThrow('You cannot change your own role.');
  });

  test('does not treat the nullable admin transport field as an ordinary profile field', async ({ context }) => {
    const admin = mockSession('admin');
    const headers = await createSignedInAdmin(context, admin);

    await expect(
      context.auth.api.updateUser({
        body: { equipmentRole: 'super-admin' } as never,
        headers,
      }),
    ).rejects.toThrow();

    const [stored] = await context.db
      .select({ equipmentRole: user.role })
      .from(user)
      .where(sql`${user.id} = ${admin.user.id}`);

    expect(stored?.equipmentRole).toBe('admin');
  });

  test('rejects invalid role transport values as a bad request', async ({ context }) => {
    const headers = await createSignedInAdmin(context);

    await expect(
      context.auth.api.adminUpdateUser({
        body: {
          data: { equipmentRole: 'bogus-role' },
          userId: 'target-user-id',
        },
        headers,
      }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' });
  });

  test('persists an independently assigned contracting role', async ({ context }) => {
    const headers = await createSignedInAdmin(context);
    await createUser(context.db, {
      email: 'contracting-user@example.com',
      id: 'contracting-user-id',
      name: 'Contracting User',
      role: 'sales',
    });

    await context.auth.api.adminUpdateUser({
      body: {
        data: {
          contractingRole: 'foreman',
        },
        userId: 'contracting-user-id',
      },
      headers,
    });

    const [updated] = await context.db
      .select({ contractingRole: user.contractingRole, equipmentRole: user.role })
      .from(user)
      .where(sql`${user.id} = 'contracting-user-id'`);

    expect(updated).toEqual({ contractingRole: 'foreman', equipmentRole: 'sales' });
  });

  test('rejects changing your own contracting role', async ({ context }) => {
    const admin = mockSession('admin');
    const headers = await createSignedInAdmin(context, admin);

    await expect(
      context.auth.api.adminUpdateUser({
        body: {
          data: {
            contractingRole: 'contracting-admin',
          },
          userId: admin.user.id,
        },
        headers,
      }),
    ).rejects.toThrow('You cannot change your own role.');
  });

  test('rejects super-admin as a contracting role value', async ({ context }) => {
    const headers = await createSignedInAdmin(context, mockSession('super-admin'));
    await createUser(context.db, {
      email: 'contracting-super-admin@example.com',
      id: 'contracting-super-admin-user-id',
      name: 'Contracting Super Admin',
      role: 'sales',
    });

    await expect(
      context.auth.api.adminUpdateUser({
        body: {
          data: {
            contractingRole: 'super-admin',
          },
          userId: 'contracting-super-admin-user-id',
        },
        headers,
      }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' });
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
            equipmentRole: 'sales',
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

  test('allows admins to update user email and profile fields through adminUpdateUser', async ({ context }) => {
    const headers = await createSignedInAdmin(context);
    await createUser(context.db, {
      email: 'editable-user@example.com',
      id: 'editable-user-id',
      name: 'Editable User',
      password: DEFAULT_DEMO_USER_PASSWORD,
      role: 'sales',
    });

    const result = await context.auth.api.adminUpdateUser({
      body: {
        data: {
          email: 'RENAMED-USER@example.com',
          emailVerified: true,
          name: 'Renamed User',
          phoneNumber: '+27821234567',
        },
        userId: 'editable-user-id',
      },
      headers,
    });

    expect(result).toMatchObject({
      email: 'renamed-user@example.com',
      emailVerified: true,
      name: 'Renamed User',
      phoneNumber: '+27821234567',
    });

    await expect(
      context.auth.api.signInEmail({
        body: {
          email: 'renamed-user@example.com',
          password: DEFAULT_DEMO_USER_PASSWORD,
        },
      }),
    ).resolves.toMatchObject({
      user: {
        email: 'renamed-user@example.com',
        id: 'editable-user-id',
      },
    });
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
          data: { equipmentRole: 'sales', phoneNumber: '0821234567' },
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
        data: { equipmentRole: 'sales', phoneNumber: '+27821234567' },
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
    role: EquipmentRole.parse(session.user.role),
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
    contractingRole?: ContractingRole;
    email: string;
    emailVerified?: boolean;
    id: string;
    name: string;
    password?: string;
    role?: EquipmentRoleType | string;
  },
) {
  const now = new Date();

  await db
    .insert(user)
    .values({
      email: input.email,
      emailVerified: input.emailVerified ?? true,
      contractingRole: input.contractingRole,
      id: input.id,
      name: input.name,
      role: input.role === undefined ? null : EquipmentRole.parse(input.role),
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
      issuer: CREDENTIAL_ACCOUNT_ISSUER,
      password: await hashPassword(input.password),
      providerId: 'credential',
      updatedAt: now,
      userId: input.id,
    })
    .onConflictDoNothing();
}
