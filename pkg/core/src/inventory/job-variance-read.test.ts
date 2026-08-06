import { jobs } from '@pkg/db';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { actorUserId, adjustmentInput, seedSentPurchaseOrder, test } from '../test/inventory-fixtures.js';
import { closeOutJob } from './close-out-service.js';
import { getJobMaterialVariance } from './job-variance-read.js';
import { postReceipt } from './receipt-service.js';
import { postAdjustment, postJobMovement } from './stock-movement-service.js';

describe('getJobMaterialVariance', () => {
  test('sums the CFO across its assemblies and nets returns out of the drawn quantity and cost', async ({
    context,
  }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 6 },
      movementType: 'checkout',
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 2 },
      movementType: 'return-to-store',
    });

    const report = await getJobMaterialVariance({ db: context.db, jobId: context.jobs.cfo.id });

    // The fixture's CFO plans this Part twice — 3 on one assembly, 2 on another.
    expect(report.items).toEqual([
      {
        actualCost: 40,
        drawnQuantity: 4,
        partCode: 'PIECE',
        partId: context.parts.piece.id,
        partName: expect.any(String),
        plannedQuantity: 5,
        unitOfMeasure: 'piece',
        varianceQuantity: -1,
      },
    ]);
    expect(report).toMatchObject({ offCfoActualCost: 0, totalActualCost: 40 });
    expect(report.job).toMatchObject({ closedOutAt: null, id: context.jobs.cfo.id });
  });

  test('carries an off-CFO draw as its own row and keeps its cost out of the planned total', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.measured.id, { delta: 10, unitCost: 4 }),
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 5 },
      movementType: 'checkout',
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.measured.id, quantity: 2.5 },
      movementType: 'checkout',
    });

    const report = await getJobMaterialVariance({ db: context.db, jobId: context.jobs.cfo.id });
    const offCfo = report.items.find((item) => item.partId === context.parts.measured.id);

    expect(offCfo).toMatchObject({ actualCost: 10, drawnQuantity: 2.5, plannedQuantity: 0, varianceQuantity: 2.5 });
    expect(report.totalActualCost).toBe(60);
    expect(report.offCfoActualCost).toBe(10);
  });

  test('holds a drawn cost still after a later receipt moves the Part average', async ({ context }) => {
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 10, unitPrice: 90 },
    ]);
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 5 },
      movementType: 'checkout',
    });

    const before = await getJobMaterialVariance({ db: context.db, jobId: context.jobs.cfo.id });
    await postReceipt({
      actorUserId,
      db: context.db,
      input: { lengthMm: null, partId: context.parts.piece.id, purchaseOrderId, quantity: 10, unitCost: null },
    });
    const after = await getJobMaterialVariance({ db: context.db, jobId: context.jobs.cfo.id });

    expect(before.totalActualCost).toBe(50);
    expect(after.items).toEqual(before.items);
    expect(after.totalActualCost).toBe(50);
  });

  test('sums a linear Part across its length buckets and reports one variance for the Part', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 4, lengthMm: 6_000, unitCost: 600 }),
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: 6_000, partId: context.parts.linear.id, quantity: 2 },
      movementType: 'checkout',
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: 3_000, partId: context.parts.linear.id, quantity: 1 },
      movementType: 'checkout',
    });

    const report = await getJobMaterialVariance({ db: context.db, jobId: context.jobs.custom.id });

    // Two 6 m pieces at 600 plus one 3 m piece at half that: three pieces drawn, one row, R1 500.
    expect(report.items).toMatchObject([{ actualCost: 1_500, drawnQuantity: 3, varianceQuantity: 3 }]);
  });

  test('keeps a priced Job priced when an offcut goes back in a length it never drew', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.linear.id, { delta: 2, lengthMm: 6_000, unitCost: 600 }),
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: 6_000, partId: context.parts.linear.id, quantity: 1 },
      movementType: 'checkout',
    });
    // Nothing was ever drawn in the 3 m bucket, so this return has no outstanding value to reverse
    // and is stamped uncosted — which must not take the priced 6 m draw's cost down with it.
    const returned = await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: 3_000, partId: context.parts.linear.id, quantity: 1 },
      movementType: 'return-to-store',
    });

    const report = await getJobMaterialVariance({ db: context.db, jobId: context.jobs.custom.id });

    expect(returned.movement.unitCost).toBeNull();
    expect(report.items).toMatchObject([{ actualCost: 600, drawnQuantity: 0 }]);
    expect(report.totalActualCost).toBe(600);
  });

  test('reports an uncosted draw as no cost yet rather than as free material', async ({ context }) => {
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.custom.id, lengthMm: null, partId: context.parts.measured.id, quantity: 3 },
      movementType: 'checkout',
    });

    const report = await getJobMaterialVariance({ db: context.db, jobId: context.jobs.custom.id });

    expect(report.items).toMatchObject([{ actualCost: null, drawnQuantity: 3 }]);
    expect(report).toMatchObject({ offCfoActualCost: null, totalActualCost: null });
  });

  test('reads a completed Job that has been closed out, planned demand and all', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 2 },
      movementType: 'checkout',
    });
    await context.db.update(jobs).set({ completedOn: '2026-08-03' }).where(eq(jobs.id, context.jobs.cfo.id));
    await closeOutJob({ actorUserId, db: context.db, input: { jobId: context.jobs.cfo.id, note: null } });

    const report = await getJobMaterialVariance({ db: context.db, jobId: context.jobs.cfo.id });

    expect(report.items).toMatchObject([{ drawnQuantity: 2, plannedQuantity: 5, varianceQuantity: -3 }]);
    expect(report.job.closedOutAt).not.toBeNull();
  });

  test('refuses a Job that does not exist rather than reporting an empty variance', async ({ context }) => {
    await expect(
      getJobMaterialVariance({ db: context.db, jobId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toMatchObject({ code: 'job.not_found' });
  });
});
