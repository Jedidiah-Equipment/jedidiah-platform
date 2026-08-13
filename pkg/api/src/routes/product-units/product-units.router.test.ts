import {
  customers,
  type Db,
  eq,
  jobs,
  products,
  productUnitOwnershipTransfers,
  productUnits,
  quotes,
  user,
} from '@pkg/db';
import { formatJobCode } from '@pkg/schema';
import { describe, expect } from 'vitest';
import { createActorUser } from '@/test/actor-user.js';
import { createTester } from '@/test/create-tester.js';
import { createProductRangeFixture } from '@/test/product-range-fixtures.js';
import { mockSession } from '@/test/test-utils.js';

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000c1';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db, seed: await seedUnit(db) };
});

describe('productUnits.list', () => {
  test('rejects unauthenticated reads', async ({ context }) => {
    await expect(context.createAnonCaller().productUnits.list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  test('rejects roles without product unit access', async ({ context }) => {
    await expect(context.createCaller(mockSession('bay-operator')).productUnits.list({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  // Sales must reach Units because stock has to be selectable on a Quote.
  test('allows every role granted product unit reads', async ({ context }) => {
    const roles = ['admin', 'super-admin', 'sales', 'procurement-manager', 'job-viewer'] as const;

    for (const role of roles) {
      const result = await context.createCaller(mockSession(role)).productUnits.list({});

      expect(
        result.items.map((item) => item.productSerialNumber),
        `role ${role}`,
      ).toEqual(['RT-001260001']);
    }
  });
});

describe('productUnits.stockExport', () => {
  test('exports On Hand Units to readers holding every gate the row crosses', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    // Completing the Build Job is what makes the machine On Hand, so the report has a row at all.
    await caller.jobs.update({ completedOn: '2026-06-04', id: context.seed.buildJobId });

    await expect(caller.productUnits.stockExport({ columnFilters: {}, search: '' })).resolves.toEqual([
      expect.objectContaining({
        buildCompletedOn: '2026-06-04',
        costExVat: 0,
        customerCompanyName: 'Riverside Farm',
        productRetailExVat: 1_000,
        productRetailIncVat: 1_150,
        productSerialNumber: 'RT-001260001',
      }),
    ]);
  });

  // Every role that reads Units is still refused the valuation: Sales reads Units and Quotes but no
  // costs, procurement reads costs and Units but no Quotes. Neither gets a hollowed-out report.
  test("refuses a Unit reader missing any one of the row's other gates", async ({ context }) => {
    for (const role of ['sales', 'procurement-manager', 'job-viewer'] as const) {
      await expect(
        context.createCaller(mockSession(role)).productUnits.stockExport({ columnFilters: {}, search: '' }),
        `role ${role}`,
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });
});

describe('productUnits.get', () => {
  test('rejects unauthenticated reads', async ({ context }) => {
    await expect(context.createAnonCaller().productUnits.get({ id: context.seed.unitId })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('returns the machine with its ownership history', async ({ context }) => {
    const detail = await context.createCaller(mockSession('sales')).productUnits.get({ id: context.seed.unitId });

    expect(detail).toMatchObject({
      buildState: 'in-build',
      owner: { companyName: 'Riverside Farm' },
      productSerialNumber: 'RT-001260001',
    });
    expect(detail.ownershipHistory).toHaveLength(1);
  });

  test('reports a machine that does not exist as not found', async ({ context }) => {
    await expect(
      context.createCaller(mockSession('admin')).productUnits.get({ id: '00000000-0000-4000-8000-00000000ffff' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('productUnits.update', () => {
  test('captures a VIN against the machine', async ({ context }) => {
    const result = await context
      .createCaller(mockSession('admin'))
      .productUnits.update({ id: context.seed.unitId, vinNumber: 'VIN-123' });

    expect(result.unit).toMatchObject({ productSerialNumber: 'RT-001260001', vinNumber: 'VIN-123' });
  });

  // Reading a Unit is broad — Sales needs stock to be selectable — but asserting what a machine *is*
  // stays with the roles that own its identity.
  test('rejects every role that may read Units but not edit them', async ({ context }) => {
    for (const role of ['sales', 'procurement-manager', 'job-viewer'] as const) {
      await expect(
        context.createCaller(mockSession(role)).productUnits.update({ id: context.seed.unitId, vinNumber: 'VIN-123' }),
        `role ${role}`,
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  test('reports a machine that does not exist as not found', async ({ context }) => {
    await expect(
      context
        .createCaller(mockSession('admin'))
        .productUnits.update({ id: '00000000-0000-4000-8000-00000000ffff', vinNumber: 'VIN-123' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('productUnits.transfer', () => {
  test('records a machine sold on to another customer', async ({ context }) => {
    const result = await context.createCaller(mockSession('admin')).productUnits.transfer({
      id: context.seed.unitId,
      note: 'Sold at auction',
      occurredOn: '2026-06-01',
      toCustomerId: context.seed.hilltopId,
    });

    expect(result.unit.owner).toMatchObject({ companyName: 'Hilltop Transport' });
    expect(result.unit.ownershipHistory).toHaveLength(2);
  });

  test('returns a machine to stock', async ({ context }) => {
    const result = await context
      .createCaller(mockSession('admin'))
      .productUnits.transfer({ id: context.seed.unitId, occurredOn: '2026-06-01', toCustomerId: null });

    expect(result.unit.owner).toBeNull();
  });

  // Asserting who owns a machine with no document behind it needs a narrow set of hands.
  test('rejects every role that may read Units but not transfer them', async ({ context }) => {
    for (const role of ['sales', 'procurement-manager', 'job-viewer'] as const) {
      await expect(
        context
          .createCaller(mockSession(role))
          .productUnits.transfer({ id: context.seed.unitId, occurredOn: '2026-06-01', toCustomerId: null }),
        `role ${role}`,
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  test('rejects unauthenticated transfers', async ({ context }) => {
    await expect(
      context
        .createAnonCaller()
        .productUnits.transfer({ id: context.seed.unitId, occurredOn: '2026-06-01', toCustomerId: null }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  test('reports a transfer that asserts no move as a bad request', async ({ context }) => {
    await expect(
      context.createCaller(mockSession('admin')).productUnits.transfer({
        id: context.seed.unitId,
        occurredOn: '2026-06-01',
        toCustomerId: context.seed.riversideId,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('reports an unknown customer as not found', async ({ context }) => {
    await expect(
      context.createCaller(mockSession('admin')).productUnits.transfer({
        id: context.seed.unitId,
        occurredOn: '2026-06-01',
        toCustomerId: '00000000-0000-4000-8000-00000000fffe',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('productUnits.remove', () => {
  test('deletes a machine whose build was cancelled before it was ever made', async ({ context }) => {
    await abandonSeededBuild(context.db, context.seed);

    await context.createCaller(mockSession('admin')).productUnits.remove({ id: context.seed.unitId });

    await expect(
      context.createCaller(mockSession('admin')).productUnits.get({ id: context.seed.unitId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // Destroying the record of a minted serial is the narrowest action on a Unit, so it stays with admins.
  test('rejects every role that may read Units but not remove them', async ({ context }) => {
    for (const role of ['sales', 'procurement-manager', 'job-viewer'] as const) {
      await expect(
        context.createCaller(mockSession(role)).productUnits.remove({ id: context.seed.unitId }),
        `role ${role}`,
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  test('rejects unauthenticated removals', async ({ context }) => {
    await expect(context.createAnonCaller().productUnits.remove({ id: context.seed.unitId })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('reports a machine that is still real as a conflict, naming the Job that holds it', async ({ context }) => {
    await expect(
      context.createCaller(mockSession('admin')).productUnits.remove({ id: context.seed.unitId }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: `${context.seed.buildJobCode} is still live, so this unit cannot be removed.`,
    });
  });

  // The machine that was made: the refusal must say so rather than describe a build still under way.
  test('reports a finished build as built rather than still live', async ({ context }) => {
    await context.db.update(jobs).set({ completedOn: '2026-07-16' }).where(eq(jobs.id, context.seed.buildJobId));

    await expect(
      context.createCaller(mockSession('admin')).productUnits.remove({ id: context.seed.unitId }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: `Completed ${context.seed.buildJobCode} built this unit, so its record stands.`,
    });
  });
});

/** Turns the seeded machine into one that was never built: its Job cancelled and nobody holding it. */
async function abandonSeededBuild(db: Db, seed: Awaited<ReturnType<typeof seedUnit>>) {
  await db
    .update(jobs)
    .set({ cancelledAt: new Date('2026-05-03T08:00:00.000Z') })
    .where(eq(jobs.productUnitId, seed.unitId));

  await db.insert(productUnitOwnershipTransfers).values({
    actorUserId: ACTOR_USER_ID,
    fromCustomerId: seed.riversideId,
    occurredOn: '2026-05-03',
    productUnitId: seed.unitId,
    toCustomerId: null,
  });
}

async function seedUnit(db: Db) {
  const now = new Date('2026-05-01T08:00:00.000Z');

  await db.insert(user).values({
    createdAt: now,
    email: 'router-units@example.com',
    emailVerified: true,
    id: ACTOR_USER_ID,
    name: 'Router Test User',
    role: 'sales',
    updatedAt: now,
  });

  const [range] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      description: null,
      modelCode: 'RT-001',
      name: 'Router Test Product',
      rangeId: await createProductRangeFixture(db),
    })
    .returning();
  if (!range) throw new Error('Product insert did not return a row');

  const [customer, hilltop] = await db
    .insert(customers)
    .values([
      { companyName: 'Riverside Farm', email: null },
      { companyName: 'Hilltop Transport', email: null },
    ])
    .returning();
  if (!customer || !hilltop) throw new Error('Customer insert did not return a row');

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      productId: range.id,
      quotedBasePrice: 1_000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: ACTOR_USER_ID,
      status: 'accepted',
    })
    .returning();
  if (!quote) throw new Error('Quote insert did not return a row');

  const [unit] = await db
    .insert(productUnits)
    .values({
      productId: range.id,
      productSerialNumber: 'RT-001260001',
      productSerialPrefix: 'RT-001',
      productSerialSequence: 1,
      productSerialYear: 26,
    })
    .returning();
  if (!unit) throw new Error('Product unit insert did not return a row');

  const [job] = await db
    .insert(jobs)
    .values({ createdAt: now, productUnitId: unit.id, quoteId: quote.id, updatedAt: now })
    .returning();
  if (!job) throw new Error('Job insert did not return a row');

  await db.insert(productUnitOwnershipTransfers).values({
    actorUserId: ACTOR_USER_ID,
    occurredOn: '2026-05-02',
    productUnitId: unit.id,
    sourceQuoteId: quote.id,
    toCustomerId: customer.id,
  });

  return {
    buildJobCode: formatJobCode(job.code),
    buildJobId: job.id,
    hilltopId: hilltop.id,
    riversideId: customer.id,
    unitId: unit.id,
  };
}
