import { createCategory, createMachine, reportBreakdown } from '@pkg/core/contracting';
import { user } from '@pkg/db';
import { accessForRole } from '@pkg/domain/testing';
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
  const person = (id: string, contractingRole: ContractingRole, isDevice = false) => ({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    contractingRole,
    isDevice,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(user)
    .values([
      person('sipho', 'foreman'),
      person('thabo', 'foreman'),
      person('connor', 'workshop-manager'),
      person('danie', 'mechanic'),
      person('bay-tablet', 'mechanic', true),
    ]);
  const category = await createCategory({ db, actorUserId: 'connor', input: { name: 'Tractors', kind: 'machine' } });
  const machine = await createMachine({
    db,
    actorUserId: 'connor',
    input: MachineCreateInput.parse({ code: 'JD6140M-2', make: 'Deere', model: '6140M', categoryId: category.id }),
  });
  const report = async (reporter: string) =>
    (
      await reportBreakdown({
        db,
        actor: accessForRole('foreman', reporter),
        input: {
          subject: { kind: 'machine', id: machine.id },
          urgency: 'code-red',
          description: `Reported by ${reporter}`,
        },
      })
    ).breakdown;
  return { siphos: await report('sipho'), thabos: await report('thabo') };
});

test('a Foreman lists only his own Breakdowns; the workshop manager lists and solves every one', async ({
  context,
}) => {
  const sipho = context.createCaller(sessionAs('sipho', 'foreman')).contractingBreakdowns;
  const connor = context.createCaller(sessionAs('connor', 'workshop-manager')).contractingBreakdowns;
  expect((await sipho.list({})).items.map((row) => row.id)).toEqual([context.siphos.id]);
  await expect(sipho.get({ id: context.thabos.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(sipho.solve({ id: context.siphos.id, closeOutNote: 'Fixed' })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect((await connor.list({})).total).toBe(2);
  const solved = await connor.solve({ id: context.siphos.id, closeOutNote: 'Replaced the hose' });
  expect(solved).toMatchObject({ status: 'solved', actions: { solve: { allowed: false, reason: 'solved' } } });
  expect(await connor.queueSummary()).toEqual({
    counts: { open: 1, 'in-progress': 0, solved: 1 },
    codeRedUnsolved: 1,
  });
});

test('Contracting invoicing cannot see Breakdowns', async ({ context }) => {
  const karen = context.createCaller(sessionAs('karen', 'contracting-invoicing')).contractingBreakdowns;
  await expect(karen.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('the mechanic picker leaves out Device Accounts', async ({ context }) => {
  const connor = context.createCaller(sessionAs('connor', 'workshop-manager')).contractingBreakdowns;
  expect(await connor.options.mechanics()).toEqual([{ id: 'danie', name: 'danie' }]);
});
