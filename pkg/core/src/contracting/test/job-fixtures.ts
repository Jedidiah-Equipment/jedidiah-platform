import type { Db } from '@pkg/db';
import { user } from '@pkg/db';
import type { JobActor } from '@pkg/domain/contracting';
import { accessForRole } from '@pkg/domain/testing';
import { DateOnlyIso } from '@pkg/schema';
import type { AssignmentPlanInput, ChargeLineCreateInput } from '@pkg/schema/contracting';
import { MachineCreateInput } from '@pkg/schema/contracting';
import { createCustomer } from '../customers/customer-service.js';
import { createFarm } from '../customers/farm-service.js';
import { createCategory } from '../fleet/category-service.js';
import { createMachine } from '../fleet/machine-service.js';
import { createAssignment } from '../jobs/assignment-service.js';
import { createChargeLine } from '../jobs/charge-line-service.js';
import { getJob } from '../jobs/job-read.js';
import { completeJob, createJob } from '../jobs/job-service.js';
import { markPriced, setStintRate } from '../jobs/pricing-service.js';
import { captureStintHours, editStintHours } from '../jobs/stint-hours-service.js';
import { createMeasureType } from '../rate-card/measure-type-service.js';
import { createRate } from '../rate-card/rate-service.js';
import { amendReadings, getReading } from '../readings/reading-service.js';
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
      input: MachineCreateInput.parse({
        code,
        make: 'CAT',
        model: '320',
        categoryId: category.id,
      }),
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

/** Plans a stint and returns it as the Job read shows it: a write returns nothing. */
export async function plannedStint(db: Db, actor: JobActor, input: AssignmentPlanInput) {
  const before = new Set((await getJob({ db, id: input.jobId })).assignments.map((assignment) => assignment.id));
  await createAssignment({ db, actor, input });
  const added = (await getJob({ db, id: input.jobId })).assignments.find((assignment) => !before.has(assignment.id));
  if (!added) throw new Error('Expected a planned stint');
  return added;
}

/** Adds a Charge Line and returns it as the Job read shows it. */
export async function addedChargeLine(db: Db, actor: JobActor, input: ChargeLineCreateInput) {
  const before = new Set((await getJob({ db, id: input.jobId })).chargeLines.map((line) => line.id));
  await createChargeLine({ db, actor, input });
  const added = (await getJob({ db, id: input.jobId })).chargeLines.find((line) => !before.has(line.id));
  if (!added) throw new Error('Expected a charge line');
  return added;
}

/** Captures a stint's arrival or departure hours as its Foreman would. */
export const captureHours = (db: Db, assignmentId: string, role: 'arrival' | 'departure', hours: number) =>
  captureStintHours({ db, actor: foreman, input: { assignmentId, role, hours } });

/** Edits a stint's Job Hours as management would, with a reason. */
export const editHours = (
  db: Db,
  assignmentId: string,
  hours: { arrival: number; departure: number | null },
  reason = 'Misread',
) =>
  editStintHours({
    db,
    actor: admin,
    input: { assignmentId, arrivalHours: hours.arrival, departureHours: hours.departure, reason },
  });

/** A planned stint that arrived and left. */
export async function leftStint(db: Db, jobId: string, machineId: string, arrival: number, departure: number) {
  const planned = await plannedStint(db, admin, { jobId, machineId, implementId: null });
  await captureHours(db, planned.id, 'arrival', arrival);
  await captureHours(db, planned.id, 'departure', departure);
  return { id: planned.id };
}

export async function completedJob(
  fixtures: JobFixtures,
  stints: ReadonlyArray<{ machineId: string; arrival: number; departure: number }>,
  dieselLitres = 0,
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
      dieselLitres,
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
  const total = (await getJob({ db, id: completed.jobId })).pricing.total;
  await markPriced({ db, actor: admin, input: { id: completed.jobId, expectedTotal: total } });
  return { ...completed, total };
}

/** Amends a spot reading's hours at the Read At it already has. */
export async function amendHours(db: Db, actor: JobActor, id: string, value: number, reason = 'Misread') {
  const { capturedAt } = await getReading({ db, id });
  const [amended] = await amendReadings({
    db,
    actor,
    input: { amendments: [{ id, value, capturedAt: capturedAt.toISOString() }], reason },
  });
  return amended;
}
