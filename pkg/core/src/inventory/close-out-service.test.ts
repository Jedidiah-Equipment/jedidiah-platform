import type { Db } from '@pkg/db';
import {
  customers,
  jobCfoAssemblies,
  jobCfoParts,
  jobStockCloseOuts,
  jobs,
  parts,
  quotes,
  supplier,
  user,
} from '@pkg/db';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { JobAlreadyClosedOutError, JobNotCompletedError } from './close-out-errors.js';
import { closeOutJob, listCloseOutQueue } from './close-out-service.js';
import { listJobStock, listStockOnHand, postAdjustment, postJobMovement } from './stock-movement-service.js';

const actorUserId = 'close-out-test-user';
const clock = () => new Date('2026-08-04T08:00:00.000Z');

const test = createTester(async ({ db }) => {
  const now = new Date('2026-08-01T08:00:00.000Z');
  await db.insert(user).values({
    createdAt: now,
    email: 'close-out@example.com',
    emailVerified: true,
    id: actorUserId,
    name: 'Close-out Tester',
    role: 'admin',
    updatedAt: now,
  });
  const [createdSupplier] = await db.insert(supplier).values({ companyName: 'Close-out Supplier' }).returning();
  if (!createdSupplier) throw new Error('Supplier insert did not return a row');

  const [part] = await db
    .insert(parts)
    .values({
      category: 'Bearings',
      code: 'PIECE',
      description: 'Close-out part',
      finish: 'Plain',
      name: 'Close-out part',
      supplierCode: 'SUP-PIECE',
      supplierId: createdSupplier.id,
      unitOfMeasure: 'piece',
    })
    .returning();
  if (!part) throw new Error('Part insert did not return a row');

  const seededJobs = await seedJobs(db, part.id);

  await postAdjustment({
    actorUserId,
    db,
    input: { delta: 50, lengthMm: null, note: null, partId: part.id, reason: 'opening-balance', unitCost: 10 },
  });

  return { jobs: seededJobs, partId: part.id };
});

describe('closeOutJob', () => {
  test('records the close once and refuses a second one', async ({ context }) => {
    const closeOut = await closeOutJob({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, note: '  Bin counted back in  ' },
    });

    expect(closeOut).toMatchObject({ actorUserId, jobId: context.jobs.cfo.id, note: 'Bin counted back in' });
    await expect(
      closeOutJob({ actorUserId, db: context.db, input: { jobId: context.jobs.cfo.id, note: null } }),
    ).rejects.toBeInstanceOf(JobAlreadyClosedOutError);

    const rows = await context.db
      .select()
      .from(jobStockCloseOuts)
      .where(eq(jobStockCloseOuts.jobId, context.jobs.cfo.id));
    expect(rows).toHaveLength(1);
  });

  test('refuses a Job that has no Job Completion', async ({ context }) => {
    await context.db.update(jobs).set({ completedOn: null }).where(eq(jobs.id, context.jobs.cfo.id));

    await expect(
      closeOutJob({ actorUserId, db: context.db, input: { jobId: context.jobs.cfo.id, note: null } }),
    ).rejects.toBeInstanceOf(JobNotCompletedError);
  });
});

describe('close-out and commitment', () => {
  test('zeroes remaining commitment for the Job and for free stock', async ({ context }) => {
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.partId, quantity: 2 },
      movementType: 'checkout',
    });

    const beforeJobStock = await listJobStock({ db: context.db, jobId: context.jobs.cfo.id });
    const beforeOnHand = await listStockOnHand({ db: context.db });
    expect(beforeJobStock.items[0]?.committedQuantity).toBe(3);
    expect(beforeOnHand.items.find((row) => row.partId === context.partId)?.committed).toBe(3);

    await closeOutJob({ actorUserId, db: context.db, input: { jobId: context.jobs.cfo.id, note: null } });

    const afterJobStock = await listJobStock({ db: context.db, jobId: context.jobs.cfo.id });
    const afterOnHand = await listStockOnHand({ db: context.db });
    expect(afterJobStock.items[0]?.committedQuantity).toBe(0);
    expect(afterJobStock.job.closedOutAt).not.toBeNull();
    expect(afterOnHand.items.find((row) => row.partId === context.partId)?.committed).toBe(0);
  });

  test('stays at zero when stock moves after the close', async ({ context }) => {
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.partId, quantity: 4 },
      movementType: 'checkout',
    });
    await closeOutJob({ actorUserId, db: context.db, input: { jobId: context.jobs.cfo.id, note: null } });

    // A return after the close drops drawn back below the CFO; the released commitment must not
    // come back with it (spec §3: "Closed-out stays zero regardless of later movements").
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.partId, quantity: 4 },
      movementType: 'return-to-store',
    });

    const jobStock = await listJobStock({ db: context.db, jobId: context.jobs.cfo.id });
    const onHand = await listStockOnHand({ db: context.db });
    expect(jobStock.items[0]).toMatchObject({ cfoQuantity: 5, committedQuantity: 0, drawnQuantity: 0 });
    expect(onHand.items.find((row) => row.partId === context.partId)?.committed).toBe(0);
  });
});

