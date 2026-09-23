import type { Db } from '@pkg/db';
import { auditEvents, user } from '@pkg/db';
import { contractingJobs } from '@pkg/db/contracting';
import { DateOnlyIso } from '@pkg/schema';
import { and, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { createTester, type TesterScope } from '../../test/create-tester.js';
import { createCustomer } from '../customers/customer-service.js';
import { createFarm } from '../customers/farm-service.js';
import { createCategory } from '../fleet/category-service.js';
import { createMachine } from '../fleet/machine-service.js';
import { createMeasureType } from '../rate-card/measure-type-service.js';
import { createRate, patchRate } from '../rate-card/rate-service.js';
import { amendReading, captureReading } from '../readings/reading-service.js';
import { createWorkType } from '../work-types/work-type-service.js';
import { patchAssignment, planAssignment, resolveGap } from './assignment-service.js';
import { createChargeLine, patchChargeLine } from './charge-line-service.js';
import { getJob, listJobs } from './job-read.js';
import { completeJob, createJob, patchJob } from './job-service.js';
import { setMeasure } from './measure-service.js';
import {
  clearStintRate,
  markPriced,
  setDieselPrice,
  setDiscount,
  setStintAmount,
  setStintRate,
} from './pricing-service.js';

const adminId = 'pricing-admin';
const foremanId = 'pricing-foreman';

async function seed({ db }: TesterScope) {
  const now = new Date();
  await db.insert(user).values([
    {
      id: adminId,
      name: 'Jed',
      email: 'jed-pricing@example.com',
      emailVerified: true,
      contractingRole: 'contracting-admin',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: foremanId,
      name: 'Sipho',
      email: 'sipho-pricing@example.com',
      emailVerified: true,
      contractingRole: 'foreman',
      createdAt: now,
      updatedAt: now,
    },
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
  const rate = (name: string, amount: number, measureTypeId: string | null = null) =>
    createRate({
      db,
      actorUserId: adminId,
      input: { name, basis: measureTypeId ? 'measure' : 'time', measureTypeId, amount },
    });
  const dryHire = await rate('Dry hire', 600);
  const wetHire = await rate('Wet hire', 550);
  const perLoad = await rate('Per load', 850, loads.id);
  return { customer, excavator, farm, loads, perLoad, tipper, workType, dryHire, wetHire };
}

const test = createTester(seed);
type Context = TesterScope & Awaited<ReturnType<typeof seed>>;

let clock = Date.parse('2026-09-01T06:00:00+02:00');
const nextCapture = () => {
  clock += 60 * 60 * 1000;
  return new Date(clock).toISOString();
};

async function stint(db: Db, jobId: string, machineId: string, arrival: number, departure: number) {
  const planned = await planAssignment({ db, actorUserId: adminId, input: { jobId, machineId, implementId: null } });
  if (!planned) throw new Error('Expected a planned stint');
  const capture = (role: 'arrival' | 'departure', value: number) =>
    captureReading({
      db,
      actorUserId: foremanId,
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

async function completedJob(
  context: Context,
  stints: ReadonlyArray<{ machineId: string; arrival: number; departure: number }>,
  dieselLitres = 0,
) {
  const job = await createJob({
    db: context.db,
    actorUserId: adminId,
    input: {
      customerId: context.customer.id,
      farmId: context.farm.id,
      workTypeId: context.workType.id,
      description: null,
      foremanUserId: foremanId,
    },
  });
  const created = [];
  for (const item of stints)
    created.push(await stint(context.db, job.id, item.machineId, item.arrival, item.departure));
  await completeJob({
    db: context.db,
    actorUserId: adminId,
    input: {
      id: job.id,
      startDate: DateOnlyIso.parse('2026-09-01'),
      endDate: DateOnlyIso.parse('2026-09-10'),
      dieselLitres,
      notes: null,
      removePlannedAssignmentIds: [],
    },
  });
  return { jobId: job.id, stints: created };
}

const stintOf = async (db: Db, jobId: string, id: string) => {
  const found = (await getJob({ db, id: jobId })).assignments.find((assignment) => assignment.id === id);
  if (!found) throw new Error('Expected the stint');
  return found;
};

describe('picking a Rate', () => {
  test('snapshots the Rate and pre-fills the machine’s un-priced later stints from its first stint', async ({
    context,
  }) => {
    const { db } = context;
    const { stints } = await completedJob(context, [
      { machineId: context.excavator.id, arrival: 100, departure: 110 },
      { machineId: context.excavator.id, arrival: 111, departure: 115.5 },
      { machineId: context.excavator.id, arrival: 116, departure: 120 },
    ]);
    const [first, second, third] = stints;
    if (!first || !second || !third) throw new Error('Expected three stints');
    await setStintRate({ db, actorUserId: adminId, input: { assignmentId: third.id, rateId: null } });

    const job = await setStintRate({
      db,
      actorUserId: adminId,
      input: { assignmentId: first.id, rateId: context.dryHire.id },
    });

    expect(job.assignments.map((assignment) => [assignment.rateName, assignment.finalAmount])).toEqual([
      ['Dry hire', 6_000],
      ['Dry hire', 3_300],
      [null, 0],
    ]);
    expect(job.assignments[0]).toMatchObject({
      rateId: context.dryHire.id,
      rateBasis: 'time',
      rateUnitAmount: 600,
      computedAmount: 6_000,
      amountEdited: false,
      billedQuantity: 10,
    });
    expect(job.assignments[2]).toMatchObject({ rateId: null, rateUnitAmount: 0, computedAmount: 0 });
    expect(job.pricing?.gate).toMatchObject({ ok: true, unpricedStints: 0 });

    const cleared = await clearStintRate({ db, actorUserId: adminId, input: { assignmentId: third.id } });
    expect(cleared.assignments[2]).toMatchObject({ rateUnitAmount: null, finalAmount: null });
    expect(cleared.pricing?.gate).toMatchObject({ ok: false, unpricedStints: 1 });
  });

  test('refuses a Rate that has gone inactive', async ({ context }) => {
    const { db } = context;
    const { stints } = await completedJob(context, [{ machineId: context.excavator.id, arrival: 100, departure: 110 }]);
    await patchRate({ db, actorUserId: adminId, input: { id: context.wetHire.id, active: false } });
    await expect(
      setStintRate({
        db,
        actorUserId: adminId,
        input: { assignmentId: stints[0]?.id ?? '', rateId: context.wetHire.id },
      }),
    ).rejects.toMatchObject({ code: 'contracting_job.rate_inactive' });
  });
});

describe('amount overrides while Completed', () => {
  test('keep an override across a Measure edit, discard it on a new Rate, and recompute live after a gap split', async ({
    context,
  }) => {
    const { db } = context;
    const { jobId, stints } = await completedJob(context, [
      { machineId: context.tipper.id, arrival: 100, departure: 110 },
      { machineId: context.excavator.id, arrival: 200, departure: 210 },
      { machineId: context.excavator.id, arrival: 212, departure: 220 },
    ]);
    const [haul, dig, secondDig] = stints;
    if (!haul || !dig || !secondDig) throw new Error('Expected three stints');

    const measured = await setStintRate({
      db,
      actorUserId: adminId,
      input: { assignmentId: haul.id, rateId: context.perLoad.id },
    });
    expect(measured.assignments.find((stint) => stint.id === haul.id)).toMatchObject({
      finalAmount: 0,
      measureMissing: true,
    });
    await setMeasure({
      db,
      actorUserId: adminId,
      input: { assignmentId: haul.id, measureTypeId: context.loads.id, quantity: 18 },
    });
    expect(await stintOf(db, jobId, haul.id)).toMatchObject({
      computedAmount: 15_300,
      finalAmount: 15_300,
      measureMissing: false,
      billedQuantity: 18,
    });

    await setStintAmount({ db, actorUserId: adminId, input: { assignmentId: haul.id, finalAmount: 14_000 } });
    await setMeasure({
      db,
      actorUserId: adminId,
      input: { assignmentId: haul.id, measureTypeId: context.loads.id, quantity: 20 },
    });
    expect(await stintOf(db, jobId, haul.id)).toMatchObject({
      computedAmount: 17_000,
      finalAmount: 14_000,
      amountEdited: true,
    });
    await setStintRate({ db, actorUserId: adminId, input: { assignmentId: haul.id, rateId: context.perLoad.id } });
    expect(await stintOf(db, jobId, haul.id)).toMatchObject({ finalAmount: 17_000, amountEdited: false });

    await setStintRate({ db, actorUserId: adminId, input: { assignmentId: secondDig.id, rateId: context.wetHire.id } });
    expect(await stintOf(db, jobId, secondDig.id)).toMatchObject({ billedQuantity: 10, finalAmount: 5_500 });
    await resolveGap({
      db,
      actorUserId: adminId,
      input: { id: secondDig.id, travelHours: 0.5, unaccountedHours: 1.5, reason: 'Refuelled at the yard' },
    });
    expect(await stintOf(db, jobId, secondDig.id)).toMatchObject({ billedQuantity: 8.5, finalAmount: 4_675 });
  });
});

describe('Diesel and Discount', () => {
  test('price diesel from litres, override it, and discount stints and charge lines but not diesel', async ({
    context,
  }) => {
    const { db } = context;
    const { jobId, stints } = await completedJob(
      context,
      [{ machineId: context.excavator.id, arrival: 100, departure: 148.6 }],
      210,
    );
    await setStintRate({
      db,
      actorUserId: adminId,
      input: { assignmentId: stints[0]?.id ?? '', rateId: context.dryHire.id },
    });
    const line = await createChargeLine({ db, actorUserId: adminId, input: { jobId, description: 'Low-bed' } });
    if (!line) throw new Error('Expected a charge line');
    await patchChargeLine({ db, actorUserId: adminId, input: { id: line.id, amount: 3_500 }, canPrice: true });

    const priced = await setDieselPrice({ db, actorUserId: adminId, input: { jobId, unitPrice: 23 } });
    expect(priced).toMatchObject({ dieselUnitPrice: 23, dieselAmount: 4_830, dieselAmountEdited: false });
    const overridden = await setDieselPrice({
      db,
      actorUserId: adminId,
      input: { jobId, unitPrice: 23, amount: 4_800 },
    });
    expect(overridden).toMatchObject({ dieselAmount: 4_800, dieselAmountEdited: true });
    await setDieselPrice({ db, actorUserId: adminId, input: { jobId, unitPrice: 23 } });

    const discounted = await setDiscount({
      db,
      actorUserId: adminId,
      input: { jobId, discount: { kind: 'percent', value: 5 } },
    });
    expect(discounted.pricing).toMatchObject({
      subtotal: 32_660,
      discountAmount: 1_633,
      dieselAmount: 4_830,
      total: 35_857,
      gate: { ok: true },
    });
    expect(discounted).toMatchObject({ discountKind: 'percent', discountValue: 5, discountAmount: 1_633 });
  });

  test('refuses a diesel price when no diesel was supplied', async ({ context }) => {
    const { db } = context;
    const { jobId } = await completedJob(context, [{ machineId: context.excavator.id, arrival: 100, departure: 110 }]);
    await expect(setDieselPrice({ db, actorUserId: adminId, input: { jobId, unitPrice: 23 } })).rejects.toMatchObject({
      code: 'contracting_job.wrong_status',
      message: 'No diesel was supplied on this Job.',
    });
  });
});

describe('Mark as Priced', () => {
  test('refuses an incomplete or stale total, then freezes the live figures and moves to Awaiting invoice', async ({
    context,
  }) => {
    const { db } = context;
    const { jobId, stints } = await completedJob(
      context,
      [
        { machineId: context.excavator.id, arrival: 100, departure: 110 },
        { machineId: context.tipper.id, arrival: 100, departure: 104 },
      ],
      100,
    );
    const [dig, haul] = stints;
    if (!dig || !haul) throw new Error('Expected two stints');
    const line = await createChargeLine({ db, actorUserId: adminId, input: { jobId, description: 'Fixed quote' } });
    if (!line) throw new Error('Expected a charge line');
    await setStintRate({ db, actorUserId: adminId, input: { assignmentId: dig.id, rateId: context.dryHire.id } });

    await expect(
      markPriced({ db, actorUserId: adminId, input: { id: jobId, expectedTotal: 6_000 } }),
    ).rejects.toMatchObject({
      code: 'contracting_job.pricing_incomplete',
      message:
        'This Job cannot be priced yet: 1 stint has no Rate · 1 charge line has no amount · Diesel is not priced.',
    });

    await setStintRate({ db, actorUserId: adminId, input: { assignmentId: haul.id, rateId: null } });
    await patchChargeLine({ db, actorUserId: adminId, input: { id: line.id, amount: 0 }, canPrice: true });
    await setDieselPrice({ db, actorUserId: adminId, input: { jobId, unitPrice: 20 } });
    await patchJob({ db, actorUserId: adminId, input: { id: jobId, dieselLitres: 150 } });
    await setStintAmount({ db, actorUserId: adminId, input: { assignmentId: dig.id, finalAmount: 5_500 } });
    const draft = await getJob({ db, id: jobId });
    expect(draft).toMatchObject({ dieselAmount: 3_000, pricing: { total: 8_500, gate: { ok: true } } });

    await expect(
      markPriced({ db, actorUserId: adminId, input: { id: jobId, expectedTotal: 8_000 } }),
    ).rejects.toMatchObject({
      code: 'contracting_job.total_changed',
    });
    const priced = await markPriced({ db, actorUserId: adminId, input: { id: jobId, expectedTotal: 8_500 } });

    expect(priced).toMatchObject({ status: 'priced', pricedSubtotal: 5_500, pricedTotal: 8_500, dieselAmount: 3_000 });
    expect(priced.pricing?.total).toBe(priced.pricedTotal);
    expect(priced.assignments[0]).toMatchObject({ computedAmount: 6_000, finalAmount: 5_500, amountEdited: true });
    expect((await listJobs({ db, queue: 'awaiting-invoice', limit: 50, offset: 0 })).map((job) => job.id)).toEqual([
      jobId,
    ]);

    await expect(
      setStintRate({ db, actorUserId: adminId, input: { assignmentId: dig.id, rateId: context.wetHire.id } }),
    ).rejects.toMatchObject({ code: 'contracting_job.wrong_status' });
    await expect(
      patchAssignment({ db, actorUserId: adminId, input: { id: dig.id, travelIncluded: false } }),
    ).rejects.toMatchObject({ code: 'contracting_job.wrong_status' });
    await expect(patchJob({ db, actorUserId: adminId, input: { id: jobId, dieselLitres: 90 } })).rejects.toMatchObject({
      code: 'contracting_job.wrong_status',
    });
    await expect(
      patchJob({ db, actorUserId: adminId, input: { id: jobId, notes: 'Paid on site' } }),
    ).resolves.toMatchObject({
      notes: 'Paid on site',
    });
  });
});

describe('a reading amendment on a Priced Job', () => {
  const priceAt = async (db: Db, jobId: string, assignmentId: string, rateId: string) => {
    await setStintRate({ db, actorUserId: adminId, input: { assignmentId, rateId } });
    const total = (await getJob({ db, id: jobId })).pricing?.total ?? 0;
    return markPriced({ db, actorUserId: adminId, input: { id: jobId, expectedTotal: total } });
  };
  const jobEvents = async (db: Db, jobId: string) =>
    (
      await db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.entityType, 'contracting_job'), eq(auditEvents.entityId, jobId)))
    ).length;

  test('returns it to Completed with Rates kept, amounts recomputed, and overrides reset and flagged', async ({
    context,
  }) => {
    const { db } = context;
    const { jobId, stints } = await completedJob(context, [
      { machineId: context.excavator.id, arrival: 100, departure: 110 },
    ]);
    const dig = stints[0];
    if (!dig) throw new Error('Expected a stint');
    await setStintRate({ db, actorUserId: adminId, input: { assignmentId: dig.id, rateId: context.dryHire.id } });
    await setStintAmount({ db, actorUserId: adminId, input: { assignmentId: dig.id, finalAmount: 5_500 } });
    await markPriced({ db, actorUserId: adminId, input: { id: jobId, expectedTotal: 5_500 } });
    const eventsBefore = await jobEvents(db, jobId);

    await amendReading({
      db,
      actorUserId: adminId,
      input: { id: dig.arrivalReadingId, value: 101, reason: 'Misread 0 as 1' },
    });

    const reopened = await getJob({ db, id: jobId });
    expect(reopened).toMatchObject({
      status: 'completed',
      pricedAt: null,
      pricedTotal: null,
      repricingNote: 'Hour Reading amended on CAT320-1 — amounts recomputed. 1 edited amount was reset.',
      pricing: { total: 5_400 },
    });
    expect(reopened.reopenedAt).not.toBeNull();
    expect(reopened.assignments[0]).toMatchObject({ rateName: 'Dry hire', finalAmount: 5_400, amountEdited: false });
    expect(await jobEvents(db, jobId)).toBe(eventsBefore + 1);
    expect((await listJobs({ db, queue: 'awaiting-pricing', limit: 50, offset: 0 })).map((job) => job.id)).toEqual([
      jobId,
    ]);

    const repriced = await markPriced({ db, actorUserId: adminId, input: { id: jobId, expectedTotal: 5_400 } });
    expect(repriced).toMatchObject({ reopenedAt: null, repricingNote: null });
  });

  test('also reopens the Priced Job whose next stint’s Hour Gap starts at an amended departure', async ({
    context,
  }) => {
    const { db } = context;
    const first = await completedJob(context, [{ machineId: context.excavator.id, arrival: 100, departure: 110 }]);
    const next = await completedJob(context, [{ machineId: context.excavator.id, arrival: 112, departure: 120 }]);
    const [firstStint] = first.stints;
    const [nextStint] = next.stints;
    if (!firstStint || !nextStint) throw new Error('Expected stints');
    await priceAt(db, first.jobId, firstStint.id, context.dryHire.id);
    expect((await priceAt(db, next.jobId, nextStint.id, context.dryHire.id)).pricedTotal).toBe(6_000);

    await amendReading({
      db,
      actorUserId: adminId,
      input: { id: firstStint.departureReadingId, value: 111, reason: 'Misread the meter' },
    });

    expect(await getJob({ db, id: first.jobId })).toMatchObject({ status: 'completed', pricing: { total: 6_600 } });
    expect(await getJob({ db, id: next.jobId })).toMatchObject({
      status: 'completed',
      repricingNote: 'Hour Reading amended on CAT320-1 — amounts recomputed.',
      pricing: { total: 5_400 },
    });
  });

  test('is refused when an affected Job is Invoiced, and nothing is written', async ({ context }) => {
    const { db } = context;
    const { jobId, stints } = await completedJob(context, [
      { machineId: context.excavator.id, arrival: 100, departure: 110 },
    ]);
    const dig = stints[0];
    if (!dig) throw new Error('Expected a stint');
    await priceAt(db, jobId, dig.id, context.dryHire.id);
    await db
      .update(contractingJobs)
      .set({ status: 'invoiced', invoiceNumber: 'INV-1', invoicedAt: new Date(), invoicedByUserId: adminId })
      .where(eq(contractingJobs.id, jobId));

    await expect(
      amendReading({ db, actorUserId: adminId, input: { id: dig.arrivalReadingId, value: 101, reason: 'Misread' } }),
    ).rejects.toMatchObject({ code: 'reading.job_invoiced' });
    expect((await getJob({ db, id: jobId })).assignments[0]?.arrival?.value).toBe(100);
  });
});
