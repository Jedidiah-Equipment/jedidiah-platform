import type { Db } from '@pkg/db';
import { auditEvents } from '@pkg/db';
import { stintAmount } from '@pkg/domain/contracting';
import { accessForRole } from '@pkg/domain/testing';
import { and, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { createRate, patchRate } from '../rate-card/rate-service.js';
import { amendReading } from '../readings/reading-service.js';
import { admin, adminId, completedJob, seedJobFixtures } from '../test/job-fixtures.js';
import { resolveGap } from './assignment-service.js';
import { createChargeLine, patchChargeLine } from './charge-line-service.js';
import { getJob, listJobs } from './job-read.js';
import { patchJob } from './job-service.js';
import { setMeasure } from './measure-service.js';
import {
  clearStintRate,
  markPriced,
  setDieselPrice,
  setDiscount,
  setStintAmount,
  setStintRate,
} from './pricing-service.js';

const test = createTester(async ({ db }) => {
  const fixtures = await seedJobFixtures(db);
  const rate = (name: string, amount: number, measureTypeId: string | null = null) =>
    createRate({
      db,
      actorUserId: adminId,
      input: { name, basis: measureTypeId ? 'measure' : 'time', measureTypeId, amount },
    });
  return {
    ...fixtures,
    db,
    wetHire: await rate('Wet hire', 550),
    perLoad: await rate('Per load', 850, fixtures.loads.id),
  };
});

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
    await setStintRate({ db, actor: admin, input: { assignmentId: third.id, rateId: null } });

    const job = await setStintRate({
      db,
      actor: admin,
      input: { assignmentId: first.id, rateId: context.dryHire.id },
    });

    expect(
      job.assignments.map((assignment) => [
        assignment.pricing?.kind === 'rate' ? assignment.pricing.name : null,
        stintAmount(assignment.pricing),
      ]),
    ).toEqual([
      ['Dry hire', 6_000],
      ['Dry hire', 3_300],
      [null, 0],
    ]);
    expect(job.assignments[0]).toMatchObject({
      pricing: {
        kind: 'rate',
        rateId: context.dryHire.id,
        basis: 'time',
        unitAmount: 600,
        computedAmount: 6_000,
        amountEdited: false,
        billedQuantity: 10,
      },
    });
    expect(job.assignments[2]).toMatchObject({ pricing: { kind: 'no-charge' } });
    expect(job.pricing.gate).toMatchObject({ ok: true, unpricedStints: 0 });

    const cleared = await clearStintRate({ db, actor: admin, input: { assignmentId: third.id } });
    expect(cleared.assignments[2]).toMatchObject({ pricing: null });
    expect(cleared.pricing.gate).toMatchObject({ ok: false, unpricedStints: 1 });
  });

  test('refuses a Rate that has gone inactive', async ({ context }) => {
    const { db } = context;
    const { stints } = await completedJob(context, [{ machineId: context.excavator.id, arrival: 100, departure: 110 }]);
    await patchRate({ db, actorUserId: adminId, input: { id: context.wetHire.id, active: false } });
    await expect(
      setStintRate({
        db,
        actor: admin,
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
      actor: admin,
      input: { assignmentId: haul.id, rateId: context.perLoad.id },
    });
    expect(measured.assignments.find((stint) => stint.id === haul.id)).toMatchObject({
      pricing: { finalAmount: 0, measureMissing: true },
    });
    await setMeasure({
      db,
      actor: admin,
      input: { assignmentId: haul.id, measureTypeId: context.loads.id, quantity: 18 },
    });
    expect(await stintOf(db, jobId, haul.id)).toMatchObject({
      pricing: { computedAmount: 15_300, finalAmount: 15_300, measureMissing: false, billedQuantity: 18 },
    });

    await setStintAmount({ db, actor: admin, input: { assignmentId: haul.id, finalAmount: 14_000 } });
    await setMeasure({
      db,
      actor: admin,
      input: { assignmentId: haul.id, measureTypeId: context.loads.id, quantity: 20 },
    });
    expect(await stintOf(db, jobId, haul.id)).toMatchObject({
      pricing: { computedAmount: 17_000, finalAmount: 14_000, amountEdited: true },
    });
    await setStintRate({ db, actor: admin, input: { assignmentId: haul.id, rateId: context.perLoad.id } });
    expect(await stintOf(db, jobId, haul.id)).toMatchObject({
      pricing: { finalAmount: 17_000, amountEdited: false },
    });

    await setStintRate({ db, actor: admin, input: { assignmentId: secondDig.id, rateId: context.wetHire.id } });
    expect(await stintOf(db, jobId, secondDig.id)).toMatchObject({
      pricing: { billedQuantity: 10, finalAmount: 5_500 },
    });
    await resolveGap({
      db,
      actor: admin,
      input: { id: secondDig.id, travelHours: 0.5, unaccountedHours: 1.5, reason: 'Refuelled at the yard' },
    });
    expect(await stintOf(db, jobId, secondDig.id)).toMatchObject({
      pricing: { billedQuantity: 8.5, finalAmount: 4_675 },
    });
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
      actor: admin,
      input: { assignmentId: stints[0]?.id ?? '', rateId: context.dryHire.id },
    });
    const line = await createChargeLine({ db, actor: admin, input: { jobId, description: 'Low-bed' } });
    if (!line) throw new Error('Expected a charge line');
    await patchChargeLine({ db, actor: admin, input: { id: line.id, amount: 3_500 } });

    const priced = await setDieselPrice({ db, actor: admin, input: { jobId, unitPrice: 23 } });
    expect(priced).toMatchObject({ diesel: { unitPrice: 23, amount: 4_830, amountEdited: false } });
    const overridden = await setDieselPrice({
      db,
      actor: admin,
      input: { jobId, unitPrice: 23, amount: 4_800 },
    });
    expect(overridden).toMatchObject({ diesel: { amount: 4_800, amountEdited: true } });
    await setDieselPrice({ db, actor: admin, input: { jobId, unitPrice: 23 } });

    const discounted = await setDiscount({
      db,
      actor: admin,
      input: { jobId, discount: { kind: 'percent', value: 5 } },
    });
    expect(discounted.pricing).toMatchObject({
      subtotal: 32_660,
      discountAmount: 1_633,
      dieselAmount: 4_830,
      total: 35_857,
      gate: { ok: true },
    });
    expect(discounted).toMatchObject({ discount: { kind: 'percent', value: 5, amount: 1_633 } });

    await setDieselPrice({ db, actor: admin, input: { jobId, unitPrice: 23, amount: 5_000 } });
    expect(await patchJob({ db, actor: admin, input: { id: jobId, dieselLitres: 0 } })).toMatchObject({
      diesel: null,
      pricing: { dieselAmount: 0 },
    });
  });

  test('refuses a diesel price when no diesel was supplied', async ({ context }) => {
    const { db } = context;
    const { jobId } = await completedJob(context, [{ machineId: context.excavator.id, arrival: 100, departure: 110 }]);
    await expect(setDieselPrice({ db, actor: admin, input: { jobId, unitPrice: 23 } })).rejects.toMatchObject({
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
    const line = await createChargeLine({ db, actor: admin, input: { jobId, description: 'Fixed quote' } });
    if (!line) throw new Error('Expected a charge line');
    await setStintRate({ db, actor: admin, input: { assignmentId: dig.id, rateId: context.dryHire.id } });

    await expect(markPriced({ db, actor: admin, input: { id: jobId, expectedTotal: 6_000 } })).rejects.toMatchObject({
      code: 'contracting_job.pricing_incomplete',
      message:
        'This Job cannot be priced yet: 1 Assignment has no Rate · 1 charge line has no amount · Diesel is not priced.',
    });

    await setStintRate({ db, actor: admin, input: { assignmentId: haul.id, rateId: null } });
    await expect(
      setStintAmount({ db, actor: admin, input: { assignmentId: haul.id, finalAmount: 500 } }),
    ).rejects.toMatchObject({ code: 'contracting_job.wrong_status' });
    await patchChargeLine({ db, actor: admin, input: { id: line.id, amount: 0 } });
    await setDieselPrice({ db, actor: admin, input: { jobId, unitPrice: 20 } });
    await patchJob({ db, actor: admin, input: { id: jobId, dieselLitres: 150 } });
    await setStintAmount({ db, actor: admin, input: { assignmentId: dig.id, finalAmount: 5_500 } });
    const draft = await getJob({ db, id: jobId });
    expect(draft).toMatchObject({ diesel: { amount: 3_000 }, pricing: { total: 8_500, gate: { ok: true } } });

    await expect(markPriced({ db, actor: admin, input: { id: jobId, expectedTotal: 8_000 } })).rejects.toMatchObject({
      code: 'contracting_job.total_changed',
    });
    const priced = await markPriced({ db, actor: admin, input: { id: jobId, expectedTotal: 8_500 } });

    expect(priced).toMatchObject({
      status: 'priced',
      pricedTotal: 8_500,
      diesel: { amount: 3_000 },
      pricing: { subtotal: 5_500 },
    });
    expect(priced.pricing.total).toBe(priced.pricedTotal);
    expect(priced.assignments[0]).toMatchObject({
      pricing: { computedAmount: 6_000, finalAmount: 5_500, amountEdited: true },
    });
    expect(
      (
        await listJobs({
          db,
          actor: accessForRole('contracting-admin', 'reader'),
          queue: 'awaiting-invoice',
          limit: 50,
          offset: 0,
        })
      ).map((job) => job.id),
    ).toEqual([jobId]);
  });
});

