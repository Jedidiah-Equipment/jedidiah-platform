import {
  jobEstimateSnapshots,
  jobs,
  parts,
  productMaterialLines,
  productRanges,
  products,
  productUnits,
  stockMovements,
  stocktakeSessions,
  supplier,
  user,
} from '@pkg/db';
import { and, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { getProductCostEstimate } from '../products/product-cost-estimate-service.js';
import { createTester } from '../test/create-tester.js';
import { estimateSnapshot } from '../test/inventory-fixtures.js';
import { partValues as testPartValues } from '../test/part-fixtures.js';
import { listBuyList } from './buy-list-service.js';
import { StockMovementDeltaError } from './stock-movement-errors.js';
import { getStockMovementHistory, listStockOnHand, postAdjustment } from './stock-movement-service.js';
import {
  StocktakePartOutOfScopeError,
  StocktakeSessionAlreadyOpenError,
  StocktakeSessionClosedError,
  StocktakeSessionNotFoundError,
  StocktakeUncountedBucketError,
} from './stocktake-errors.js';
import {
  closeStocktakeSession,
  getStocktakeSession,
  getStocktakeSessionReport,
  listStocktakeOverdue,
  listStocktakeSessions,
  listStocktakeUncounted,
  openStocktakeSession,
  postStockCount,
} from './stocktake-service.js';

const actorUserId = 'stocktake-test-user';

const test = createTester(async ({ db }) => {
  const now = new Date('2026-08-01T08:00:00.000Z');
  await db.insert(user).values({
    createdAt: now,
    email: 'stocktake@example.com',
    emailVerified: true,
    id: actorUserId,
    name: 'Stocktake Tester',
    role: 'admin',
    updatedAt: now,
  });
  const [createdSupplier] = await db.insert(supplier).values({ companyName: 'Stocktake Supplier' }).returning();
  if (!createdSupplier) throw new Error('Supplier insert did not return a row');

  const partValues = {
    category: 'Stocktake',
    description: 'Stocktake part',
    finish: 'Plain',
    supplierId: createdSupplier.id,
  };
  const [bolt, channel, spare] = await db
    .insert(parts)
    .values([
      { ...partValues, code: 'BOLT', name: 'Bolt', supplierCode: 'S-BOLT', unitOfMeasure: 'piece' },
      {
        ...partValues,
        code: 'CHANNEL',
        name: 'Channel',
        standardPurchaseLengthMm: 13_000,
        stockTrackingMode: 'periodic',
        supplierCode: 'S-CHANNEL',
        unitOfMeasure: 'mm',
      },
      { ...partValues, code: 'SPARE', name: 'Spare', supplierCode: 'S-SPARE', unitOfMeasure: 'piece' },
    ])
    .returning();
  if (!bolt || !channel || !spare) throw new Error('Part insert did not return every row');

  await postAdjustment({
    actorUserId,
    db,
    input: { delta: 40, lengthMm: null, note: null, partId: bolt.id, reason: 'opening-balance', unitCost: 10 },
  });
  await postAdjustment({
    actorUserId,
    db,
    input: { delta: 9, lengthMm: 13_000, note: null, partId: channel.id, reason: 'opening-balance', unitCost: 6.5 },
  });

  return { boltId: bolt.id, channelId: channel.id, spareId: spare.id, supplierId: createdSupplier.id };
});

async function openStoresSession(db: Parameters<typeof openStocktakeSession>[0]['db']) {
  return openStocktakeSession({ actorUserId, db, input: { scope: 'stores' } });
}

describe('stocktake sessions', () => {
  test('opens one session per scope and refuses a second open one', async ({ context }) => {
    const session = await openStoresSession(context.db);

    expect(session).toMatchObject({
      closedAt: null,
      countedPartCount: 0,
      openedByUserId: actorUserId,
      scope: 'stores',
    });
    await expect(openStoresSession(context.db)).rejects.toBeInstanceOf(StocktakeSessionAlreadyOpenError);

    // The other rhythm is a different walk, so it opens beside this one.
    const rawMaterial = await openStocktakeSession({ actorUserId, db: context.db, input: { scope: 'raw-material' } });
    expect(rawMaterial.scope).toBe('raw-material');
  });

  test('refuses the loser of a concurrent open with the same guidance, not a database error', async ({ context }) => {
    const [first, second] = await Promise.allSettled([openStoresSession(context.db), openStoresSession(context.db)]);
    const outcomes = [first, second];

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    // The loser lost at the partial unique index, and that violation reads as the same sentence.
    expect(rejected?.reason).toBeInstanceOf(StocktakeSessionAlreadyOpenError);
  });

  test('closes once and refuses everything afterwards', async ({ context }) => {
    const session = await openStoresSession(context.db);
    const closed = await closeStocktakeSession({ actorUserId, db: context.db, input: { sessionId: session.id } });

    expect(closed.closedAt).not.toBeNull();
    expect(closed.closedByUserId).toBe(actorUserId);
    await expect(
      closeStocktakeSession({ actorUserId, db: context.db, input: { sessionId: session.id } }),
    ).rejects.toBeInstanceOf(StocktakeSessionClosedError);
    await expect(
      postStockCount({
        actorUserId,
        db: context.db,
        input: { buckets: [{ lengthMm: null, observed: 1 }], partId: context.boltId, sessionId: session.id },
      }),
    ).rejects.toBeInstanceOf(StocktakeSessionClosedError);

    // Closing frees the scope: the next walk opens where the last one left off.
    await expect(openStoresSession(context.db)).resolves.toMatchObject({ scope: 'stores' });
  });

  test('refuses a session nobody opened', async ({ context }) => {
    await expect(
      getStocktakeSession({ db: context.db, sessionId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toBeInstanceOf(StocktakeSessionNotFoundError);
  });
});

describe('postStockCount', () => {
  test('posts the delta between the count and the ledger, never an overwrite', async ({ context }) => {
    const session = await openStoresSession(context.db);
    const result = await postStockCount({
      actorUserId,
      db: context.db,
      input: { buckets: [{ lengthMm: null, observed: 32 }], partId: context.boltId, sessionId: session.id },
    });

    expect(result.buckets).toEqual([{ delta: -8, expected: 40, lengthMm: null, observed: 32 }]);
    expect(result.movements).toHaveLength(1);
    expect(result.movements[0]).toMatchObject({ delta: -8, movementType: 'adjustment', reason: 'stock-count' });

    const onHand = await listStockOnHand({ db: context.db });
    expect(onHand.items.find((row) => row.partId === context.boltId)?.quantity).toBe(32);
  });

  test("names the walk that posted it in the Part's own history", async ({ context }) => {
    const session = await openStoresSession(context.db);
    await postStockCount({
      actorUserId,
      db: context.db,
      input: { buckets: [{ lengthMm: null, observed: 32 }], partId: context.boltId, sessionId: session.id },
    });

    const history = await getStockMovementHistory({ db: context.db, partId: context.boltId });
    const count = history.items.find((row) => row.reason === 'stock-count');

    // Without this the row reads as an adjustment nobody can trace back to the count that made it.
    expect(count).toMatchObject({ stocktakeSessionId: session.id, stocktakeSessionScope: 'stores' });
  });

  test('measures against the ledger at count time, so a mid-session receipt is not counted away', async ({
    context,
  }) => {
    const session = await openStoresSession(context.db);
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: {
        delta: 10,
        lengthMm: null,
        note: 'Found a box',
        partId: context.boltId,
        reason: 'correction',
        unitCost: null,
      },
    });

    const result = await postStockCount({
      actorUserId,
      db: context.db,
      input: { buckets: [{ lengthMm: null, observed: 50 }], partId: context.boltId, sessionId: session.id },
    });

    expect(result.buckets[0]).toMatchObject({ delta: 0, expected: 50 });
    expect(await stockOnHandOf(context.db, context.boltId)).toBe(50);
  });

  test('records a count that agreed, so a perfect count is never read as a skip', async ({ context }) => {
    const session = await openStoresSession(context.db);
    await postStockCount({
      actorUserId,
      db: context.db,
      input: { buckets: [{ lengthMm: null, observed: 40 }], partId: context.boltId, sessionId: session.id },
    });

    const detail = await getStocktakeSessionReport({ db: context.db, sessionId: session.id });
    expect(detail.counts).toHaveLength(1);
    expect(detail.counts[0]).toMatchObject({ delta: 0, partCode: 'BOLT' });
    expect(await uncountedCodes(context.db, session.id)).toEqual(['SPARE']);
  });

  test('counts linear stock per length bucket and empties the buckets nobody named', async ({ context }) => {
    const session = await openStocktakeSession({ actorUserId, db: context.db, input: { scope: 'raw-material' } });
    const result = await postStockCount({
      actorUserId,
      db: context.db,
      input: {
        buckets: [
          { lengthMm: 13_000, observed: 7 },
          { lengthMm: 4200, observed: 1 },
        ],
        partId: context.channelId,
        sessionId: session.id,
      },
    });

    expect(result.buckets).toEqual([
      { delta: -2, expected: 9, lengthMm: 13_000, observed: 7 },
      { delta: 1, expected: 0, lengthMm: 4200, observed: 1 },
    ]);

    const row = (await listStockOnHand({ db: context.db })).items.find((item) => item.partId === context.channelId);
    expect(row?.buckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lengthMm: 4200, quantity: 1 }),
        expect.objectContaining({ lengthMm: 13_000, quantity: 7 }),
      ]),
    );
  });

  test('empties a stocked bucket the count says is empty', async ({ context }) => {
    const session = await openStocktakeSession({ actorUserId, db: context.db, input: { scope: 'raw-material' } });
    const result = await postStockCount({
      actorUserId,
      db: context.db,
      input: {
        buckets: [
          { lengthMm: 6000, observed: 2 },
          // The 13 m bucket was walked past and found empty, and the count says so.
          { lengthMm: 13_000, observed: 0 },
        ],
        partId: context.channelId,
        sessionId: session.id,
      },
    });

    expect(result.buckets).toEqual([
      { delta: 2, expected: 0, lengthMm: 6000, observed: 2 },
      { delta: -9, expected: 9, lengthMm: 13_000, observed: 0 },
    ]);
    expect(await stockOnHandOf(context.db, context.channelId)).toBe(2);
  });

  test('refuses a count that leaves a stocked bucket unnamed rather than writing it off', async ({ context }) => {
    const session = await openStocktakeSession({ actorUserId, db: context.db, input: { scope: 'raw-material' } });

    // Whatever arrived while the counter was at the rack is stock nobody looked at; inferring it
    // empty would destroy the arrival, so the post is refused and they are sent back to count it.
    await expect(
      postStockCount({
        actorUserId,
        db: context.db,
        input: { buckets: [{ lengthMm: 6000, observed: 2 }], partId: context.channelId, sessionId: session.id },
      }),
    ).rejects.toBeInstanceOf(StocktakeUncountedBucketError);
    expect(await stockOnHandOf(context.db, context.channelId)).toBe(9);
  });

  test('refuses a Part the session’s scope does not cover', async ({ context }) => {
    const session = await openStocktakeSession({ actorUserId, db: context.db, input: { scope: 'raw-material' } });

    await expect(
      postStockCount({
        actorUserId,
        db: context.db,
        input: { buckets: [{ lengthMm: null, observed: 1 }], partId: context.boltId, sessionId: session.id },
      }),
    ).rejects.toBeInstanceOf(StocktakePartOutOfScopeError);
  });

  test('refuses a fractional count of a discrete Part', async ({ context }) => {
    const session = await openStoresSession(context.db);

    await expect(
      postStockCount({
        actorUserId,
        db: context.db,
        input: { buckets: [{ lengthMm: null, observed: 1.5 }], partId: context.boltId, sessionId: session.id },
      }),
    ).rejects.toBeInstanceOf(StockMovementDeltaError);
  });

  test('stamps the session on the movement and leaves ad-hoc counts sessionless', async ({ context }) => {
    const session = await openStoresSession(context.db);
    await postStockCount({
      actorUserId,
      db: context.db,
      input: { buckets: [{ lengthMm: null, observed: 39 }], partId: context.boltId, sessionId: session.id },
    });
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: {
        delta: -1,
        lengthMm: null,
        note: 'Spot count',
        partId: context.boltId,
        reason: 'stock-count',
        unitCost: null,
      },
    });

    const rows = await context.db
      .select({ sessionId: stockMovements.stocktakeSessionId })
      .from(stockMovements)
      .where(and(eq(stockMovements.partId, context.boltId), eq(stockMovements.reason, 'stock-count')));

    expect(rows.map((row) => row.sessionId).sort()).toEqual([session.id, null].sort());
  });

  test('a count to zero reaches the out-of-stock signal', async ({ context }) => {
    const session = await openStoresSession(context.db);
    await postStockCount({
      actorUserId,
      db: context.db,
      input: { buckets: [{ lengthMm: null, observed: 0 }], partId: context.boltId, sessionId: session.id },
    });

    const buyList = await listBuyList({ db: context.db });
    expect(buyList.items.find((item) => item.partId === context.boltId)?.reasons).toContain('out-of-stock');
  });
});

