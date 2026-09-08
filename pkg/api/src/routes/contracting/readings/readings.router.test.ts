import { user } from '@pkg/db';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return {};
});
test('reserves baselines for admins and exceptions for managers, behind the business wall', async ({ context }) => {
  const session = mockSession(null);
  session.user.contractingRole = 'contracting-admin';
  const admin = context.createCaller(session);
  const category = await admin.contractingFleet.categories.create({ name: 'Tractors' });
  const machine = await admin.contractingFleet.machines.create({
    code: 'T1',
    make: 'Deere',
    model: '6140',
    categoryId: category.id,
  });
  const input = { machineId: machine.id, value: 100, capturedAt: '2026-09-07T08:00:00Z' };
  const managerSession = mockSession(null);
  managerSession.user.contractingRole = 'contracting-manager';
  const manager = context.createCaller(managerSession);
  await expect(manager.contractingReadings.captureBaseline(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await admin.contractingReadings.captureBaseline(input)).toMatchObject({
    role: 'baseline',
    value: 100,
    photo: null,
  });
  expect(await manager.contractingReadings.listExceptions()).toEqual([]);
  for (const session of [
    mockSession('admin'),
    Object.assign(mockSession(null), { user: { ...mockSession(null).user, contractingRole: 'foreman' as const } }),
  ]) {
    await expect(context.createCaller(session).contractingReadings.listExceptions()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  }
});

test('foremen can find active Machines and read field history without fleet management or AI results', async ({
  context,
}) => {
  const adminSession = mockSession(null);
  adminSession.user.contractingRole = 'contracting-admin';
  const admin = context.createCaller(adminSession);
  const category = await admin.contractingFleet.categories.create({ name: 'Tractors', presetRate: 900 });
  const machine = await admin.contractingFleet.machines.create({
    code: 'FIELD-1',
    make: 'Deere',
    model: '6140',
    categoryId: category.id,
  });
  await admin.contractingReadings.captureBaseline({
    machineId: machine.id,
    value: 100,
    capturedAt: '2026-09-08T08:00:00Z',
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
      availability: 'in-yard',
    },
  ]);
  const history = await foreman.contractingReadings.fieldHistory({ machineId: machine.id });
  expect(history[0]).toMatchObject({ value: 100, photoBacked: false });
  expect(history[0]).not.toHaveProperty('aiConfidence');
  expect(history[0]).not.toHaveProperty('aiVerification');
  await expect(foreman.contractingFleet.machines.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(context.createCaller(mockSession('admin')).contractingReadings.fieldMachines()).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(
    context.createCaller(mockSession('admin')).contractingReadings.fieldHistory({ machineId: machine.id }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