describe('a reading amendment on a Priced Job', () => {
  const priceAt = async (db: Db, jobId: string, assignmentId: string, rateId: string) => {
    await setStintRate({ db, actor: admin, input: { assignmentId, rateId } });
    const total = (await getJob({ db, id: jobId })).pricing.total;
    return markPriced({ db, actor: admin, input: { id: jobId, expectedTotal: total } });
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
    await setStintRate({ db, actor: admin, input: { assignmentId: dig.id, rateId: context.dryHire.id } });
    await setStintAmount({ db, actor: admin, input: { assignmentId: dig.id, finalAmount: 5_500 } });
    await markPriced({ db, actor: admin, input: { id: jobId, expectedTotal: 5_500 } });
    const eventsBefore = await jobEvents(db, jobId);

    await amendReading({
      db,
      actor: admin,
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
    expect(reopened.assignments[0]).toMatchObject({
      pricing: { name: 'Dry hire', finalAmount: 5_400, amountEdited: false },
    });
    expect(await jobEvents(db, jobId)).toBe(eventsBefore + 1);
    expect(
      (
        await listJobs({
          db,
          actor: accessForRole('contracting-admin', 'reader'),
          queue: 'awaiting-pricing',
          limit: 50,
          offset: 0,
        })
      ).map((job) => job.id),
    ).toEqual([jobId]);

    const repriced = await markPriced({ db, actor: admin, input: { id: jobId, expectedTotal: 5_400 } });
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
      actor: admin,
      input: { id: firstStint.departureReadingId, value: 111, reason: 'Misread the meter' },
    });

    expect(await getJob({ db, id: first.jobId })).toMatchObject({ status: 'completed', pricing: { total: 6_600 } });
    expect(await getJob({ db, id: next.jobId })).toMatchObject({
      status: 'completed',
      repricingNote: 'Hour Reading amended on CAT320-1 — amounts recomputed.',
      pricing: { total: 5_400 },
    });
  });
});
