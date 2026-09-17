import {
  captureReading,
  createCategory,
  createCustomer,
  createFarm,
  createJob,
  createMachine,
  createWorkType,
  planAssignment,
} from '@pkg/core/contracting';
import { eq, user } from '@pkg/db';
import { contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import type { ContractingRole } from '@pkg/schema';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const foremanId = 'test-user-id';
const managerId = 'router-manager';
const otherForemanId = 'router-other-foreman';

function contractingSession(role: ContractingRole) {
  const session = mockSession(null);
  session.user.contractingRole = role;
  return session;
}

const test = createTester(async ({ db }) => {
  const now = new Date();
  await db.insert(user).values([
    {
      id: foremanId,
      name: 'Sipho',
      email: 'router-sipho@example.com',
      emailVerified: true,
      contractingRole: 'foreman',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: managerId,
      name: 'Henk',
      email: 'router-manager@example.com',
      emailVerified: true,
      contractingRole: 'contracting-manager',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: otherForemanId,
      name: 'Other',
      email: 'router-other@example.com',
      emailVerified: true,
      contractingRole: 'foreman',
      createdAt: now,
      updatedAt: now,
    },
  ]);
  const customer = await createCustomer({ db, actorUserId: managerId, input: { name: 'Rowley' } });
  const farm = await createFarm({
    db,
    actorUserId: managerId,
    input: { customerId: customer.id, name: 'Rooikraal' },
  });
  const workType = await createWorkType({ db, actorUserId: managerId, input: { name: 'Dam building' } });
  const category = await createCategory({
    db,
    actorUserId: managerId,
    input: { name: 'Excavators', kind: 'machine' },
  });
  const machine = await createMachine({
    db,
    actorUserId: managerId,
    input: {
      code: 'CAT320-1',
      make: 'CAT',
      model: '320',
      categoryId: category.id,
      year: null,
      registration: null,
      currentDriverUserId: null,
      notes: null,
      serviceIntervalHours: null,
      nextServiceDueHours: null,
    },
  });
  const base = { customerId: customer.id, farmId: farm.id, workTypeId: workType.id, description: null };
  const ownJob = await createJob({
    db,
    actorUserId: managerId,
    input: { ...base, foremanUserId: foremanId },
  });
  const otherJob = await createJob({
    db,
    actorUserId: managerId,
    input: { ...base, foremanUserId: otherForemanId },
  });
  const pricedJob = await createJob({
    db,
    actorUserId: managerId,
    input: { ...base, foremanUserId: otherForemanId },
  });
  const completedJob = await createJob({
    db,
    actorUserId: managerId,
    input: { ...base, foremanUserId: otherForemanId },
  });
  const stint = await planAssignment({
    db,
    actorUserId: managerId,
    input: { jobId: ownJob.id, machineId: machine.id, implementId: null },
  });
  if (!stint) throw new Error('Expected Machine Assignment');
  await db
    .update(contractingJobs)
    .set({ dieselUnitPrice: 23, dieselAmount: 460 })
    .where(eq(contractingJobs.id, ownJob.id));
  await db
    .update(contractingMachineAssignments)
    .set({ rateUnitAmount: 0, computedAmount: 0, finalAmount: 0 })
    .where(eq(contractingMachineAssignments.id, stint.id));
  await db
    .update(contractingJobs)
    .set({
      status: 'priced',
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      completedAt: now,
      completedByUserId: managerId,
      pricedAt: now,
      pricedByUserId: managerId,
      pricedSubtotal: 100,
      pricedTotal: 100,
    })
    .where(eq(contractingJobs.id, pricedJob.id));
  await db
    .update(contractingJobs)
    .set({
      status: 'completed',
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      completedAt: now,
      completedByUserId: managerId,
    })
    .where(eq(contractingJobs.id, completedJob.id));
  return { completedJob, db, machine, otherJob, ownJob, pricedJob, stint };
});

test('projects only open field Jobs, enforces ownership, and never returns money', async ({ context }) => {
  const foreman = context.createCaller(contractingSession('foreman')).contractingJobs.field;
  const jobs = await foreman.jobs();
  expect(jobs.map((job) => job.id)).toEqual([context.ownJob.id]);
  expect(Object.keys(jobs[0] ?? {})).toEqual([
    'id',
    'code',
    'jobNumber',
    'status',
    'customerName',
    'farmName',
    'workTypeName',
    'description',
    'foremanUserId',
    'stints',
  ]);
  expect(jobs[0]?.stints).toMatchObject([{ id: context.stint.id, state: 'planned' }]);
  await expect(foreman.job({ id: context.otherJob.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });

  const manager = context.createCaller(contractingSession('contracting-manager')).contractingJobs.field;
  expect((await manager.jobs()).map((job) => job.id)).toEqual([context.ownJob.id, context.otherJob.id]);
  const admin = context.createCaller(contractingSession('contracting-admin')).contractingJobs.field;
  expect((await admin.jobs()).map((job) => job.id)).toEqual([context.ownJob.id, context.otherJob.id]);
  const superAdmin = context.createCaller(mockSession('super-admin')).contractingJobs.field;
  expect((await superAdmin.jobs()).map((job) => job.id)).toEqual([context.ownJob.id, context.otherJob.id]);

  const workshopCaller = context.createCaller(contractingSession('workshop-manager'));
  await expect(workshopCaller.contractingJobs.field.jobs()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await captureReading({
    db: context.db,
    actorUserId: foremanId,
    input: {
      machineId: context.machine.id,
      assignmentId: context.stint.id,
      role: 'arrival',
      value: 100,
      capturedAt: '2026-09-17T08:00:00+02:00',
      disputePrevious: false,
    },
  });
  await expect(workshopCaller.contractingReadings.fieldMachines()).resolves.toMatchObject([
    { id: context.machine.id, onSiteJobNumber: context.ownJob.jobNumber },
  ]);
});

test('enforces the Job queue role matrix and strips money from Foreman reads', async ({ context }) => {
  const foreman = context.createCaller(contractingSession('foreman')).contractingJobs;
  expect((await foreman.jobs.list({ queue: 'upcoming' })).map((job) => job.id)).toEqual([context.ownJob.id]);
  expect(await foreman.jobs.get({ id: context.ownJob.id })).toMatchObject({
    dieselUnitPrice: null,
    dieselAmount: null,
    assignments: [{ rateUnitAmount: null, computedAmount: null, finalAmount: null }],
  });
  await expect(foreman.jobs.get({ id: context.otherJob.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(foreman.stints.remove({ id: context.stint.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });

  const workshop = context.createCaller(contractingSession('workshop-manager')).contractingJobs;
  expect((await workshop.jobs.list({ queue: 'upcoming' })).map((job) => job.id)).toEqual([
    context.ownJob.id,
    context.otherJob.id,
  ]);
  await expect(
    workshop.jobs.create({
      customerId: context.ownJob.customerId,
      farmId: context.ownJob.farmId,
      workTypeId: context.ownJob.workTypeId,
      description: null,
      foremanUserId: null,
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });

  const invoicing = context.createCaller(contractingSession('contracting-invoicing')).contractingJobs;
  await expect(invoicing.jobs.list({ queue: 'upcoming' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect((await invoicing.jobs.list({ queue: 'awaiting-pricing' })).map((job) => job.id)).toEqual([
    context.completedJob.id,
  ]);
  expect((await invoicing.jobs.list({ queue: 'awaiting-invoice' })).map((job) => job.id)).toEqual([
    context.pricedJob.id,
  ]);
  await expect(invoicing.jobs.get({ id: context.completedJob.id })).resolves.toMatchObject({
    id: context.completedJob.id,
    status: 'completed',
  });

  for (const role of ['driver', 'mechanic'] as const)
    await expect(
      context.createCaller(contractingSession(role)).contractingJobs.jobs.list({ queue: 'upcoming' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(context.createAnonCaller().contractingJobs.jobs.list({ queue: 'upcoming' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});
