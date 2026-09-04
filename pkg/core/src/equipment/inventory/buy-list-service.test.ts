import type { Db } from '@pkg/db';
import { user } from '@pkg/db';
import {
  customers,
  jobBays,
  jobCfoAssemblies,
  jobCfoParts,
  jobEstimateSnapshots,
  jobSlots,
  jobs,
  parts,
  purchaseOrders,
  quotes,
  stockMovements,
  supplier,
} from '@pkg/db/equipment';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { estimateSnapshot, seedProductUnit, seedSentPurchaseOrder } from '../test/inventory-fixtures.js';
import { partValues } from '../test/part-fixtures.js';
import { listBuyList } from './buy-list-service.js';
import { closeOutJob } from './close-out-service.js';
import { postAdjustment, postJobMovement, postRevaluation } from './stock-movement-service.js';

const actorUserId = 'buy-list-test-user';
const clock = () => new Date('2026-08-04T08:00:00.000Z');

/**
 * One plant with every reason a Part reaches procurement, so the ranking is exercised against a
 * list that actually needs ordering rather than one row per assertion.
 */
const test = createTester(async ({ db }) => {
  const now = new Date('2026-08-01T08:00:00.000Z');
  await db.insert(user).values({
    createdAt: now,
    email: 'buy-list@example.com',
    emailVerified: true,
    id: actorUserId,
    name: 'Buy List Tester',
    role: 'admin',
    updatedAt: now,
  });

  const suppliers = await db
    .insert(supplier)
    .values([{ companyName: 'Alpha Supplies' }, { companyName: 'Beta Metals' }])
    .returning();
  const [alpha, beta] = suppliers;
  if (!alpha || !beta) throw new Error('Supplier inserts did not return rows');

  const partRows = await db
    .insert(parts)
    .values([
      partValues({ code: 'URGENT', supplierId: alpha.id, unitOfMeasure: 'piece' }),
      partValues({ code: 'LATER', supplierId: beta.id, unitOfMeasure: 'piece' }),
      { ...partValues({ code: 'MIN', supplierId: alpha.id, unitOfMeasure: 'piece' }), minimumStock: 10 },
      partValues({ code: 'EMPTY', supplierId: alpha.id, unitOfMeasure: 'piece' }),
      partValues({ code: 'FINE', supplierId: alpha.id, unitOfMeasure: 'piece' }),
      partValues({ code: 'NEVER', supplierId: alpha.id, unitOfMeasure: 'piece' }),
      partValues({ code: 'BUILT', isInternallyFabricated: true, supplierId: alpha.id, unitOfMeasure: 'piece' }),
    ])
    .returning();
  const [urgent, later, minimum, empty, fine, never, built] = partRows;
  if (!urgent || !later || !minimum || !empty || !fine || !never || !built) {
    throw new Error('Part inserts did not return rows');
  }

  const [customer] = await db.insert(customers).values({ companyName: 'Buy List Customer' }).returning();
  if (!customer) throw new Error('Customer insert did not return a row');

  const [soonBay, lateBay] = await db
    .insert(jobBays)
    .values([
      { department: 'assembly', name: 'Soon bay', scheduleOrigin: '2026-08-05' },
      { department: 'assembly', name: 'Late bay', scheduleOrigin: '2026-09-14' },
    ])
    .returning();
  if (!soonBay || !lateBay) throw new Error('Bay inserts did not return rows');

  const soonJob = await seedJob(db, { bayId: soonBay.id, customerId: customer.id, title: 'Soon work' });
  const lateJob = await seedJob(db, { bayId: lateBay.id, customerId: customer.id, title: 'Late work' });
  const unscheduledJob = await seedJob(db, { customerId: customer.id, title: 'Unscheduled work' });

  await seedCfo(db, { jobId: soonJob.id, partId: urgent.id, quantity: 6 });
  await seedCfo(db, { jobId: lateJob.id, partId: later.id, quantity: 4 });
  await seedCfo(db, { jobId: unscheduledJob.id, partId: empty.id, quantity: 2 });

  await seedStock(db, urgent.id, 2);
  await seedStock(db, later.id, 1);
  await seedStock(db, minimum.id, 4);
  await seedStock(db, fine.id, 20);

  return {
    bays: { late: lateBay, soon: soonBay },
    jobs: { late: lateJob, soon: soonJob, unscheduled: unscheduledJob },
    parts: { built, empty, fine, later, minimum, never, urgent },
    suppliers: { alpha, beta },
  };
});

