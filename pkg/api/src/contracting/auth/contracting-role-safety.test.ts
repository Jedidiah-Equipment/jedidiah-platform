import {
  createAssignment,
  createCustomer,
  createFarm,
  createJob,
  createWorkType,
  openServiceRecord,
} from '@pkg/core/contracting';
import { account, type Db, eq, user } from '@pkg/db';
import { contractingMachineAssignments } from '@pkg/db/contracting';
import { accessForRole } from '@pkg/domain/testing';
import { type ContractingRole, DateOnlyIso, type EquipmentRole } from '@pkg/schema';
import { hashPassword } from 'better-auth/crypto';
import { expect } from 'vitest';
import { createTester, type TesterContext } from '@/test/create-tester.js';
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
  return { auth, cookies, db };
});

const DRIVER_ASSIGNED_MESSAGE =
  'Unassign this driver from Contracting Machines before changing their role, making them a Device Account, disabling or removing them.';

test('explains how to unblock driver role changes through both user-admin endpoints', async ({ context }) => {
  const fleet = context.createCaller(mockSession('super-admin')).contractingFleet;
  const category = await fleet.categories.create({ name: 'Tractors', kind: 'machine' });
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
        message: DRIVER_ASSIGNED_MESSAGE,
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

test("names the fix for a Machine's default Driver on Disable and Remove, ahead of the history refusal", async ({
  context,
}) => {
  await defaultDriverOf(context, 'driver');

  for (const leave of [context.auth.api.banUser, context.auth.api.removeUser]) {
    await expect(leave({ body: { userId: 'driver' }, headers: context.cookies })).rejects.toMatchObject({
      status: 'FORBIDDEN',
      body: { code: 'fleet.driver_assigned', message: DRIVER_ASSIGNED_MESSAGE },
    });
  }
});

test("refuses to take out the Foreman of an open Job or the Driver of an open Job's Machine Assignment", async ({
  context,
}) => {
  await insertUser(context.db, 'foreman', { contractingRole: 'foreman' });
  const manager = accessForRole('contracting-manager', 'test-user-id');
  const customer = await createCustomer({ db: context.db, actorUserId: manager.userId, input: { name: 'Rowley' } });
  const farm = await createFarm({
    db: context.db,
    actorUserId: manager.userId,
    input: { customerId: customer.id, name: 'Rooikraal' },
  });
  const workType = await createWorkType({
    db: context.db,
    actorUserId: manager.userId,
    input: { name: 'Dam building' },
  });
  const job = await createJob({
    db: context.db,
    actor: manager,
    input: {
      customerId: customer.id,
      farmId: farm.id,
      workTypeId: workType.id,
      description: null,
      foremanUserId: 'foreman',
    },
  });
  const fleet = context.createCaller(mockSession('super-admin')).contractingFleet;
  const category = await fleet.categories.create({ name: 'Tractors', kind: 'machine' });
  const machine = await fleet.machines.create({ code: 'T-1', make: 'Deere', model: '6140M', categoryId: category.id });
  await createAssignment({
    db: context.db,
    actor: manager,
    input: { jobId: job.id, machineId: machine.id, implementId: null },
  });
  await context.db
    .update(contractingMachineAssignments)
    .set({ driverUserId: 'driver' })
    .where(eq(contractingMachineAssignments.jobId, job.id));

  await expect(
    context.auth.api.banUser({ body: { userId: 'foreman' }, headers: context.cookies }),
  ).rejects.toMatchObject({
    status: 'FORBIDDEN',
    body: { message: "Reassign this foreman's open Jobs before changing their role, disabling or removing them." },
  });
  await expect(
    context.auth.api.removeUser({ body: { userId: 'driver' }, headers: context.cookies }),
  ).rejects.toMatchObject({
    status: 'FORBIDDEN',
    body: {
      message:
        "Reassign this driver's open Machine Assignments before changing their role, disabling or removing them.",
    },
  });
});

test('refuses to take out a Mechanic with an open Service Record', async ({ context }) => {
  await insertUser(context.db, 'mechanic', { contractingRole: 'mechanic' });
  const fleet = context.createCaller(mockSession('super-admin')).contractingFleet;
  const category = await fleet.categories.create({ name: 'Tractors', kind: 'machine' });
  const machine = await fleet.machines.create({ code: 'T-1', make: 'Deere', model: '6140M', categoryId: category.id });
  await openServiceRecord({
    db: context.db,
    actorUserId: 'test-user-id',
    input: {
      machineId: machine.id,
      startDate: DateOnlyIso.parse('2026-11-13'),
      primaryMechanicUserId: 'mechanic',
      notes: null,
    },
  });

  await expect(
    context.auth.api.banUser({ body: { userId: 'mechanic' }, headers: context.cookies }),
  ).rejects.toMatchObject({
    status: 'FORBIDDEN',
    body: {
      code: 'breakdown.invalid_mechanic',
      message:
        "Reassign this mechanic's Breakdowns that are not yet Fixed and open Service Records before changing their role, disabling or removing them.",
    },
  });
});

test("a caller without user:ban or user:delete gets better-auth's refusal, never a leaving gate", async ({
  context,
}) => {
  await defaultDriverOf(context, 'driver');
  await insertUser(context.db, 'sales', { role: 'sales' });
  const { headers } = await context.auth.api.signInEmail({
    body: { email: 'sales@example.com', password: 'test123' },
    returnHeaders: true,
  });
  const salesCookies = new Headers({
    cookie: headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; '),
  });

  await expect(context.auth.api.banUser({ body: { userId: 'driver' }, headers: salesCookies })).rejects.toMatchObject({
    body: { code: 'YOU_ARE_NOT_ALLOWED_TO_BAN_USERS' },
  });
  await expect(
    context.auth.api.removeUser({ body: { userId: 'driver' }, headers: salesCookies }),
  ).rejects.toMatchObject({ body: { code: 'YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS' } });
});

async function defaultDriverOf(context: TesterContext, driverUserId: string) {
  const fleet = context.createCaller(mockSession('super-admin')).contractingFleet;
  const category = await fleet.categories.create({ name: 'Tractors', kind: 'machine' });
  await fleet.machines.create({
    code: 'DRIVER-1',
    make: 'Deere',
    model: '6140M',
    categoryId: category.id,
    currentDriverUserId: driverUserId,
  });
}

async function insertUser(
  db: Db,
  id: string,
  slots: { role?: EquipmentRole; contractingRole?: ContractingRole },
): Promise<void> {
  const now = new Date();
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    ...slots,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(account).values({
    id: `${id}-credential`,
    accountId: id,
    userId: id,
    providerId: 'credential',
    password: await hashPassword('test123'),
    createdAt: now,
    updatedAt: now,
  });
}
