import {
  captureReading,
  createAssignment,
  createCategory,
  createCustomer,
  createFarm,
  createJob,
  createMachine,
  createWorkType,
  getJob,
  reportBreakdown,
} from '@pkg/core/contracting';
import { user } from '@pkg/db';
import type { ContractingPushEvent } from '@pkg/domain/contracting';
import { accessForRole } from '@pkg/domain/testing';
import type { ContractingRole } from '@pkg/schema';
import { MachineCreateInput } from '@pkg/schema/contracting';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { sessionAs } from '@/test/test-utils.js';

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
  return { db, machine, siphos: await report('sipho'), thabos: await report('thabo') };
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

test('changing a Breakdown to Code Red schedules its escalation; changing it to Code Green does not', async ({
  context,
}) => {
  const events: ContractingPushEvent[] = [];
  const contracting = { push: { schedule: (event: ContractingPushEvent) => events.push(event) } };
  const connor = context.createCaller(sessionAs('connor', 'workshop-manager'), { contracting }).contractingBreakdowns;
  const { id } = context.siphos;
  expect(await connor.patch({ id, urgency: 'code-green' })).toMatchObject({ id, urgency: 'code-green' });
  expect(events).toEqual([]);
  await connor.patch({ id, urgency: 'code-red' });
  expect(events).toEqual([{ kind: 'breakdown.escalated', breakdownId: id, byUserId: 'connor' }]);
});

test('Contracting invoicing cannot see Breakdowns', async ({ context }) => {
  const karen = context.createCaller(sessionAs('karen', 'contracting-invoicing')).contractingBreakdowns;
  await expect(karen.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('the mechanic picker offers the workshop manager and leaves out Device Accounts', async ({ context }) => {
  const connor = context.createCaller(sessionAs('connor', 'workshop-manager')).contractingBreakdowns;
  expect(await connor.options.mechanics()).toEqual([
    { id: 'connor', name: 'connor' },
    { id: 'danie', name: 'danie' },
  ]);
});

test('serves where a report files and what is open, naming the Job only for a reader who may open it', async ({
  context,
}) => {
  const { db, machine } = context;
  const subject = { kind: 'machine', id: machine.id } as const;
  const asSipho = context.createCaller(sessionAs('sipho', 'foreman')).contractingBreakdowns.field;
  expect(await asSipho.reportContext(subject)).toMatchObject({
    defaultJob: null,
    open: expect.arrayContaining([expect.objectContaining({ id: context.siphos.id })]),
  });

  const admin = accessForRole('contracting-admin', 'connor');
  const customer = await createCustomer({ db, actorUserId: 'connor', input: { name: 'Rowley' } });
  const farm = await createFarm({ db, actorUserId: 'connor', input: { customerId: customer.id, name: 'Rooikraal' } });
  const workType = await createWorkType({ db, actorUserId: 'connor', input: { name: 'Dam building' } });
  const job = await createJob({
    db,
    actor: admin,
    input: {
      customerId: customer.id,
      farmId: farm.id,
      workTypeId: workType.id,
      description: null,
      foremanUserId: 'sipho',
    },
  });
  await createAssignment({ db, actor: admin, input: { jobId: job.id, machineId: machine.id, implementId: null } });
  const [stint] = (await getJob({ db, id: job.id })).assignments;
  if (!stint) throw new Error('Expected Machine Assignment');
  await captureReading({
    db,
    actor: admin,
    input: {
      machineId: machine.id,
      assignmentId: stint.id,
      role: 'arrival',
      value: 100,
      capturedAt: '2026-09-01T06:00:00Z',
      disputePrevious: false,
    },
  });

  const names = { id: job.id, customerName: 'Rowley', farmName: 'Rooikraal', workTypeName: 'Dam building' };
  expect((await asSipho.reportContext(subject)).defaultJob).toEqual({ jobNumber: job.jobNumber, job: names });
  const asThabo = context.createCaller(sessionAs('thabo', 'foreman')).contractingBreakdowns.field;
  expect((await asThabo.reportContext(subject)).defaultJob).toEqual({ jobNumber: job.jobNumber, job: null });
  const asManager = context.createCaller(sessionAs('karen', 'contracting-manager')).contractingBreakdowns.field;
  expect((await asManager.reportContext(subject)).defaultJob).toEqual({ jobNumber: job.jobNumber, job: names });

  const filed = await reportBreakdown({
    db,
    actor: accessForRole('foreman', 'sipho'),
    input: { subject, urgency: 'code-green', description: 'Leaking' },
  });
  expect(filed.breakdown.jobNumber).toBe(job.jobNumber);
});