describe('listBuyList', () => {
  test('uses estimated whole plates for an estimator Part without changing its ledger', async ({ context }) => {
    const [plate] = await context.db
      .insert(parts)
      .values({
        ...partValues({
          code: 'PLATE',
          stockTrackingMode: 'periodic',
          supplierId: context.suppliers.alpha.id,
          unitOfMeasure: 'piece',
        }),
        averageUtilizationPercent: 85,
        minimumStock: 3,
      })
      .returning();
    if (!plate) throw new Error('Plate insert did not return a row');
    const revaluation = await postRevaluation({
      actorUserId,
      db: context.db,
      input: { note: null, partId: plate.id, unitCost: 1_000 },
    });
    await context.db
      .update(stockMovements)
      .set({ createdAt: new Date('2026-08-01T08:00:00.000Z') })
      .where(eq(stockMovements.id, revaluation.id));
    const opening = await postAdjustment({
      actorUserId,
      db: context.db,
      input: { delta: 3, lengthMm: null, note: null, partId: plate.id, reason: 'opening-balance', unitCost: 1_000 },
    });
    await context.db
      .update(stockMovements)
      .set({ createdAt: new Date('2026-08-02T08:00:00.000Z') })
      .where(eq(stockMovements.id, opening.id));
    const productUnit = await seedProductUnit(context.db, 'BUY-PLATE');
    await context.db
      .update(jobs)
      .set({ createdAt: new Date('2026-08-01T12:00:00.000Z'), productUnitId: productUnit.id })
      .where(eq(jobs.id, context.jobs.soon.id));
    await context.db.insert(jobEstimateSnapshots).values({
      jobId: context.jobs.soon.id,
      payload: estimateSnapshot(plate, 0.06),
    });

    const row = (await listBuyList({ clock, db: context.db })).items.find((item) => item.partId === plate.id);

    expect(row).toMatchObject({ free: 2, quantity: 2, reasons: ['below-minimum'], suggestedQuantity: 1 });
  });

  test('ranks Parts short for Jobs by the earliest driving Slot date', async ({ context }) => {
    const result = await listBuyList({ clock, db: context.db });
    const shortForJobs = result.items.filter((item) => item.reasons.includes('negative-free'));

    expect(shortForJobs.map((item) => item.partCode)).toEqual(['URGENT', 'LATER', 'EMPTY']);
    expect(shortForJobs[0]?.earliestDemandDate).toBe('2026-08-05');
    expect(shortForJobs[1]?.earliestDemandDate).toBe('2026-09-14');
    // The Job holding demand but no Slot is not urgent; it ranks behind every dated row.
    expect(shortForJobs[2]?.earliestDemandDate).toBeNull();
  });

  test('names the Jobs driving a shortfall with the commitment each still holds', async ({ context }) => {
    const result = await listBuyList({ clock, db: context.db });
    const urgent = result.items.find((item) => item.partCode === 'URGENT');

    expect(urgent?.committed).toBe(6);
    expect(urgent?.free).toBe(-4);
    expect(urgent?.drivingJobs).toEqual([
      expect.objectContaining({ committedQuantity: 6, earliestSlotDate: '2026-08-05' }),
    ]);
  });

  test('nets an open sent order out of the suggestion and names it as cover', async ({ context }) => {
    await seedSentPurchaseOrder(
      context.db,
      context.suppliers.alpha.id,
      [{ partId: context.parts.urgent.id, quantity: 3 }],
      { expectedDeliveryDate: '2026-08-06' },
    );

    const urgent = (await listBuyList({ clock, db: context.db })).items.find((item) => item.partCode === 'URGENT');

    expect(urgent).toMatchObject({ onOrder: 3, suggestedQuantity: 1 });
    expect(urgent?.coveringOrders).toEqual([
      expect.objectContaining({ expectedDeliveryDate: '2026-08-06', outstandingQuantity: 3 }),
    ]);
  });

  test('stops counting a closed-short order as cover', async ({ context }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(
      context.db,
      context.suppliers.alpha.id,
      [{ partId: context.parts.urgent.id, quantity: 3 }],
      { expectedDeliveryDate: '2026-08-06' },
    );
    await context.db
      .update(purchaseOrders)
      .set({ closedShortAt: new Date('2026-08-03T08:00:00.000Z') })
      .where(eq(purchaseOrders.id, purchaseOrderId));

    const urgent = (await listBuyList({ clock, db: context.db })).items.find((item) => item.partCode === 'URGENT');

    expect(urgent).toMatchObject({ coveringOrders: [], onOrder: 0, suggestedQuantity: 4 });
  });

  test('leaves a draft order out of on-order entirely', async ({ context }) => {
    await seedSentPurchaseOrder(
      context.db,
      context.suppliers.alpha.id,
      [{ partId: context.parts.urgent.id, quantity: 3 }],
      { expectedDeliveryDate: '2026-08-06', status: 'draft' },
    );

    const urgent = (await listBuyList({ clock, db: context.db })).items.find((item) => item.partCode === 'URGENT');

    expect(urgent).toMatchObject({ onOrder: 0, suggestedQuantity: 4 });
  });

  test('tags a Part below its minimum and asks for the gap up to it', async ({ context }) => {
    const minimum = (await listBuyList({ clock, db: context.db })).items.find((item) => item.partCode === 'MIN');

    expect(minimum).toMatchObject({ quantity: 4, reasons: ['below-minimum'], suggestedQuantity: 6 });
  });

  test('carries a Built Part with no Supplier to buy from once its shelf has run out', async ({ context }) => {
    await seedStock(context.db, context.parts.built.id, 1, null);
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: {
        delta: -1,
        lengthMm: null,
        note: 'Written off',
        partId: context.parts.built.id,
        reason: 'scrap',
        unitCost: null,
      },
    });

    const built = (await listBuyList({ clock, db: context.db })).items.find((item) => item.partCode === 'BUILT');

    expect(built).toMatchObject({
      isInternallyFabricated: true,
      reasons: ['out-of-stock'],
      supplierId: null,
      supplierName: null,
    });
  });

  test('leaves a Part that has never been stocked off the list entirely', async ({ context }) => {
    const codes = (await listBuyList({ clock, db: context.db })).items.map((item) => item.partCode);

    // Never bought is not "run out" (spec §9); a whole catalogue of them would pin the signal open.
    expect(codes).not.toContain('NEVER');
    expect(codes).not.toContain('BUILT');
  });

  test('leaves a Part with cover and no reorder level off the list', async ({ context }) => {
    const result = await listBuyList({ clock, db: context.db });

    expect(result.items.map((item) => item.partCode)).not.toContain('FINE');
  });

  test('drops a Part whose only demand belonged to a closed-out Job', async ({ context }) => {
    await context.db.update(jobs).set({ completedOn: '2026-08-03' }).where(eq(jobs.id, context.jobs.soon.id));
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.soon.id, lengthMm: null, partId: context.parts.urgent.id, quantity: 2 },
      movementType: 'checkout',
    });
    await closeOutJob({ actorUserId, db: context.db, input: { jobId: context.jobs.soon.id, note: null } });

    const urgent = (await listBuyList({ clock, db: context.db })).items.find((item) => item.partCode === 'URGENT');

    // Close-out released the remainder; what is left on the shelf is zero, which is its own signal.
    expect(urgent).toMatchObject({ committed: 0, free: 0, reasons: ['out-of-stock'] });
  });
});