describe('listCloseOutQueue', () => {
  test('lists a completed Job with open commitment and drops it once closed', async ({ context }) => {
    const queued = await listCloseOutQueue({ clock, db: context.db });

    expect(queued.items).toEqual([
      expect.objectContaining({
        ageDays: 3,
        code: expect.any(String),
        committedQuantity: 5,
        completedOn: '2026-08-01',
        drawnQuantity: 0,
        isStale: false,
        jobId: context.jobs.cfo.id,
      }),
    ]);

    await closeOutJob({ actorUserId, db: context.db, input: { jobId: context.jobs.cfo.id, note: null } });

    expect((await listCloseOutQueue({ clock, db: context.db })).items).toEqual([]);
  });

  test('queues a Custom Job with no CFO on its unreturned draws alone', async ({ context }) => {
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.partId, quantity: 3 },
      movementType: 'checkout',
    });

    const withDraws = await listCloseOutQueue({ clock, db: context.db });
    expect(withDraws.items.map((row) => row.jobId)).toContain(context.jobs.custom.id);
    expect(withDraws.items.find((row) => row.jobId === context.jobs.custom.id)).toMatchObject({
      committedQuantity: 0,
      drawnQuantity: 3,
    });

    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.partId, quantity: 3 },
      movementType: 'return-to-store',
    });

    // Everything came back, so there is nothing left to close out and the Job drops off unclosed.
    const settled = await listCloseOutQueue({ clock, db: context.db });
    expect(settled.items.map((row) => row.jobId)).not.toContain(context.jobs.custom.id);
  });

  test('skips open and cancelled Jobs, and ages the stale ones', async ({ context }) => {
    await context.db.update(jobs).set({ completedOn: null }).where(eq(jobs.id, context.jobs.cfo.id));
    expect((await listCloseOutQueue({ clock, db: context.db })).items).toEqual([]);

    await context.db.update(jobs).set({ completedOn: '2026-06-01' }).where(eq(jobs.id, context.jobs.cfo.id));
    expect((await listCloseOutQueue({ clock, db: context.db })).items[0]).toMatchObject({ ageDays: 64, isStale: true });

    await context.db
      .update(jobs)
      .set({ cancelledAt: new Date('2026-08-02T08:00:00.000Z') })
      .where(eq(jobs.id, context.jobs.cfo.id));
    expect((await listCloseOutQueue({ clock, db: context.db })).items).toEqual([]);
  });
});

async function seedJobs(db: Db, cfoPartId: string) {
  const [customer] = await db.insert(customers).values({ companyName: 'Close-out Customer' }).returning();
  if (!customer) throw new Error('Customer insert did not return a row');

  const [cfoQuote, customQuote] = await db
    .insert(quotes)
    .values([
      {
        customerId: customer.id,
        kind: 'custom',
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: actorUserId,
        status: 'accepted',
        workTitle: 'CFO fabrication',
      },
      {
        customerId: customer.id,
        kind: 'custom',
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: actorUserId,
        status: 'accepted',
        workTitle: 'Off-CFO repair',
      },
    ])
    .returning();
  if (!cfoQuote || !customQuote) throw new Error('Quote inserts did not return rows');

  const [cfo, custom] = await db
    .insert(jobs)
    .values([
      { completedOn: '2026-08-01', quoteId: cfoQuote.id },
      { completedOn: '2026-08-01', quoteId: customQuote.id },
    ])
    .returning();
  if (!cfo || !custom) throw new Error('Job inserts did not return rows');

  const [assembly] = await db
    .insert(jobCfoAssemblies)
    .values({ assemblyName: 'First assembly', jobId: cfo.id, kind: 'standard', sequence: 0 })
    .returning();
  if (!assembly) throw new Error('CFO assembly insert did not return a row');

  await db.insert(jobCfoParts).values({ cfoAssemblyId: assembly.id, partId: cfoPartId, quantity: 5 });

  return { cfo, custom };
}