describe('the session variance report', () => {
  test('shows the plate estimate from immediately before the count re-anchored it', async ({ context }) => {
    const [plate] = await context.db
      .insert(parts)
      .values({
        ...testPartValues({
          code: 'PLATE',
          stockTrackingMode: 'periodic',
          supplierId: context.supplierId,
          unitOfMeasure: 'piece',
        }),
        averageUtilizationPercent: 85,
      })
      .returning();
    if (!plate) throw new Error('Plate insert did not return a row');
    const opening = await postAdjustment({
      actorUserId,
      db: context.db,
      input: { delta: 3, lengthMm: null, note: null, partId: plate.id, reason: 'opening-balance', unitCost: 1_000 },
    });
    await context.db
      .update(stockMovements)
      .set({ createdAt: new Date('2026-08-01T08:00:00.000Z') })
      .where(eq(stockMovements.id, opening.id));
    const [range] = await context.db.insert(productRanges).values({ displayOrder: 0, name: 'Plate range' }).returning();
    if (!range) throw new Error('Product Range insert did not return a row');
    const [product] = await context.db
      .insert(products)
      .values({ basePrice: 0, buildTimeDays: 1, modelCode: 'PLATE', name: 'Plate product', rangeId: range.id })
      .returning();
    if (!product) throw new Error('Product insert did not return a row');
    const [unit] = await context.db
      .insert(productUnits)
      .values({
        productId: product.id,
        productSerialNumber: 'PLATE-1',
        productSerialPrefix: 'PLATE',
        productSerialSequence: 1,
        productSerialYear: 26,
      })
      .returning();
    if (!unit) throw new Error('Product Unit insert did not return a row');
    const [job] = await context.db
      .insert(jobs)
      .values({ createdAt: new Date('2026-08-02T08:00:00.000Z'), productUnitId: unit.id })
      .returning();
    if (!job) throw new Error('Job insert did not return a row');
    await context.db.insert(jobEstimateSnapshots).values({ jobId: job.id, payload: estimateSnapshot(plate, 0.06) });
    const session = await openStocktakeSession({ actorUserId, db: context.db, input: { scope: 'raw-material' } });
    await postStockCount({
      actorUserId,
      db: context.db,
      input: { buckets: [{ lengthMm: null, observed: 2 }], partId: plate.id, sessionId: session.id },
    });

    const report = await getStocktakeSessionReport({ db: context.db, sessionId: session.id });

    expect(report.counts[0]).toMatchObject({
      estimatedOnHand: { openPlateRemainingPercent: 94, wholeUnits: 2 },
      partCode: 'PLATE',
    });

    await context.db
      .update(jobs)
      .set({ cancelledAt: new Date('2026-08-19T08:00:00.000Z') })
      .where(eq(jobs.id, job.id));
    expect((await getStocktakeSessionReport({ db: context.db, sessionId: session.id })).counts[0]).toMatchObject({
      estimatedOnHand: { openPlateRemainingPercent: 94, wholeUnits: 2 },
    });
  });

  test('compares raw-material depletion with completed Product Jobs and states the undated-Job floor', async ({
    context,
  }) => {
    const [range] = await context.db
      .insert(productRanges)
      .values({ displayOrder: 0, name: 'Stocktake range' })
      .returning();
    if (!range) throw new Error('Product Range insert did not return a row');
    const [product] = await context.db
      .insert(products)
      .values({ basePrice: 0, buildTimeDays: 1, modelCode: 'STOCKTAKE', name: 'Stocktake product', rangeId: range.id })
      .returning();
    if (!product) throw new Error('Product insert did not return a row');
    await context.db
      .insert(productMaterialLines)
      .values({ partId: context.channelId, productId: product.id, quantityPerUnit: 2.5 });
    const units = await context.db
      .insert(productUnits)
      .values(
        [1, 2, 3].map((sequence) => ({
          productId: product.id,
          productSerialNumber: `STOCKTAKE-${sequence}`,
          productSerialPrefix: 'STOCKTAKE',
          productSerialSequence: sequence,
          productSerialYear: 26,
        })),
      )
      .returning();
    const [firstUnit, secondUnit, undatedUnit] = units;
    if (!firstUnit || !secondUnit || !undatedUnit) throw new Error('Product Unit inserts did not return every row');
    const [firstBuild, secondBuild, rework, undatedBuild] = await context.db
      .insert(jobs)
      .values([
        { completedOn: '2026-08-05', productUnitId: firstUnit.id },
        { completedOn: '2026-08-06', productUnitId: secondUnit.id },
        { completedOn: '2026-08-07', productUnitId: firstUnit.id },
        // This Unit consumed material too, but an undated Job cannot be placed in the window.
        { completedOn: null, productUnitId: undatedUnit.id },
      ])
      .returning();
    if (!firstBuild || !secondBuild || !rework || !undatedBuild) throw new Error('Job inserts did not return rows');
    const buildEstimate = await getProductCostEstimate({ db: context.db, productId: product.id });
    const reworkEstimate = await getProductCostEstimate({ db: context.db, productId: product.id, scope: 'rework' });
    await context.db.insert(jobEstimateSnapshots).values([
      { jobId: firstBuild.id, payload: buildEstimate },
      { jobId: secondBuild.id, payload: buildEstimate },
      { jobId: rework.id, payload: reworkEstimate },
    ]);
    await context.db
      .update(productMaterialLines)
      .set({ quantityPerUnit: 99 })
      .where(eq(productMaterialLines.productId, product.id));
    const previousSession = await openStocktakeSession({
      actorUserId,
      db: context.db,
      input: { scope: 'raw-material' },
    });
    await postStockCount({
      actorUserId,
      db: context.db,
      input: {
        buckets: [{ lengthMm: 13_000, observed: 9 }],
        partId: context.channelId,
        sessionId: previousSession.id,
      },
    });
    await closeStocktakeSession({ actorUserId, db: context.db, input: { sessionId: previousSession.id } });
    await context.db
      .update(stocktakeSessions)
      .set({ closedAt: new Date('2026-08-01T10:00:00.000Z'), openedAt: new Date('2026-08-01T08:00:00.000Z') })
      .where(eq(stocktakeSessions.id, previousSession.id));
    const session = await openStocktakeSession({
      actorUserId,
      db: context.db,
      input: { scope: 'raw-material' },
    });
    await postStockCount({
      actorUserId,
      db: context.db,
      input: { buckets: [{ lengthMm: 13_000, observed: 4 }], partId: context.channelId, sessionId: session.id },
    });
    await closeStocktakeSession({ actorUserId, db: context.db, input: { sessionId: session.id } });

    const report = await getStocktakeSessionReport({ db: context.db, sessionId: session.id });

    expect(report.rawMaterialDrift).toMatchObject({
      fromCompletedOnExclusive: '2026-08-01',
      isFloor: true,
      items: [
        {
          actualConsumption: 5,
          driftFromExpectedFloor: 0,
          expectedConsumptionFloor: 5,
          partCode: 'CHANNEL',
        },
      ],
    });
  });

  test('reports every counted Part, its variance, and what was skipped', async ({ context }) => {
    const session = await openStoresSession(context.db);
    await postStockCount({
      actorUserId,
      db: context.db,
      input: { buckets: [{ lengthMm: null, observed: 32 }], partId: context.boltId, sessionId: session.id },
    });
    await closeStocktakeSession({ actorUserId, db: context.db, input: { sessionId: session.id } });

    const detail = await getStocktakeSessionReport({ db: context.db, sessionId: session.id });

    expect(detail.session).toMatchObject({ countedPartCount: 1, scope: 'stores' });
    expect(detail.session.closedAt).not.toBeNull();
    expect(detail.counts).toHaveLength(1);
    expect(detail.counts[0]).toMatchObject({
      buckets: [{ delta: -8, expected: 40, lengthMm: null, observed: 32 }],
      countedByName: 'Stocktake Tester',
      delta: -8,
      partCode: 'BOLT',
      // Eight bolts at the R10 average they were opened at.
      varianceValue: -80,
    });
    expect(detail.totalVarianceValue).toBe(-80);
    // SPARE is in scope and was never walked; CHANNEL is periodic and belongs to the other rhythm.
    expect(await uncountedCodes(context.db, session.id)).toEqual(['SPARE']);
  });

  test('reports a Part counted twice as two rows, each with its own counter', async ({ context }) => {
    const now = new Date('2026-08-01T08:00:00.000Z');
    await context.db.insert(user).values({
      createdAt: now,
      email: 'second-counter@example.com',
      emailVerified: true,
      id: 'stocktake-second-counter',
      name: 'Second Counter',
      role: 'stores',
      updatedAt: now,
    });
    const session = await openStoresSession(context.db);
    await postStockCount({
      actorUserId,
      db: context.db,
      input: { buckets: [{ lengthMm: null, observed: 32 }], partId: context.boltId, sessionId: session.id },
    });
    await postStockCount({
      actorUserId: 'stocktake-second-counter',
      db: context.db,
      input: { buckets: [{ lengthMm: null, observed: 30 }], partId: context.boltId, sessionId: session.id },
    });

    const detail = await getStocktakeSessionReport({ db: context.db, sessionId: session.id });

    // The recount corrects against what the first count left behind rather than doubling it, and
    // neither counter is credited with the other's variance.
    expect(detail.counts).toHaveLength(2);
    expect(detail.counts.map((count) => [count.countedByName, count.delta])).toEqual([
      ['Stocktake Tester', -8],
      ['Second Counter', -2],
    ]);
    expect(detail.session.countedPartCount).toBe(1);
    expect(await stockOnHandOf(context.db, context.boltId)).toBe(30);
  });

  test('leaves the priced total unpriced when a counted Part has no cost yet', async ({ context }) => {
    const session = await openStoresSession(context.db);
    await postStockCount({
      actorUserId,
      db: context.db,
      input: { buckets: [{ lengthMm: null, observed: 3 }], partId: context.spareId, sessionId: session.id },
    });

    const detail = await getStocktakeSessionReport({ db: context.db, sessionId: session.id });
    expect(detail.counts[0]?.varianceValue).toBeNull();
    expect(detail.totalVarianceValue).toBeNull();
  });

  test('pages the uncounted list rather than shipping the whole scope', async ({ context }) => {
    const session = await openStoresSession(context.db);

    const firstPage = await listStocktakeUncounted({
      db: context.db,
      input: { cursor: 0, limit: 1, sessionId: session.id },
    });

    // BOLT and SPARE are both perpetual and neither is counted yet.
    expect(firstPage).toMatchObject({ nextCursor: 1, total: 2 });
    expect(firstPage.items.map((row) => row.partCode)).toEqual(['BOLT']);

    const secondPage = await listStocktakeUncounted({
      db: context.db,
      input: { cursor: 1, limit: 1, sessionId: session.id },
    });
    expect(secondPage.items.map((row) => row.partCode)).toEqual(['SPARE']);
    expect(secondPage.nextCursor).toBeNull();

    // Counting one drops it out of the list and off the total, without the caller naming what it
    // has already covered.
    await postStockCount({
      actorUserId,
      db: context.db,
      input: { buckets: [{ lengthMm: null, observed: 40 }], partId: context.boltId, sessionId: session.id },
    });
    await expect(
      listStocktakeUncounted({ db: context.db, input: { cursor: 0, limit: 10, sessionId: session.id } }),
    ).resolves.toMatchObject({ nextCursor: null, total: 1 });
  });

  test('lists sessions newest first with their counted Part counts', async ({ context }) => {
    const first = await openStoresSession(context.db);
    await postStockCount({
      actorUserId,
      db: context.db,
      input: { buckets: [{ lengthMm: null, observed: 40 }], partId: context.boltId, sessionId: first.id },
    });
    await closeStocktakeSession({ actorUserId, db: context.db, input: { sessionId: first.id } });
    const second = await openStocktakeSession({ actorUserId, db: context.db, input: { scope: 'raw-material' } });

    const list = await listStocktakeSessions({ db: context.db });
    expect(list.items.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(list.items.map((item) => item.countedPartCount)).toEqual([0, 1]);
  });
});

describe('listStocktakeOverdue', () => {
  test('reports both rhythms overdue while neither has ever closed a session', async ({ context }) => {
    const overdue = await listStocktakeOverdue({ clock: () => new Date('2026-09-30T08:00:00.000Z'), db: context.db });

    expect(overdue.items.map((row) => row.scope)).toEqual(['raw-material', 'stores']);
    expect(overdue.items.every((row) => row.isOverdue && row.lastClosedOn === null)).toBe(true);
  });

  test('clears a rhythm the moment its session closes', async ({ context }) => {
    const session = await openStoresSession(context.db);
    await closeStocktakeSession({ actorUserId, db: context.db, input: { sessionId: session.id } });

    const overdue = await listStocktakeOverdue({ db: context.db });
    const stores = overdue.items.find((row) => row.scope === 'stores');

    expect(stores).toMatchObject({ isOverdue: false, overdueDays: 0 });
    expect(stores?.lastClosedOn).not.toBeNull();
  });
});

async function stockOnHandOf(db: Parameters<typeof listStockOnHand>[0]['db'], partId: string): Promise<number> {
  const result = await listStockOnHand({ db });

  return result.items.find((row) => row.partId === partId)?.quantity ?? 0;
}

async function uncountedCodes(db: Parameters<typeof listStocktakeUncounted>[0]['db'], sessionId: string) {
  const result = await listStocktakeUncounted({ db, input: { cursor: 0, limit: 100, sessionId } });

  return result.items.map((row) => row.partCode);
}
