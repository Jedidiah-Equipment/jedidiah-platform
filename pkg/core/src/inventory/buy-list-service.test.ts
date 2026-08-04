import type { Db } from '@pkg/db';
import {
  customers,
  jobBays,
  jobCfoAssemblies,
  jobCfoParts,
  jobSlots,
  jobs,
  parts,
  purchaseOrderLines,
  purchaseOrders,
  quotes,
  supplier,
  user,
} from '@pkg/db';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { partValues } from '../test/part-fixtures.js';
import { listBuyList } from './buy-list-service.js';
import { closeOutJob } from './close-out-service.js';
import { postAdjustment, postJobMovement } from './stock-movement-service.js';

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
      partValues({ code: 'BUILT', isInternallyFabricated: true, supplierId: alpha.id, unitOfMeasure: 'piece' }),
    ])
    .returning();
  const [urgent, later, minimum, empty, fine, built] = partRows;
  if (!urgent || !later || !minimum || !empty || !fine || !built) throw new Error('Part inserts did not return rows');

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
    parts: { built, empty, fine, later, minimum, urgent },
    suppliers: { alpha, beta },
  };
});

describe('listBuyList', () => {
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
    await seedSentPurchaseOrder(context.db, {
      expectedDeliveryDate: '2026-08-06',
      lines: [{ partId: context.parts.urgent.id, quantity: 3 }],
      supplierId: context.suppliers.alpha.id,
    });

    const urgent = (await listBuyList({ clock, db: context.db })).items.find((item) => item.partCode === 'URGENT');

    expect(urgent).toMatchObject({ onOrder: 3, shortfall: 4, suggestedQuantity: 1 });
    expect(urgent?.coveringOrders).toEqual([
      expect.objectContaining({ expectedDeliveryDate: '2026-08-06', outstandingQuantity: 3 }),
    ]);
  });

  test('stops counting a closed-short order as cover', async ({ context }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, {
      expectedDeliveryDate: '2026-08-06',
      lines: [{ partId: context.parts.urgent.id, quantity: 3 }],
      supplierId: context.suppliers.alpha.id,
    });
    await context.db
      .update(purchaseOrders)
      .set({ closedShortAt: new Date('2026-08-03T08:00:00.000Z') })
      .where(eq(purchaseOrders.id, purchaseOrderId));

    const urgent = (await listBuyList({ clock, db: context.db })).items.find((item) => item.partCode === 'URGENT');

    expect(urgent).toMatchObject({ coveringOrders: [], onOrder: 0, suggestedQuantity: 4 });
  });

  test('leaves a draft order out of on-order entirely', async ({ context }) => {
    await seedSentPurchaseOrder(context.db, {
      expectedDeliveryDate: '2026-08-06',
      lines: [{ partId: context.parts.urgent.id, quantity: 3 }],
      status: 'draft',
      supplierId: context.suppliers.alpha.id,
    });

    const urgent = (await listBuyList({ clock, db: context.db })).items.find((item) => item.partCode === 'URGENT');

    expect(urgent).toMatchObject({ onOrder: 0, suggestedQuantity: 4 });
  });

  test('tags a Part below its minimum and asks for the gap up to it', async ({ context }) => {
    const minimum = (await listBuyList({ clock, db: context.db })).items.find((item) => item.partCode === 'MIN');

    expect(minimum).toMatchObject({ reasons: ['below-minimum'], shortfall: 6, suggestedQuantity: 6 });
  });

  test('tags an empty shelf and carries a Built Part with no Supplier to buy from', async ({ context }) => {
    const built = (await listBuyList({ clock, db: context.db })).items.find((item) => item.partCode === 'BUILT');

    expect(built).toMatchObject({
      isInternallyFabricated: true,
      reasons: ['out-of-stock'],
      supplierId: null,
      supplierName: null,
    });
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

async function seedStock(db: Db, partId: string, delta: number): Promise<void> {
  await postAdjustment({
    actorUserId,
    db,
    input: { delta, lengthMm: null, note: null, partId, reason: 'opening-balance', unitCost: 5 },
  });
}

async function seedSentPurchaseOrder(
  db: Db,
  {
    expectedDeliveryDate,
    lines,
    status = 'sent',
    supplierId,
  }: {
    expectedDeliveryDate: string | null;
    lines: ReadonlyArray<{ partId: string; quantity: number }>;
    status?: 'draft' | 'sent';
    supplierId: string;
  },
): Promise<string> {
  const [purchaseOrder] = await db
    .insert(purchaseOrders)
    .values({
      expectedDeliveryDate,
      sentAt: status === 'sent' ? new Date('2026-08-02T08:00:00.000Z') : null,
      status,
      supplierId,
    })
    .returning();
  if (!purchaseOrder) throw new Error('Purchase Order insert did not return a row');

  await db
    .insert(purchaseOrderLines)
    .values(lines.map((line) => ({ ...line, purchaseOrderId: purchaseOrder.id, unitPrice: 10 })));

  return purchaseOrder.id;
}