async function seedJob(
  db: Db,
  { bayId, customerId, title }: { bayId?: string; customerId: string; title: string },
): Promise<{ id: string }> {
  const [quote] = await db
    .insert(quotes)
    .values({
      customerId,
      kind: 'custom',
      quotedBasePrice: 0,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: actorUserId,
      status: 'accepted',
      workTitle: title,
    })
    .returning();
  if (!quote) throw new Error('Quote insert did not return a row');

  const [job] = await db.insert(jobs).values({ quoteId: quote.id }).returning();
  if (!job) throw new Error('Job insert did not return a row');

  if (bayId) {
    await db.insert(jobSlots).values({ bayId, durationDays: 3, jobId: job.id, kind: 'work', sequence: 1 });
  }

  return job;
}

async function seedCfo(
  db: Db,
  { jobId, partId, quantity }: { jobId: string; partId: string; quantity: number },
): Promise<void> {
  const [assembly] = await db
    .insert(jobCfoAssemblies)
    .values({ assemblyName: 'Assembly', jobId, kind: 'standard', sequence: 0 })
    .returning();
  if (!assembly) throw new Error('CFO assembly insert did not return a row');

  await db.insert(jobCfoParts).values({ cfoAssemblyId: assembly.id, partId, quantity });
}

async function seedStock(db: Db, partId: string, delta: number, unitCost: number | null = 5): Promise<void> {
  await postAdjustment({
    actorUserId,
    db,
    // A Built Part's cost comes from its build, so its opening balance may never carry one.
    input: { delta, lengthMm: null, note: null, partId, reason: 'opening-balance', unitCost },
  });
}
