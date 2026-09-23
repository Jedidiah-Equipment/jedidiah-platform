import type { Db } from '@pkg/db';
import { user } from '@pkg/db';
import { accessForRole } from '@pkg/domain/testing';
import { DateOnlyIso } from '@pkg/schema';
import { createCustomer } from '../customers/customer-service.js';
import { createFarm } from '../customers/farm-service.js';
import { createCategory } from '../fleet/category-service.js';
import { createMachine } from '../fleet/machine-service.js';
import { createAssignment } from '../jobs/assignment-service.js';
import { getJob } from '../jobs/job-read.js';
import { completeJob, createJob } from '../jobs/job-service.js';
import { markPriced, setStintRate } from '../jobs/pricing-service.js';
import { createMeasureType } from '../rate-card/measure-type-service.js';
import { createRate } from '../rate-card/rate-service.js';
import { captureReading } from '../readings/reading-service.js';
import { createWorkType } from '../work-types/work-type-service.js';

export const adminId = 'fixture-admin';
export const foremanId = 'fixture-foreman';
export const invoicingId = 'fixture-invoicing';
export const admin = accessForRole('contracting-admin', adminId);
export const foreman = accessForRole('foreman', foremanId);
export const invoicing = accessForRole('contracting-invoicing', invoicingId);

/** Users, a Customer with a Farm, two Machines, a Measure Type and a time Rate: enough to take a Job to Invoiced. */
export async function seedJobFixtures(db: Db) {
  const now = new Date();
  const person = (
    id: string,
    name: string,
    contractingRole: 'contracting-admin' | 'foreman' | 'contracting-invoicing',
  ) => ({
    id,
    name,
    email: `${id}@example.com`,
    emailVerified: true,
    contractingRole,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(user)
    .values([
      person(adminId, 'Jed', 'contracting-admin'),
      person(foremanId, 'Sipho', 'foreman'),
      person(invoicingId, 'Karen', 'contracting-invoicing'),
    ]);
  const customer = await createCustomer({ db, actorUserId: adminId, input: { name: 'Rowley' } });
  const farm = await createFarm({ db, actorUserId: adminId, input: { customerId: customer.id, name: 'Rooikraal' } });
  const workType = await createWorkType({ db, actorUserId: adminId, input: { name: 'Dam building' } });
  const category = await createCategory({ db, actorUserId: adminId, input: { name: 'Excavators', kind: 'machine' } });
  const machine = (code: string) =>
    createMachine({
      db,
      actorUserId: adminId,
      input: {
        code,
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
  const excavator = await machine('CAT320-1');
  const tipper = await machine('TIP-7');
  const loads = await createMeasureType({ db, actorUserId: adminId, input: { name: 'Loads' } });
  const dryHire = await createRate({
    db,
    actorUserId: adminId,
    input: { name: 'Dry hire', basis: 'time', measureTypeId: null, amount: 600 },
  });
  return { category, customer, dryHire, excavator, farm, loads, tipper, workType };
}

export type JobFixtures = Awaited<ReturnType<typeof seedJobFixtures>> & { db: Db };

let clock = Date.parse('2026-09-01T06:00:00+02:00');
const nextCapture = () => {
  clock += 60 * 60 * 1000;
  return new Date(clock).toISOString();
};

/** A planned stint that arrived and left, with its readings. */
export async function leftStint(db: Db, jobId: string, machineId: string, arrival: number, departure: number) {
  const planned = await createAssignment({
    db,
    actor: admin,
    input: { jobId, machineId, implementId: null },
  });
  if (!planned) throw new Error('Expected a planned stint');
  const capture = (role: 'arrival' | 'departure', value: number) =>
    captureReading({
      db,
      actor: foreman,
      input: {
        machineId,
        assignmentId: planned.id,
        role,
        value,
        capturedAt: nextCapture(),
        disputePrevious: false,
        ...(role === 'departure' ? { comment: 'Photo unavailable' } : {}),
      },
    });
  const arrived = await capture('arrival', arrival);
  const departed = await capture('departure', departure);
  return { id: planned.id, arrivalReadingId: arrived.id, departureReadingId: departed.id };
}

export async function completedJob(
  fixtures: JobFixtures,
  stints: ReadonlyArray<{ machineId: string; arrival: number; departure: number }>,
) {
  const { db } = fixtures;
  const job = await createJob({
    db,
    actor: admin,
    input: {
      customerId: fixtures.customer.id,
      farmId: fixtures.farm.id,
      workTypeId: fixtures.workType.id,
      description: null,
      foremanUserId: foremanId,
    },
  });
  const created = [];
  for (const item of stints) created.push(await leftStint(db, job.id, item.machineId, item.arrival, item.departure));
  await completeJob({
    db,
    actor: admin,
    input: {
      id: job.id,
      startDate: DateOnlyIso.parse('2026-09-01'),
      endDate: DateOnlyIso.parse('2026-09-10'),
      dieselLitres: 0,
      notes: null,
      removePlannedAssignmentIds: [],
    },
  });
  return { jobId: job.id, jobNumber: job.jobNumber, stints: created };
}

/** Completes the Job, puts Dry hire on every stint, and marks it Priced at the live total. */
export async function pricedJob(
  fixtures: JobFixtures,
  stints: ReadonlyArray<{ machineId: string; arrival: number; departure: number }>,
) {
  const { db } = fixtures;
  const completed = await completedJob(fixtures, stints);
  for (const stint of completed.stints)
    await setStintRate({ db, actor: admin, input: { assignmentId: stint.id, rateId: fixtures.dryHire.id } });
  const total = (await getJob({ db, id: completed.jobId })).pricing?.total ?? 0;
  await markPriced({ db, actor: admin, input: { id: completed.jobId, expectedTotal: total } });
  return { ...completed, total };
}
