import {
  captureReading,
  createCategory,
  createChargeLine,
  createCustomer,
  createFarm,
  createImplement,
  createJob,
  createMachine,
  createMeasureType,
  createWorkType,
  planAssignment,
} from '@pkg/core/contracting';
import { eq, user } from '@pkg/db';
import { contractingHourReadings, contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import type { ContractingRole } from '@pkg/schema';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const foremanId = 'test-user-id';
const managerId = 'router-manager';
const otherForemanId = 'router-other-foreman';
const driverId = 'router-driver';

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
    {
      id: driverId,
      name: 'Willem',
      email: 'router-driver@example.com',
      emailVerified: true,
      contractingRole: 'driver',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'router-driver-device',
      name: 'Driver tablet',
      email: 'router-driver-device@example.com',
      emailVerified: true,
      contractingRole: 'driver',
      isDevice: true,
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
  const implementCategory = await createCategory({
    db,
    actorUserId: managerId,
    input: { name: 'Tip trailers', kind: 'implement' },
  });
  const implement = await createImplement({
    db,
    actorUserId: managerId,
    input: { code: 'TIP-1', categoryId: implementCategory.id, notes: null },
  });
  const otherMachine = await createMachine({
    db,
    actorUserId: managerId,
    input: {
      code: 'CAT320-2',
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
    input: { ...base, foremanUserId: foremanId },
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
  const otherStint = await planAssignment({
    db,
    actorUserId: managerId,
    input: { jobId: otherJob.id, machineId: otherMachine.id, implementId: implement.id },
  });
  if (!otherStint) throw new Error('Expected other Machine Assignment');
  await captureReading({
    db,
    actorUserId: otherForemanId,
    input: {
      machineId: otherMachine.id,
      assignmentId: otherStint.id,
      role: 'arrival',
      value: 100,
      capturedAt: '2026-09-16T08:00:00+02:00',
      disputePrevious: false,
    },
  });
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
  return { completedJob, db, implement, machine, otherJob, otherMachine, otherStint, ownJob, pricedJob, stint };
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
  await expect(foreman.implements()).resolves.toMatchObject([
    { id: context.implement.id, onSiteJobNumber: context.otherJob.jobNumber },
  ]);
  await expect(foreman.drivers()).resolves.toEqual([{ id: driverId, name: 'Willem' }]);

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
  await expect(workshopCaller.contractingReadings.fieldMachines()).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: context.machine.id, onSiteJobNumber: context.ownJob.jobNumber }),
    ]),
  );
});

