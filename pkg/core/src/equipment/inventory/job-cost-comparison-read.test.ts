import { jobEstimateSnapshots } from '@pkg/db/equipment';
import type { ProductCostEstimate } from '@pkg/schema/equipment';
import { describe, expect } from 'vitest';

import { actorUserId, adjustmentInput, test } from '../test/inventory-fixtures.js';
import { getJobCostComparison } from './job-cost-comparison-read.js';
import { postAdjustment, postJobMovement } from './stock-movement-service.js';

const PRODUCT_ID = '00000000-0000-4000-8000-000000000901';

function estimateSnapshot(totalCostFloor: number): ProductCostEstimate {
  return {
    assemblies: [],
    basePrice: 2_000,
    complete: true,
    currencyCode: 'ZAR',
    estimatedMarginCeiling: 2_000 - totalCostFloor,
    laborCostFloor: 300,
    laborHours: [],
    materialCostFloor: 400,
    materialLines: [],
    missing: { laborHours: false, materialList: false, unattributedProductTerms: false, uncostedParts: [] },
    optionalAssemblies: [],
    partsCostFloor: totalCostFloor - 700,
    productId: PRODUCT_ID,
    scope: 'build',
    totalCostFloor,
  };
}

describe('getJobCostComparison', () => {
  test('compares the frozen estimate with stamped drawn cost after the moving average changes', async ({ context }) => {
    await context.db.insert(jobEstimateSnapshots).values({
      jobId: context.jobs.cfo.id,
      payload: estimateSnapshot(1_000),
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 10 }),
    });
    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 4 },
      movementType: 'checkout',
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10, unitCost: 30 }),
    });

    await expect(getJobCostComparison({ db: context.db, jobId: context.jobs.cfo.id })).resolves.toMatchObject({
      actualCost: 40,
      estimatedPartsCostFloor: 300,
      partsCostVariance: -260,
      snapshot: { estimate: { totalCostFloor: 1_000 } },
    });
  });

  test('returns no estimate for a Job without a snapshot', async ({ context }) => {
    await expect(getJobCostComparison({ db: context.db, jobId: context.jobs.custom.id })).resolves.toMatchObject({
      estimatedPartsCostFloor: null,
      partsCostVariance: null,
      snapshot: null,
    });
  });
});
