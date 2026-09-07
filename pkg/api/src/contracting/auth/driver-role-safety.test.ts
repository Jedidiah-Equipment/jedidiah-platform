import { account, CREDENTIAL_ACCOUNT_ISSUER, user } from '@pkg/db';
import { hashPassword } from 'better-auth/crypto';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db, auth }) => {
  const now = new Date();
  await db.insert(user).values([
    {
      id: 'test-user-id',
      name: 'Admin',
      email: 'admin@example.com',
      emailVerified: true,
      role: 'super-admin',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'driver',
      name: 'Driver',
      email: 'driver@example.com',
      emailVerified: false,
      contractingRole: 'driver',
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await db.insert(account).values({
    id: 'admin-credential',
    accountId: 'test-user-id',
    userId: 'test-user-id',
    issuer: CREDENTIAL_ACCOUNT_ISSUER,
    providerId: 'credential',
    password: await hashPassword('test123'),
    createdAt: now,
    updatedAt: now,
  });
  const { headers } = await auth.api.signInEmail({
    body: { email: 'admin@example.com', password: 'test123' },
    returnHeaders: true,
  });
  const cookies = new Headers({
    cookie: headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; '),
  });
  return { auth, cookies };
});

test('explains how to unblock driver role changes through both user-admin endpoints', async ({ context }) => {
  const fleet = context.createCaller(mockSession('super-admin')).contractingFleet;
  const category = await fleet.categories.create({ name: 'Tractors' });
  const machine = await fleet.machines.create({
    code: 'DRIVER-1',
    make: 'Deere',
    model: '6140M',
    categoryId: category.id,
    currentDriverUserId: 'driver',
  });
  for (const data of [{ contractingRole: 'foreman' }, { equipmentRole: 'super-admin' }, { isDevice: true }]) {
    await expect(
      context.auth.api.adminUpdateUser({ body: { userId: 'driver', data }, headers: context.cookies }),
    ).rejects.toMatchObject({
      status: 'FORBIDDEN',
      body: {
        code: 'fleet.driver_assigned',
        message:
          'Unassign this driver from Contracting Machines before changing their role or making them a Device Account.',
      },
    });
  }
  await expect(
    context.auth.api.setRole({ body: { userId: 'driver', role: 'super-admin' }, headers: context.cookies }),
  ).rejects.toMatchObject({ status: 'FORBIDDEN', body: { code: 'fleet.driver_assigned' } });
  await fleet.machines.patch({ id: machine.id, currentDriverUserId: null });
  await expect(
    context.auth.api.adminUpdateUser({
      body: { userId: 'driver', data: { contractingRole: 'foreman' } },
      headers: context.cookies,
    }),
  ).resolves.toMatchObject({ contractingRole: 'foreman' });
});