test('enforces the Job queue role matrix and strips money from Foreman reads', async ({ context }) => {
  const foreman = context.createCaller(contractingSession('foreman')).contractingJobs;
  expect((await foreman.jobs.list({ queue: 'upcoming' })).map((job) => job.id)).toEqual([context.ownJob.id]);
  expect(await foreman.jobs.get({ id: context.ownJob.id })).toMatchObject({
    dieselUnitPrice: null,
    dieselAmount: null,
    pricing: null,
    assignments: [{ rateUnitAmount: null, computedAmount: null, finalAmount: null }],
  });
  await expect(foreman.jobs.get({ id: context.otherJob.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(foreman.jobs.get({ id: context.pricedJob.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await foreman.jobs.list({ queue: 'awaiting-invoice' })).toEqual([]);
  await expect(foreman.stints.remove({ id: context.stint.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });

  const workshop = context.createCaller(contractingSession('workshop-manager')).contractingJobs;
  expect((await workshop.jobs.list({ queue: 'upcoming' })).map((job) => job.id)).toEqual([context.ownJob.id]);
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

test('provides Measure Type choices to managers without granting Rate Card access', async ({ context }) => {
  const first = await createMeasureType({ db: context.db, actorUserId: managerId, input: { name: 'Loads' } });
  const second = await createMeasureType({ db: context.db, actorUserId: managerId, input: { name: 'Hectares' } });
  const manager = context.createCaller(contractingSession('contracting-manager'));
  expect(await manager.contractingJobs.options.measureTypes()).toEqual([
    { id: first.id, name: 'Loads' },
    { id: second.id, name: 'Hectares' },
  ]);
  await expect(manager.contractingRateCard.measureTypes.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(
    context.createCaller(contractingSession('foreman')).contractingJobs.options.measureTypes(),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('rejects Charge Line changes after pricing so the priced total cannot become stale', async ({ context }) => {
  await expect(
    createChargeLine({
      db: context.db,
      actorUserId: managerId,
      input: { jobId: context.pricedJob.id, description: 'Extra transport' },
    }),
  ).rejects.toMatchObject({ code: 'contracting_job.wrong_status' });
});

test('counts queue tabs by read mode and exposes capture evidence on Job details', async ({ context }) => {
  const manager = context.createCaller(contractingSession('contracting-manager')).contractingJobs.jobs;
  const foreman = context.createCaller(contractingSession('foreman')).contractingJobs.jobs;
  const invoicing = context.createCaller(contractingSession('contracting-invoicing')).contractingJobs.jobs;
  expect(await manager.queueCounts()).toMatchObject({
    upcoming: 1,
    active: 1,
    'looks-finished': 0,
    'awaiting-pricing': 1,
    'awaiting-invoice': 1,
  });
  expect(await foreman.queueCounts()).toMatchObject({
    upcoming: 1,
    active: 0,
    'awaiting-pricing': 0,
    'awaiting-invoice': 0,
    invoiced: 0,
  });
  expect(await invoicing.queueCounts()).toMatchObject({ upcoming: 0, active: 0, 'awaiting-pricing': 1 });
  expect(await manager.activeAttention()).toBe(false);
  expect(await foreman.activeAttention()).toBe(false);
  expect(await invoicing.activeAttention()).toBe(false);
  expect(await manager.get({ id: context.otherJob.id })).toMatchObject({
    assignments: [
      { arrival: { comment: null, aiConfidence: null, capturedByName: 'Other', needsALook: ['missing-photo'] } },
    ],
  });
  const arrivalId = (await manager.get({ id: context.otherJob.id })).assignments[0]?.arrival?.id;
  if (!arrivalId) throw new Error('Expected arrival reading');
  await context.db
    .update(contractingHourReadings)
    .set({ aiValue: 101, aiConfidence: 0.87, aiVerification: 'pending' })
    .where(eq(contractingHourReadings.id, arrivalId));
  expect(await manager.activeAttention()).toBe(true);
  expect(await foreman.activeAttention()).toBe(false);
  expect(await manager.get({ id: context.otherJob.id })).toMatchObject({
    assignments: [{ arrival: { aiConfidence: 0.87, needsALook: ['ai-pending', 'missing-photo'] } }],
  });
  const departure = {
    machineId: context.otherMachine.id,
    assignmentId: context.otherStint.id,
    role: 'departure' as const,
    value: 102,
    capturedAt: '2026-09-17T17:00:00+02:00',
    disputePrevious: false,
  };
  await expect(
    captureReading({ db: context.db, actorUserId: foremanId, input: { ...departure, comment: 'Shift ended' } }),
  ).rejects.toMatchObject({ code: 'reading.forbidden' });
  await expect(captureReading({ db: context.db, actorUserId: managerId, input: departure })).rejects.toMatchObject({
    code: 'reading.invalid_role',
  });
  await captureReading({ db: context.db, actorUserId: managerId, input: { ...departure, comment: 'Shift ended' } });
  expect(await manager.get({ id: context.otherJob.id })).toMatchObject({
    assignments: [{ departure: { capturedByName: 'Henk', comment: 'Shift ended', photoBacked: false } }],
  });
});

test('keeps Pricing to contracting-admin and super-admin while managers read the live totals', async ({ context }) => {
  const jobId = context.completedJob.id;
  const manager = context.createCaller(contractingSession('contracting-manager')).contractingJobs;
  const attempts = [
    () => manager.pricing.setStintRate({ assignmentId: context.stint.id, rateId: null }),
    () => manager.pricing.clearStintRate({ assignmentId: context.stint.id }),
    () => manager.pricing.setStintAmount({ assignmentId: context.stint.id, finalAmount: null }),
    () => manager.pricing.setDiesel({ jobId, unitPrice: null }),
    () => manager.pricing.setDiscount({ jobId, discount: null }),
    () => manager.pricing.markPriced({ id: jobId, expectedTotal: 0 }),
  ];
  for (const attempt of attempts) await expect(attempt()).rejects.toMatchObject({ code: 'FORBIDDEN' });

  const superAdmin = context.createCaller(mockSession('super-admin')).contractingJobs;
  await expect(
    superAdmin.pricing.setDiscount({ jobId, discount: { kind: 'percent', value: 5 } }),
  ).resolves.toMatchObject({ discountKind: 'percent', pricing: { total: 0, gate: { ok: true } } });
  expect(await manager.jobs.get({ id: jobId })).toMatchObject({ pricing: { total: 0 } });
  const admin = context.createCaller(contractingSession('contracting-admin')).contractingJobs;
  await expect(admin.pricing.markPriced({ id: jobId, expectedTotal: 1 })).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(admin.pricing.markPriced({ id: jobId, expectedTotal: 0 })).resolves.toMatchObject({
    status: 'priced',
    pricedTotal: 0,
  });
});

test('lets Invoicing list, read and stamp Priced Jobs while every other write stays out of reach', async ({
  context,
}) => {
  const invoicing = context.createCaller(contractingSession('contracting-invoicing')).contractingJobs;
  expect(await invoicing.jobs.list({ queue: 'awaiting-invoice' })).toMatchObject([
    { id: context.pricedJob.id, pricedTotal: 100, pricedAt: expect.any(String), invoiceNumber: null },
  ]);
  await expect(invoicing.jobs.list({ queue: 'active' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(invoicing.jobs.get({ id: context.pricedJob.id })).resolves.toMatchObject({
    pricedSubtotal: 100,
    pricedTotal: 100,
  });
  for (const attempt of [
    () => invoicing.pricing.markPriced({ id: context.completedJob.id, expectedTotal: 0 }),
    () => invoicing.jobs.patch({ id: context.pricedJob.id, notes: 'Keyed in' }),
    () => invoicing.stints.remove({ id: context.stint.id }),
  ])
    await expect(attempt()).rejects.toMatchObject({ code: 'FORBIDDEN' });

  const manager = context.createCaller(contractingSession('contracting-manager')).contractingJobs;
  expect(await manager.jobs.list({ queue: 'awaiting-invoice' })).toMatchObject([{ pricedTotal: 100 }]);
  await expect(
    manager.invoicing.stamp({ id: context.pricedJob.id, invoiceNumber: 'INV-1', expectedTotal: 100 }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });

  await expect(
    invoicing.invoicing.stamp({ id: context.pricedJob.id, invoiceNumber: 'INV-1', expectedTotal: 99 }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(
    invoicing.invoicing.stamp({ id: context.pricedJob.id, invoiceNumber: ' INV-1 ', expectedTotal: 100 }),
  ).resolves.toMatchObject({ status: 'invoiced', invoiceNumber: 'INV-1' });
  expect(await invoicing.invoicing.byNumber({ invoiceNumber: 'inv-1' })).toEqual([
    expect.objectContaining({ id: context.pricedJob.id, jobNumber: context.pricedJob.jobNumber }),
  ]);
  expect(await manager.invoicing.byNumber({ invoiceNumber: 'INV-1' })).toHaveLength(1);
  await expect(
    context.createCaller(contractingSession('foreman')).contractingJobs.invoicing.byNumber({ invoiceNumber: 'INV-1' }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('filters the Invoiced queue by the South African month it was stamped in, and no other queue', async ({
  context,
}) => {
  // 23:30 UTC on 31 August is 01:30 on 1 September in Johannesburg.
  await context.db
    .update(contractingJobs)
    .set({ status: 'invoiced', invoiceNumber: 'INV-9', invoicedAt: new Date('2026-08-31T23:30:00Z') })
    .where(eq(contractingJobs.id, context.pricedJob.id));
  const invoicing = context.createCaller(contractingSession('contracting-invoicing')).contractingJobs.jobs;
  const invoicedIn = async (month: string) =>
    (await invoicing.list({ queue: 'invoiced', invoicedInMonth: month })).map((job) => job.id);

  expect(await invoicedIn('2026-09-01')).toEqual([context.pricedJob.id]);
  expect(await invoicedIn('2026-08-01')).toEqual([]);
  expect(
    (await invoicing.list({ queue: 'awaiting-pricing', invoicedInMonth: '2026-08-01' })).map((job) => job.id),
  ).toEqual([context.completedJob.id]);
});
