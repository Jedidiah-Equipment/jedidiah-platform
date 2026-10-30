import { captureReading } from '@pkg/core/contracting';
import { user } from '@pkg/db';
import { accessForRole } from '@pkg/domain/testing';
import { TRPCError } from '@trpc/server';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { getTRPCPublicMetadata } from '@/trpc/errors.js';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { db };
});
test('names the reading an amendment was refused on', async ({ context }) => {
  const managerSession = mockSession(null);
  managerSession.user.contractingRole = 'contracting-manager';
  const manager = context.createCaller(managerSession);
  const category = await manager.contractingFleet.categories.create({ name: 'Tractors', kind: 'machine' });
  const machine = await manager.contractingFleet.machines.create({
    code: 'PAIR-1',
    make: 'Deere',
    model: '6140',
    categoryId: category.id,
  });
  const actor = accessForRole('contracting-manager', managerSession.user.id);
  const spot = (value: number, capturedAt: string) =>
    captureReading({ db: context.db, actor, input: { machineId: machine.id, value, capturedAt } });
  await spot(100, '2026-09-07T08:00:00Z');
  const { reading: later } = await spot(101, '2026-09-07T09:00:00Z');
  const refusal = await manager.contractingReadings
    .amend({ amendments: [{ id: later.id, value: 99, capturedAt: '2026-09-07T09:00:00Z' }], reason: 'Misread' })
    .catch((error: unknown) => error);
  expect(refusal).toBeInstanceOf(TRPCError);
  expect(getTRPCPublicMetadata(refusal as TRPCError)).toMatchObject({ readingId: later.id });
});

test('foremen can find active Machines and read field history without fleet management', async ({ context }) => {
  const adminSession = mockSession(null);
  adminSession.user.contractingRole = 'contracting-admin';
  const admin = context.createCaller(adminSession);
  const category = await admin.contractingFleet.categories.create({ name: 'Tractors', kind: 'machine' });
  const machine = await admin.contractingFleet.machines.create({
    code: 'FIELD-1',
    make: 'Deere',
    model: '6140',
    categoryId: category.id,
  });
  await captureReading({
    db: context.db,
    actor: accessForRole('contracting-admin', adminSession.user.id),
    input: { machineId: machine.id, value: 100, capturedAt: '2026-09-08T08:00:00Z' },
  });
  const foremanSession = mockSession(null);
  foremanSession.user.contractingRole = 'foreman';
  const foreman = context.createCaller(foremanSession);
  expect(await foreman.contractingReadings.fieldMachines()).toEqual([
    {
      id: machine.id,
      code: 'FIELD-1',
      make: 'Deere',
      model: '6140',
      categoryId: category.id,
      categoryName: 'Tractors',
      categoryIcon: 'generic-machine',
      categoryColour: 'indigo',
      currentDriverUserId: null,
      currentDriverName: null,
      serialNumber: null,
      knownHours: 100,
      knownHoursAt: '2026-09-08T08:00:00+00:00',
      knownHoursSource: 'spot',
      serviceIntervalHours: null,
      nextServiceDueHours: null,
      hoursToService: null,
      serviceDueStatus: 'unknown',
      serviceBookedIn: false,
      busyOnJob: null,
      openBreakdowns: [],
      onSiteJobNumber: null,
    },
  ]);
  expect(await foreman.contractingReadings.latest({ machineId: machine.id })).toEqual({
    id: expect.any(String),
    value: 100,
    capturedAt: '2026-09-08T08:00:00.000Z',
    telematicsProvider: null,
  });
  expect(await foreman.contractingReadings.latestTelematics({ machineId: machine.id })).toBeNull();
  await expect(foreman.contractingFleet.machines.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(context.createCaller(mockSession('admin')).contractingReadings.fieldMachines()).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(
    context.createCaller(mockSession('admin')).contractingReadings.latest({ machineId: machine.id }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('estimates a Read At for anyone who captures, behind the business wall', async ({ context }) => {
  const adminSession = mockSession(null);
  adminSession.user.contractingRole = 'contracting-admin';
  const admin = context.createCaller(adminSession);
  const category = await admin.contractingFleet.categories.create({ name: 'Tractors', kind: 'machine' });
  const machine = await admin.contractingFleet.machines.create({
    code: 'EST-1',
    make: 'Deere',
    model: '6140',
    categoryId: category.id,
  });
  const foremanSession = mockSession(null);
  foremanSession.user.contractingRole = 'foreman';
  const input = { machineId: machine.id, value: 120 } as const;
  expect(await context.createCaller(foremanSession).contractingReadings.estimateReadAt(input)).toEqual({
    kind: 'none',
  });
  await captureReading({
    db: context.db,
    actor: accessForRole('contracting-admin', adminSession.user.id),
    input: { machineId: machine.id, value: 100, capturedAt: '2026-09-07T08:00:00Z' },
  });
  expect(await admin.contractingReadings.estimateReadAt(input)).toEqual({ kind: 'now' });
  await expect(
    context.createCaller(mockSession('admin')).contractingReadings.estimateReadAt(input),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
