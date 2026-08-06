import { customers, eq, jobStockCloseOuts, jobs, parts, quotes, supplier, user } from '@pkg/db';
import { describe, expect } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  const now = new Date('2026-08-01T08:00:00.000Z');
  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'admin',
    updatedAt: now,
  });
  const [createdSupplier] = await db
    .insert(supplier)
    .values({ companyName: 'Inventory Supplier' })
    .returning({ id: supplier.id });

  if (!createdSupplier) {
    throw new Error('Supplier insert did not return a row');
  }

  const [part] = await db
    .insert(parts)
    .values({
      category: 'Bearings',
      code: 'P-100',
      description: 'Main bearing',
      finish: 'None',
      isInternallyFabricated: false,
      name: 'Bearing',
      supplierCode: 'SUP-100',
      supplierId: createdSupplier.id,
      unitOfMeasure: 'piece',
    })
    .returning();

  if (!part) {
    throw new Error('Part insert did not return a row');
  }

  const [customer] = await db.insert(customers).values({ companyName: 'Inventory Customer' }).returning();
  if (!customer) throw new Error('Customer insert did not return a row');
  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      kind: 'custom',
      quotedBasePrice: 0,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
      status: 'accepted',
      workTitle: 'Inventory repair',
    })
    .returning();
  if (!quote) throw new Error('Quote insert did not return a row');
  const [job] = await db.insert(jobs).values({ quoteId: quote.id }).returning();
  if (!job) throw new Error('Job insert did not return a row');

  return { db, job, part };
});

