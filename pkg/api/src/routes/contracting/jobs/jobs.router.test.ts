import {
  captureReading,
  createAssignment,
  createCategory,
  createCustomer,
  createFarm,
  createImplement,
  createJob,
  createMachine,
  createMeasureType,
  createWorkType,
  getJob,
} from '@pkg/core/contracting';
import { eq, user } from '@pkg/db';
import { contractingHourReadings, contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import { accessForRole } from '@pkg/domain/testing';
import type { ContractingRole } from '@pkg/schema';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const foremanId = 'test-user-id';
const managerId = 'router-manager';
const otherForemanId = 'router-other-foreman';
const managerActor = accessForRole('contracting-manager', managerId);
const foremanActor = accessForRole('foreman', foremanId);
const otherForemanActor = accessForRole('foreman', otherForemanId);
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
    actor: managerActor,
    input: { ...base, foremanUserId: foremanId },
  });
  const otherJob = await createJob({
    db,
    actor: managerActor,
    input: { ...base, foremanUserId: otherForemanId },
  });
  const pricedJob = await createJob({
    db,
    actor: managerActor,
    input: { ...base, foremanUserId: foremanId },
  });
  const completedJob = await createJob({
    db,
    actor: managerActor,
    input: { ...base, foremanUserId: otherForemanId },
  });
  await createAssignment({
    db,
    actor: managerActor,
    input: { jobId: ownJob.id, machineId: machine.id, implementId: null },
  });
  const [stint] = (await getJob({ db, id: ownJob.id })).assignments;
  if (!stint) throw new Error('Expected Machine Assignment');
  await createAssignment({
    db,
    actor: managerActor,
    input: { jobId: otherJob.id, machineId: otherMachine.id, implementId: implement.id },
  });
  const [otherStint] = (await getJob({ db, id: otherJob.id })).assignments;
  if (!otherStint) throw new Error('Expected other Machine Assignment');
  await captureReading({
    db,
    actor: otherForemanActor,
    input: {
      machineId: otherMachine.id,
      assignmentId: otherStint.id,
      role: 'arrival',
      value: 100,
      capturedAt: '2026-09-16T08:00:00+02:00',
      disputePrevious: false,
    },
  });
  await db.update(contractingJobs).set({ dieselUnitPrice: 23 }).where(eq(contractingJobs.id, ownJob.id));
  await db
    .update(contractingMachineAssignments)
    .set({ rateUnitAmount: 0 })
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
  return {
    completedJob,
    customer,
    db,
    farm,
    implement,
    machine,
    otherJob,
    otherMachine,
    otherStint,
    ownJob,
    pricedJob,
    stint,
    workType,
  };
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
  expect(Object.keys(jobs[0]?.stints[0] ?? {})).toEqual([
    'id',
    'jobId',
    'machineId',
    'machineCode',
    'categoryName',
    'categoryIcon',
    'categoryColour',
    'implementId',
    'implementCode',
    'driverUserId',
    'driverName',
    'state',
    'createdAt',
    'arrival',
    'departure',
  ]);
  expect(jobs[0]?.stints).toMatchObject([{ id: context.stint.id, state: 'planned' }]);
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

  expect((await manager.jobs({ includeFinished: true })).map((job) => [job.id, job.status])).toEqual([
    [context.ownJob.id, 'upcoming'],
    [context.otherJob.id, 'active'],
    [context.pricedJob.id, 'priced'],
    [context.completedJob.id, 'completed'],
  ]);
  expect((await foreman.jobs({ includeFinished: true })).map((job) => job.id)).toEqual([context.ownJob.id]);

  const workshopCaller = context.createCaller(contractingSession('workshop-manager'));
  await expect(workshopCaller.contractingJobs.field.jobs()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await captureReading({
    db: context.db,
    actor: foremanActor,
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
  expect((await foreman.jobs.list({ queues: ['upcoming'] })).items.map((job) => job.id)).toEqual([context.ownJob.id]);
  expect(await foreman.jobs.get({ id: context.ownJob.id })).toMatchObject({
    diesel: null,
    discount: null,
    pricing: null,
    assignments: [{ pricing: null }],
    actions: {
      complete: { allowed: false, reason: 'no-permission', message: 'You do not have permission to complete the Job.' },
    },
  });
  await expect(foreman.jobs.get({ id: context.otherJob.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(foreman.jobs.get({ id: context.pricedJob.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(foreman.jobs.list({ queues: ['awaiting-invoice'] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(foreman.assignments.remove({ id: context.otherStint.id })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(foreman.assignments.remove({ id: context.stint.id })).resolves.toBeUndefined();
  expect((await getJob({ db: context.db, id: context.ownJob.id })).assignments).toEqual([]);

  const workshop = context.createCaller(contractingSession('workshop-manager')).contractingJobs;
  expect((await workshop.jobs.list({ queues: ['upcoming'] })).items.map((job) => job.id)).toEqual([context.ownJob.id]);
  await expect(
    workshop.jobs.create({
      customerId: context.customer.id,
      farmId: context.farm.id,
      workTypeId: context.workType.id,
      description: null,
      foremanUserId: null,
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });

  const invoicing = context.createCaller(contractingSession('contracting-invoicing')).contractingJobs;
  await expect(invoicing.jobs.list({ queues: ['upcoming'] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect((await invoicing.jobs.list({ queues: ['awaiting-pricing'] })).items.map((job) => job.id)).toEqual([
    context.completedJob.id,
  ]);
  expect((await invoicing.jobs.list({ queues: ['awaiting-invoice'] })).items.map((job) => job.id)).toEqual([
    context.pricedJob.id,
  ]);
  await expect(invoicing.jobs.get({ id: context.completedJob.id })).resolves.toMatchObject({
    id: context.completedJob.id,
    status: 'completed',
  });

  for (const role of ['driver', 'mechanic'] as const)
    await expect(
      context.createCaller(contractingSession(role)).contractingJobs.jobs.list({ queues: ['upcoming'] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(context.createAnonCaller().contractingJobs.jobs.list({ queues: ['upcoming'] })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('lists several queues in one page, searched on the server', async ({ context }) => {
  const manager = context.createCaller(contractingSession('contracting-manager')).contractingJobs.jobs;
  const open = ['upcoming', 'active', 'looks-finished', 'awaiting-pricing', 'awaiting-invoice'] as const;
  const listed = await manager.list({ queues: [...open] });
  expect(listed.total).toBe(4);
  expect(listed.items.map((job) => job.id)).toEqual(
    expect.arrayContaining([context.ownJob.id, context.otherJob.id, context.completedJob.id, context.pricedJob.id]),
  );
  const searched = await manager.list({ queues: [...open], search: context.pricedJob.jobNumber });
  expect(searched).toMatchObject({ total: 1, items: [{ id: context.pricedJob.id }] });
  // Job Numbers keep every digit past the five-digit padding, as formatJobNumber does.
  await context.db.update(contractingJobs).set({ code: 123456 }).where(eq(contractingJobs.id, context.pricedJob.id));
  expect(await manager.list({ queues: [...open], search: 'CJOB-123456' })).toMatchObject({
    total: 1,
    items: [{ id: context.pricedJob.id, jobNumber: 'CJOB-123456' }],
  });

  const invoicing = context.createCaller(contractingSession('contracting-invoicing')).contractingJobs.jobs;
  await expect(invoicing.list({ queues: ['awaiting-pricing', 'active'] })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
});

test('opens one field Job without money, a Foreman only his own', async ({ context }) => {
  const foreman = context.createCaller(contractingSession('foreman')).contractingJobs.field;
  expect(await foreman.job({ id: context.ownJob.id })).toMatchObject({ id: context.ownJob.id });
  expect(await foreman.job({ id: context.ownJob.id })).not.toHaveProperty('pricedTotal');
  await expect(foreman.job({ id: context.otherJob.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const manager = context.createCaller(contractingSession('contracting-manager')).contractingJobs.field;
  expect(await manager.job({ id: context.pricedJob.id })).toMatchObject({ id: context.pricedJob.id });
});

test('sorts the Job list by when it was created and by customer, steady on equal values', async ({ context }) => {
  const manager = context.createCaller(contractingSession('contracting-manager')).contractingJobs.jobs;
  const queues = ['upcoming', 'active', 'looks-finished', 'awaiting-pricing', 'awaiting-invoice'] as const;
  const ids = async (sortBy: 'createdAt' | 'customerName', sortDirection: 'asc' | 'desc') =>
    (await manager.list({ queues: [...queues], sortBy, sortDirection })).items.map((job) => job.id);
  const oldestFirst = await ids('createdAt', 'asc');
  expect(oldestFirst).toHaveLength(4);
  expect(await ids('createdAt', 'desc')).toEqual([...oldestFirst].reverse());
  expect(await ids('customerName', 'asc')).toHaveLength(4);
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
  // A missing photo is a notice, so it never needs a look.
  expect(await manager.activeAttention()).toBeNull();
  expect(await foreman.activeAttention()).toBeNull();
  expect(await invoicing.activeAttention()).toBeNull();
  expect(await manager.get({ id: context.otherJob.id })).toMatchObject({
    assignments: [
      { arrival: { comment: null, aiConfidence: null, capturedByName: 'Other', attention: ['missing-photo'] } },
    ],
  });
  const arrivalId = (await manager.get({ id: context.otherJob.id })).assignments[0]?.arrival?.id;
  if (!arrivalId) throw new Error('Expected arrival reading');
  await context.db
    .update(contractingHourReadings)
    .set({ aiValue: 101, aiConfidence: 0.87, aiVerification: 'disagrees' })
    .where(eq(contractingHourReadings.id, arrivalId));
  expect(await manager.activeAttention()).toBe('warning');
  expect(await foreman.activeAttention()).toBeNull();
  expect(await manager.get({ id: context.otherJob.id })).toMatchObject({
    assignments: [{ arrival: { aiConfidence: 0.87, attention: ['ai-disagrees', 'missing-photo'] } }],
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
    captureReading({ db: context.db, actor: foremanActor, input: { ...departure, comment: 'Shift ended' } }),
  ).rejects.toMatchObject({ code: 'reading.forbidden' });
  await expect(captureReading({ db: context.db, actor: managerActor, input: departure })).rejects.toMatchObject({
    code: 'reading.invalid_role',
  });
  await captureReading({ db: context.db, actor: managerActor, input: { ...departure, comment: 'Shift ended' } });
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
  ).resolves.toBeUndefined();
  expect(await manager.jobs.get({ id: jobId })).toMatchObject({
    discount: { kind: 'percent' },
    pricing: { total: 0, gate: { ok: true } },
  });
  const admin = context.createCaller(contractingSession('contracting-admin')).contractingJobs;
  await expect(admin.pricing.markPriced({ id: jobId, expectedTotal: 1 })).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(admin.pricing.markPriced({ id: jobId, expectedTotal: 0 })).resolves.toBeUndefined();
  expect(await admin.jobs.get({ id: jobId })).toMatchObject({ status: 'priced', pricedTotal: 0 });
});

test('lets Invoicing list, read and stamp Priced Jobs while every other write stays out of reach', async ({
  context,
}) => {
  const invoicing = context.createCaller(contractingSession('contracting-invoicing')).contractingJobs;
  expect((await invoicing.jobs.list({ queues: ['awaiting-invoice'] })).items).toMatchObject([
    { id: context.pricedJob.id, pricedTotal: 100, pricedAt: expect.any(String), invoiceNumber: null },
  ]);
  await expect(invoicing.jobs.list({ queues: ['active'] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(invoicing.jobs.get({ id: context.pricedJob.id })).resolves.toMatchObject({ pricedTotal: 100 });
  for (const attempt of [
    () => invoicing.pricing.markPriced({ id: context.completedJob.id, expectedTotal: 0 }),
    () => invoicing.jobs.patch({ id: context.pricedJob.id, notes: 'Keyed in' }),
    () => invoicing.assignments.remove({ id: context.stint.id }),
  ])
    await expect(attempt()).rejects.toMatchObject({ code: 'FORBIDDEN' });

  const manager = context.createCaller(contractingSession('contracting-manager')).contractingJobs;
  expect((await manager.jobs.list({ queues: ['awaiting-invoice'] })).items).toMatchObject([{ pricedTotal: 100 }]);
  await expect(
    manager.invoicing.stamp({ id: context.pricedJob.id, invoiceNumber: 'INV-1', expectedTotal: 100 }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });

  await expect(
    invoicing.invoicing.stamp({ id: context.pricedJob.id, invoiceNumber: 'INV-1', expectedTotal: 99 }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(
    invoicing.invoicing.stamp({ id: context.pricedJob.id, invoiceNumber: ' INV-1 ', expectedTotal: 100 }),
  ).resolves.toBeUndefined();
  expect(await invoicing.jobs.get({ id: context.pricedJob.id })).toMatchObject({
    status: 'invoiced',
    invoiceNumber: 'INV-1',
  });
  expect(await invoicing.invoicing.byNumber({ invoiceNumber: 'inv-1' })).toEqual([
    expect.objectContaining({ id: context.pricedJob.id, jobNumber: context.pricedJob.jobNumber }),
  ]);
  expect(await manager.invoicing.byNumber({ invoiceNumber: 'INV-1' })).toHaveLength(1);
  await expect(
    context.createCaller(contractingSession('foreman')).contractingJobs.invoicing.byNumber({ invoiceNumber: 'INV-1' }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('filters the Invoiced queue by the South African days it was stamped on, newest first', async ({ context }) => {
  // 23:30 UTC on 31 August is 01:30 on 1 September in Johannesburg.
  await context.db
    .update(contractingJobs)
    .set({ status: 'invoiced', invoiceNumber: 'INV-9', invoicedAt: new Date('2026-08-31T23:30:00Z') })
    .where(eq(contractingJobs.id, context.pricedJob.id));
  await context.db
    .update(contractingJobs)
    .set({
      status: 'invoiced',
      pricedAt: new Date('2026-08-19T10:00:00Z'),
      pricedSubtotal: 50,
      pricedTotal: 50,
      invoiceNumber: 'INV-8',
      invoicedAt: new Date('2026-08-20T10:00:00Z'),
    })
    .where(eq(contractingJobs.id, context.completedJob.id));
  const invoicing = context.createCaller(contractingSession('contracting-invoicing')).contractingJobs.jobs;
  const invoiced = async (range: { invoicedFrom?: string; invoicedTo?: string }) =>
    (await invoicing.list({ queues: ['invoiced'], sortBy: 'invoicedAt', sortDirection: 'desc', ...range })).items.map(
      (job) => job.id,
    );

  expect(await invoiced({})).toEqual([context.pricedJob.id, context.completedJob.id]);
  expect(await invoiced({ invoicedFrom: '2026-09-01', invoicedTo: '2026-09-30' })).toEqual([context.pricedJob.id]);
  expect(await invoiced({ invoicedFrom: '2026-08-01', invoicedTo: '2026-08-31' })).toEqual([context.completedJob.id]);
  expect(await invoiced({ invoicedTo: '2026-08-19' })).toEqual([]);
  // A range only keeps invoiced Jobs, so an un-invoiced stage listed beside them drops out.
  expect(
    (await invoicing.list({ queues: ['awaiting-invoice', 'invoiced'], invoicedFrom: '2026-09-01' })).items.map(
      (job) => job.id,
    ),
  ).toEqual([context.pricedJob.id]);
});
