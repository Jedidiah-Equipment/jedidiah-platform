import { createCategory, createMachine } from '@pkg/core/contracting';
import { user } from '@pkg/db';
import type { ContractingRole } from '@pkg/schema';
import { MachineCreateInput } from '@pkg/schema/contracting';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

function sessionAs(id: string, role: ContractingRole) {
  const session = mockSession(null);
  session.user.id = id;
  session.session.userId = id;
  session.user.contractingRole = role;
  return session;
}

const test = createTester(async ({ db }) => {
  const now = new Date();
  const person = (id: string, contractingRole: ContractingRole) => ({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    contractingRole,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(user).values([person('connor', 'workshop-manager'), person('sipho', 'foreman')]);
  const category = await createCategory({ db, actorUserId: 'connor', input: { name: 'Tractors', kind: 'machine' } });
  const machine = await createMachine({
    db,
    actorUserId: 'connor',
    input: MachineCreateInput.parse({ code: 'JD6140M-2', make: 'Deere', model: '6140M', categoryId: category.id }),
  });
  return { machine };
});

test('the workshop manager closes a service with the sticker; a below-reading due is a bad request', async ({
  context,
}) => {
  const connor = context.createCaller(sessionAs('connor', 'workshop-manager'));
  const opened = await connor.contractingServices.open({
    machineId: context.machine.id,
    startDate: '2026-10-01',
    notes: null,
  });
  await expect(
    connor.contractingServices.close({
      id: opened.id,
      endDate: '2026-10-01',
      readingAtServiceHours: 1450,
      primaryMechanicUserId: null,
      notes: null,
      nextServiceDueHours: 1400,
    }),
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  await connor.contractingServices.close({
    id: opened.id,
    endDate: '2026-10-01',
    readingAtServiceHours: 1450,
    primaryMechanicUserId: null,
    notes: null,
    nextServiceDueHours: 1700,
  });
  expect(await connor.contractingFleet.machines.get({ id: context.machine.id })).toMatchObject({
    nextServiceDueHours: 1700,
  });
  await expect(connor.contractingServices.patch({ id: opened.id, notes: 'Late note' })).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});

test('a Foreman cannot record a service', async ({ context }) => {
  const sipho = context.createCaller(sessionAs('sipho', 'foreman'));
  await expect(
    sipho.contractingServices.open({ machineId: context.machine.id, startDate: '2026-10-01', notes: null }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