describe('inventory procedure permissions', () => {
  test('enforces read, adjust, and revalue permissions at their procedure boundaries', async ({ context }) => {
    await expect(context.createAnonCaller().inventory.stockOnHand()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(context.createCaller(mockSession('sales')).inventory.stockOnHand()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    await expect(
      context.createCaller(mockSession('stores')).inventory.postAdjustment({
        delta: 10,
        partId: context.part.id,
        reason: 'opening-balance',
        unitCost: 25,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      context.createCaller(mockSession('stores')).inventory.postAdjustment({
        delta: 10,
        partId: context.part.id,
        reason: 'opening-balance',
      }),
    ).resolves.toMatchObject({ actorUserId: 'test-user-id', movementType: 'adjustment', unitCost: null });

    await expect(
      context.createCaller(mockSession('procurement-manager')).inventory.postAdjustment({
        delta: 1,
        partId: context.part.id,
        reason: 'opening-balance',
        unitCost: 25,
      }),
    ).resolves.toMatchObject({ unitCost: 25 });

    await expect(
      context.createCaller(mockSession('stores')).inventory.postRevaluation({
        partId: context.part.id,
        unitCost: 30,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      context.createCaller(mockSession('procurement-manager')).inventory.postRevaluation({
        partId: context.part.id,
        unitCost: 30,
      }),
    ).resolves.toMatchObject({ movementType: 'revaluation', unitCost: 30 });

    await expect(
      context.createCaller(mockSession('sales')).inventory.postCheckout({
        jobId: context.job.id,
        partId: context.part.id,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      context.createCaller(mockSession('stores')).inventory.postCheckout({
        jobId: context.job.id,
        partId: context.part.id,
        quantity: 1,
      }),
    ).resolves.toMatchObject({ movement: { movementType: 'checkout', unitCost: null } });

    await expect(
      context.createCaller(mockSession('stores')).inventory.jobStock({ jobId: context.job.id }),
    ).resolves.toMatchObject({ items: [{ drawnQuantity: 1, partId: context.part.id }] });

    await expect(
      context
        .createCaller(mockSession('stores'))
        .inventory.jobOptions({ movementType: 'checkout', search: String(context.job.code) }),
    ).resolves.toMatchObject({
      items: [{ code: 'JOB-00001', completedOn: null, displayName: 'Inventory repair', id: context.job.id }],
    });

    await expect(
      context
        .createCaller(mockSession('sales'))
        .inventory.jobOptions({ movementType: 'checkout', search: String(context.job.code) }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('offers Jobs according to the stock movement direction and inventory lifecycle', async ({ context }) => {
    const caller = context.createCaller(mockSession('stores'));

    await expect(caller.inventory.jobOptions({ movementType: 'checkout' })).resolves.toMatchObject({
      items: [{ id: context.job.id }],
    });

    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, context.job.id));
    await expect(caller.inventory.jobOptions({ movementType: 'return-to-store' })).resolves.toMatchObject({
      items: [{ id: context.job.id }],
    });

    await context.db
      .update(jobs)
      .set({ cancelledAt: null, completedOn: '2026-08-01' })
      .where(eq(jobs.id, context.job.id));

    await expect(caller.inventory.jobOptions({ movementType: 'checkout' })).resolves.toMatchObject({ items: [] });
    await expect(
      caller.inventory.jobOptions({ movementType: 'checkout', search: String(context.job.code) }),
    ).resolves.toMatchObject({ items: [{ completedOn: '2026-08-01', id: context.job.id }] });

    await context.db
      .insert(jobStockCloseOuts)
      .values({ actorUserId: 'test-user-id', jobId: context.job.id, note: null });

    await expect(
      caller.inventory.jobOptions({ movementType: 'checkout', search: String(context.job.code) }),
    ).resolves.toMatchObject({ items: [] });

    await expect(caller.inventory.jobOptions({ movementType: 'return-to-store' })).resolves.toMatchObject({
      items: [{ id: context.job.id }],
    });
  });

  test('pages the Job options, so a picker can reach the Jobs past its first page', async ({ context }) => {
    const caller = context.createCaller(mockSession('stores'));
    const [customer] = await context.db.select({ id: customers.id }).from(customers);
    if (!customer) throw new Error('Seeded customer is missing');

    const extraQuotes = await context.db
      .insert(quotes)
      .values(
        ['Second repair', 'Third repair'].map((workTitle) => ({
          customerId: customer.id,
          kind: 'custom' as const,
          quotedBasePrice: 0,
          quotedCurrencyCode: 'ZAR',
          salesPersonId: 'test-user-id',
          status: 'accepted' as const,
          workTitle,
        })),
      )
      .returning({ id: quotes.id });

    await context.db.insert(jobs).values(extraQuotes.map((quote) => ({ quoteId: quote.id })));

    const firstPage = await caller.inventory.jobOptions({ cursor: 0, limit: 2, movementType: 'checkout' });
    expect(firstPage).toMatchObject({ nextCursor: 2, total: 3 });

    const secondPage = await caller.inventory.jobOptions({
      cursor: firstPage.nextCursor ?? 0,
      limit: 2,
      movementType: 'checkout',
    });

    expect(secondPage).toMatchObject({ nextCursor: null, total: 3 });
    expect(secondPage.items).toHaveLength(1);
    // The reachable set is every Job, not the first page repeated.
    expect(new Set([...firstPage.items, ...secondPage.items].map((job) => job.id)).size).toBe(3);
  });

  test('uses Job error vocabulary for cancelled checkout while still allowing a return', async ({ context }) => {
    const caller = context.createCaller();
    await caller.inventory.postAdjustment({
      delta: 2,
      partId: context.part.id,
      reason: 'opening-balance',
      unitCost: 25,
    });
    await caller.inventory.postCheckout({ jobId: context.job.id, partId: context.part.id, quantity: 1 });
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, context.job.id));

    await expect(
      caller.inventory.postCheckout({ jobId: context.job.id, partId: context.part.id, quantity: 1 }),
    ).rejects.toMatchObject({ appCode: 'job.cancelled', code: 'BAD_REQUEST' });
    await expect(
      caller.inventory.postReturnToStore({ jobId: context.job.id, partId: context.part.id, quantity: 1 }),
    ).resolves.toMatchObject({ movement: { unitCost: 25 } });
  });
});

describe('close-out queue and close action', () => {
  test('gates both on inventory:close-out and drives the queue from the close', async ({ context }) => {
    const stores = context.createCaller(mockSession('stores'));
    await stores.inventory.postAdjustment({ delta: 4, partId: context.part.id, reason: 'opening-balance' });
    await stores.inventory.postCheckout({ jobId: context.job.id, partId: context.part.id, quantity: 2 });

    await expect(context.createAnonCaller().inventory.closeOutQueue()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      context.createCaller(mockSession('procurement-manager')).inventory.closeOutQueue(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      context.createCaller(mockSession('sales')).inventory.closeOutJob({ jobId: context.job.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // The Job is still open, so it is neither queued nor closeable.
    await expect(stores.inventory.closeOutQueue()).resolves.toEqual({ items: [] });
    await expect(stores.inventory.closeOutJob({ jobId: context.job.id })).rejects.toMatchObject({
      appCode: 'inventory.job_not_completed',
      code: 'BAD_REQUEST',
    });

    await context.db.update(jobs).set({ completedOn: '2026-08-01' }).where(eq(jobs.id, context.job.id));

    await expect(stores.inventory.closeOutQueue()).resolves.toMatchObject({
      items: [{ code: 'JOB-00001', displayName: 'Inventory repair', drawnPartCount: 1, jobId: context.job.id }],
    });

    await expect(
      stores.inventory.closeOutJob({ jobId: context.job.id, note: 'Leftovers returned' }),
    ).resolves.toMatchObject({ actorUserId: 'test-user-id', jobId: context.job.id, note: 'Leftovers returned' });
    await expect(stores.inventory.closeOutQueue()).resolves.toEqual({ items: [] });
    await expect(stores.inventory.closeOutJob({ jobId: context.job.id })).rejects.toMatchObject({
      appCode: 'inventory.job_already_closed_out',
      code: 'BAD_REQUEST',
    });
    await expect(
      stores.inventory.postCheckout({ jobId: context.job.id, partId: context.part.id, quantity: 1 }),
    ).rejects.toMatchObject({ appCode: 'inventory.job_closed_out', code: 'BAD_REQUEST' });
    await expect(
      stores.inventory.postReturnToStore({ jobId: context.job.id, partId: context.part.id, quantity: 1 }),
    ).resolves.toMatchObject({ movement: { movementType: 'return-to-store' } });
    await expect(stores.inventory.jobStock({ jobId: context.job.id })).resolves.toMatchObject({
      job: { code: 'JOB-00001', completedOn: '2026-08-01', displayName: 'Inventory repair' },
    });
  });
});

describe('inventory cost projection', () => {
  test('returns the same SOH procedure with costs visible to a cost-reader and null to stores', async ({ context }) => {
    await context.createCaller().inventory.postAdjustment({
      delta: 10,
      partId: context.part.id,
      reason: 'opening-balance',
      unitCost: 25,
    });

    const procurement = await context.createCaller(mockSession('procurement-manager')).inventory.stockOnHand();
    const stores = await context.createCaller(mockSession('stores')).inventory.stockOnHand();

    expect(procurement.items[0]).toMatchObject({ averageUnitCost: 25, quantity: 10, totalValue: 250 });
    expect(stores.items[0]).toMatchObject({ averageUnitCost: null, quantity: 10, totalValue: null });
  });

  test('cost-gates stored and derived values in transaction history', async ({ context }) => {
    await context.createCaller().inventory.postAdjustment({
      delta: 10,
      partId: context.part.id,
      reason: 'opening-balance',
      unitCost: 25,
    });

    const procurement = await context
      .createCaller(mockSession('procurement-manager'))
      .inventory.history({ partId: context.part.id });
    const stores = await context.createCaller(mockSession('stores')).inventory.history({ partId: context.part.id });

    expect(procurement.items[0]).toMatchObject({ movementValue: 250, unitCost: 25 });
    expect(stores.items[0]).toMatchObject({ movementValue: null, unitCost: null });
  });

  test('cost-gates a revaluation response independently from revaluation authority', async ({ context }) => {
    const revaluerWithoutCostRead = context.createCaller(mockSession('procurement-manager'), {
      access: {
        permissions: ['inventory_cost:revalue'],
        role: 'procurement-manager',
        userId: 'test-user-id',
      },
    });

    await expect(
      revaluerWithoutCostRead.inventory.postRevaluation({ partId: context.part.id, unitCost: 0.104 }),
    ).resolves.toMatchObject({ movementType: 'revaluation', unitCost: null });
  });

  test('serves the Job variance quantities to stores while holding its money column back', async ({ context }) => {
    const admin = context.createCaller();
    await admin.inventory.postAdjustment({
      delta: 10,
      partId: context.part.id,
      reason: 'opening-balance',
      unitCost: 25,
    });
    await admin.inventory.postCheckout({ jobId: context.job.id, partId: context.part.id, quantity: 4 });
    await admin.inventory.postReturnToStore({ jobId: context.job.id, partId: context.part.id, quantity: 1 });

    const procurement = await context
      .createCaller(mockSession('procurement-manager'))
      .inventory.jobVariance({ jobId: context.job.id });
    const stores = await context.createCaller(mockSession('stores')).inventory.jobVariance({ jobId: context.job.id });

    // The fixture Job has no CFO, so every draw on it is off-CFO — unplanned cost, reported apart.
    expect(procurement.items[0]).toMatchObject({ actualCost: 75, drawnQuantity: 3, plannedQuantity: 0 });
    expect(procurement).toMatchObject({ offCfoActualCost: 75, totalActualCost: 75 });
    expect(stores.items[0]).toMatchObject({ actualCost: null, drawnQuantity: 3, varianceQuantity: 3 });
    expect(stores).toMatchObject({ offCfoActualCost: null, totalActualCost: null });

    await expect(
      context.createCaller(mockSession('sales')).inventory.jobVariance({ jobId: context.job.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('cost-gates checkout and return stamps without changing their warnings', async ({ context }) => {
    await context.createCaller().inventory.postAdjustment({
      delta: 2,
      partId: context.part.id,
      reason: 'opening-balance',
      unitCost: 25,
    });

    const admin = await context.createCaller().inventory.postCheckout({
      jobId: context.job.id,
      partId: context.part.id,
      quantity: 1,
    });
    const stores = await context.createCaller(mockSession('stores')).inventory.postReturnToStore({
      jobId: context.job.id,
      partId: context.part.id,
      quantity: 1,
    });

    // The draw is off-CFO on this fixture, so nothing about the plan is exceeded; the price-blind
    // return still reverses at cost.
    expect(admin).toMatchObject({ movement: { unitCost: 25 }, warnings: [] });
    expect(stores).toMatchObject({ movement: { unitCost: null }, warnings: [] });
  });
});

describe('buy list', () => {
  test('serves the shortfall to any inventory reader and refuses everyone else', async ({ context }) => {
    const stores = context.createCaller(mockSession('stores'));
    await stores.inventory.postAdjustment({ delta: 1, partId: context.part.id, reason: 'opening-balance' });
    await stores.inventory.postCheckout({ jobId: context.job.id, partId: context.part.id, quantity: 1 });

    await expect(context.createAnonCaller().inventory.buyList()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(context.createCaller(mockSession('sales')).inventory.buyList()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    // Nothing left on the shelf, and no price anywhere on the row for the gate to hide.
    await expect(stores.inventory.buyList()).resolves.toMatchObject({
      items: [{ partId: context.part.id, quantity: 0, reasons: ['out-of-stock'], suggestedQuantity: 0 }],
    });
  });
});

describe('the stores tablet’s quick-switch', () => {
  /**
   * The invariant spec §11 turns on: the device authorizes, the person attributes. Naming a person
   * who could not have posted this themselves still posts, under their name — and naming one from a
   * session that may not post is still refused, because the assertion never confers anything.
   */
  test('attributes the named person while authorizing off the device session', async ({ context }) => {
    const now = new Date('2026-08-01T08:00:00.000Z');
    await context.db.insert(user).values({
      createdAt: now,
      email: 'stores-person@example.com',
      emailVerified: true,
      id: 'stores-person',
      name: 'Stores Person',
      role: 'stores',
      updatedAt: now,
    });
    const tablet = context.createCaller(mockSession('stores'));
    await tablet.inventory.postAdjustment({ delta: 5, partId: context.part.id, reason: 'opening-balance' });

    await expect(
      tablet.inventory.postCheckout({
        actorUserId: 'stores-person',
        jobId: context.job.id,
        partId: context.part.id,
        quantity: 1,
      }),
    ).resolves.toMatchObject({ movement: { actorUserId: 'stores-person', movementType: 'checkout' } });

    // A session with no right to move stock does not acquire one by naming somebody who has it.
    await expect(
      context.createCaller(mockSession('sales')).inventory.postCheckout({
        actorUserId: 'stores-person',
        jobId: context.job.id,
        partId: context.part.id,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('refuses an unrecognised badge rather than signing the movement as the tablet', async ({ context }) => {
    const tablet = context.createCaller(mockSession('stores'));
    await tablet.inventory.postAdjustment({ delta: 5, partId: context.part.id, reason: 'opening-balance' });

    await expect(
      tablet.inventory.postCheckout({
        actorUserId: 'nobody-at-all',
        jobId: context.job.id,
        partId: context.part.id,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ appCode: 'inventory.actor_not_found', code: 'BAD_REQUEST' });
  });

  test('offers the stores names to a mover and refuses a session that cannot move stock', async ({ context }) => {
    const now = new Date('2026-08-01T08:00:00.000Z');
    await context.db.insert(user).values({
      createdAt: now,
      email: 'stores-person@example.com',
      emailVerified: true,
      id: 'stores-person',
      name: 'Stores Person',
      role: 'stores',
      updatedAt: now,
    });

    await expect(context.createCaller(mockSession('stores')).inventory.quickSwitchActors()).resolves.toEqual({
      items: [{ id: 'stores-person', name: 'Stores Person', thumbnailDataUrl: null }],
    });
    await expect(context.createCaller(mockSession('sales')).inventory.quickSwitchActors()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('scan resolution', () => {
  test('resolves a scanned label to the Part’s stock, price-blind for stores', async ({ context }) => {
    await context.createCaller().inventory.postAdjustment({
      delta: 10,
      partId: context.part.id,
      reason: 'opening-balance',
      unitCost: 25,
    });

    await expect(
      context.createCaller(mockSession('procurement-manager')).inventory.partByCode({ code: 'P-100' }),
    ).resolves.toMatchObject({ averageUnitCost: 25, partCode: 'P-100', quantity: 10, totalValue: 250 });

    const stores = await context.createCaller(mockSession('stores')).inventory.partByCode({ code: 'P-100' });
    expect(stores).toMatchObject({ averageUnitCost: null, partCode: 'P-100', quantity: 10, totalValue: null });
    expect(stores.buckets).toEqual([{ lengthMm: null, quantity: 10, totalValue: null }]);
  });

  test('reports an unknown label as a not-found rather than an empty result', async ({ context }) => {
    await expect(
      context.createCaller(mockSession('stores')).inventory.partByCode({ code: 'NOT-A-PART' }),
    ).rejects.toMatchObject({ appCode: 'inventory.part_code_not_found', code: 'NOT_FOUND' });
  });
});

describe('shared devices at the boundary', () => {
  /**
   * "No person, no movements" as a server rule, not a disabled button. The tablet signs in as a
   * device; until it names somebody, the ledger refuses the row outright.
   */
  test('refuses a movement from a device session that named nobody', async ({ context }) => {
    await context.db.update(user).set({ isDevice: true }).where(eq(user.id, 'test-user-id'));
    const tablet = context.createCaller(mockSession('stores'));

    await expect(
      tablet.inventory.postCheckout({ jobId: context.job.id, partId: context.part.id, quantity: 1 }),
    ).rejects.toMatchObject({ appCode: 'inventory.actor_required', code: 'BAD_REQUEST' });
  });

  /**
   * The `stores` role holds `adjust` and `build` as well as `move`, so the rule has to cover them —
   * an unattributed adjustment is exactly as much a lie about who touched the stock as a draw.
   */
  test('refuses every movement type a device can reach, not only the Job draws', async ({ context }) => {
    await context.db.update(user).set({ isDevice: true }).where(eq(user.id, 'test-user-id'));
    const tablet = context.createCaller(mockSession('stores'));

    await expect(
      tablet.inventory.postAdjustment({ delta: 5, partId: context.part.id, reason: 'opening-balance' }),
    ).rejects.toMatchObject({ appCode: 'inventory.actor_required', code: 'BAD_REQUEST' });

    await expect(
      tablet.inventory.postBuild({ builtPartId: context.part.id, consumption: [], quantity: 1 }),
    ).rejects.toMatchObject({ appCode: 'inventory.actor_required', code: 'BAD_REQUEST' });
  });

  test('refuses a device named as the actor, and leaves it out of the quick-switch', async ({ context }) => {
    const now = new Date('2026-08-01T08:00:00.000Z');
    await context.db.insert(user).values({
      createdAt: now,
      email: 'tablet@example.com',
      emailVerified: true,
      id: 'stores-tablet',
      isDevice: true,
      name: 'Stores Tablet',
      role: 'stores',
      updatedAt: now,
    });
    const stores = context.createCaller(mockSession('stores'));
    await stores.inventory.postAdjustment({ delta: 5, partId: context.part.id, reason: 'opening-balance' });

    await expect(
      stores.inventory.postCheckout({
        actorUserId: 'stores-tablet',
        jobId: context.job.id,
        partId: context.part.id,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ appCode: 'inventory.actor_is_device', code: 'BAD_REQUEST' });

    await expect(stores.inventory.quickSwitchActors()).resolves.toEqual({ items: [] });
  });
});

describe('stocktake procedures', () => {
  test('splits the walk from the report at the permission boundary', async ({ context }) => {
    const stores = context.createCaller(mockSession('stores'));
    const procurement = context.createCaller(mockSession('procurement-manager'));

    // Procurement reads the rhythms and their variance without ever walking a shelf.
    await expect(procurement.inventory.stocktakeSessions()).resolves.toEqual({ items: [] });
    await expect(procurement.inventory.stocktakeOverdue()).resolves.toMatchObject({
      items: [
        { isOverdue: true, scope: 'raw-material' },
        { isOverdue: true, scope: 'stores' },
      ],
    });
    await expect(procurement.inventory.openStocktakeSession({ scope: 'stores' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(context.createCaller(mockSession('sales')).inventory.stocktakeSessions()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    const session = await stores.inventory.openStocktakeSession({ scope: 'stores' });
    expect(session).toMatchObject({ closedAt: null, countedPartCount: 0, scope: 'stores' });

    await expect(stores.inventory.openStocktakeSession({ scope: 'stores' })).rejects.toMatchObject({
      appCode: 'inventory.stocktake_session_already_open',
      code: 'BAD_REQUEST',
    });
  });

  test('posts a count and strips the variance price from a caller who may not read costs', async ({ context }) => {
    const stores = context.createCaller(mockSession('stores'));
    await context
      .createCaller()
      .inventory.postAdjustment({ delta: 40, partId: context.part.id, reason: 'opening-balance', unitCost: 10 });

    const session = await stores.inventory.openStocktakeSession({ scope: 'stores' });
    await expect(
      stores.inventory.postStockCount({ buckets: [{ observed: 32 }], partId: context.part.id, sessionId: session.id }),
    ).resolves.toMatchObject({ buckets: [{ delta: -8, expected: 40, observed: 32 }] });

    await expect(stores.inventory.stocktakeSessionReport({ sessionId: session.id })).resolves.toMatchObject({
      counts: [{ delta: -8, partId: context.part.id, varianceValue: null }],
      totalVarianceValue: null,
    });
    await expect(
      context
        .createCaller(mockSession('procurement-manager'))
        .inventory.stocktakeSessionReport({ sessionId: session.id }),
    ).resolves.toMatchObject({ counts: [{ varianceValue: -80 }], totalVarianceValue: -80 });

    // The tablet's two reads: the cheap header, and the walk's remaining work a page at a time.
    await expect(stores.inventory.stocktakeSession({ sessionId: session.id })).resolves.toMatchObject({
      countedPartCount: 1,
      scope: 'stores',
    });
    await expect(stores.inventory.stocktakeUncounted({ limit: 10, sessionId: session.id })).resolves.toMatchObject({
      items: [],
      nextCursor: null,
      total: 0,
    });

    await expect(stores.inventory.closeStocktakeSession({ sessionId: session.id })).resolves.toMatchObject({
      countedPartCount: 1,
    });
    await expect(stores.inventory.stocktakeOverdue()).resolves.toMatchObject({
      items: [{ scope: 'raw-material' }, { isOverdue: false, scope: 'stores' }],
    });
  });

  test('refuses a count from a shared device that has named nobody', async ({ context }) => {
    await context.db.update(user).set({ isDevice: true }).where(eq(user.id, 'test-user-id'));
    const tablet = context.createCaller(mockSession('stores'));

    await expect(tablet.inventory.openStocktakeSession({ scope: 'stores' })).rejects.toMatchObject({
      appCode: 'inventory.actor_required',
      code: 'BAD_REQUEST',
    });
  });
});
