import {
  assemblyOverrides,
  assemblyParts,
  auditEvents,
  customers,
  type Db,
  jobCfoAssemblies,
  jobCfoParts,
  jobStages,
  jobs,
  parts,
  productAssemblies,
  products,
  quoteSelectedAssemblies,
  quotes,
  supplier,
  user,
} from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import { QuoteUpdateInput } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { updateQuote } from '../quotes/quote-service.js';
import { createTester } from '../test/create-tester.js';
import { createJob } from './job-service.js';

const actorUserId = 'test-user-id';
const jobAccess = createUserAccessSummary({ role: 'job-supervisor', userId: actorUserId });

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const catalog = await createCatalog(db);

  return {
    catalog,
    db,
  };
});

describe('createJob', () => {
  test('creates one quote-backed job with CFO rows, stages, audit, and a locked quote', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      selectedAssemblyId: context.catalog.heavyAxle.id,
      status: 'accepted',
    });

    const job = await createJob({
      access: jobAccess,
      actorUserId,
      db: context.db,
      input: { quoteId: quote.id },
    });

    const [jobRows, cfoAssemblyRows, cfoPartRows, stageRows, events] = await Promise.all([
      context.db.select().from(jobs),
      context.db.select().from(jobCfoAssemblies),
      context.db.select().from(jobCfoParts),
      context.db.select().from(jobStages),
      context.db.select().from(auditEvents).where(eq(auditEvents.entityType, 'job')),
    ]);

    expect(job).toMatchObject({
      productId: context.catalog.product.id,
      quoteId: quote.id,
    });
    expect(job.cfo).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assemblyName: 'Standard Chassis',
          kind: 'standard',
          parts: expect.arrayContaining([
            expect.objectContaining({
              partCode: 'PART-CHASSIS',
              partName: 'Chassis Plate',
              quantity: 2,
            }),
          ]),
        }),
        expect.objectContaining({
          assemblyName: 'Heavy Axle Upgrade',
          kind: 'optional',
          parts: expect.arrayContaining([
            expect.objectContaining({
              partCode: 'PART-HEAVY-AXLE',
              partName: 'Heavy Axle',
              quantity: 1,
            }),
          ]),
        }),
      ]),
    );
    expect(jobRows).toHaveLength(1);
    expect(cfoAssemblyRows.map((row) => row.assemblyName)).toEqual(
      expect.arrayContaining(['Standard Chassis', 'Heavy Axle Upgrade']),
    );
    expect(cfoPartRows).toHaveLength(2);
    expect(stageRows).toHaveLength(5);
    expect(events).toMatchObject([
      {
        action: 'created',
        actorUserId,
        entityId: job.id,
        entityType: 'job',
      },
    ]);

    await expect(
      updateQuote({
        actorUserId,
        db: context.db,
        input: QuoteUpdateInput.parse({
          ...quoteUpdateInput(quote),
          discount: 25,
        }),
      }),
    ).rejects.toThrow('Quote is locked because it already has a Job; discount cannot be changed.');
  });

  test('rejects a quote that has not been accepted', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'sent',
    });

    await expect(
      createJob({
        access: jobAccess,
        actorUserId,
        db: context.db,
        input: { quoteId: quote.id },
      }),
    ).rejects.toThrow('Only accepted quotes can start a Job.');
  });

  test('rejects a second job for the same quote', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    await createJob({
      access: jobAccess,
      actorUserId,
      db: context.db,
      input: { quoteId: quote.id },
    });

    await expect(
      createJob({
        access: jobAccess,
        actorUserId,
        db: context.db,
        input: { quoteId: quote.id },
      }),
    ).rejects.toThrow('Quote already has a Job.');
  });

  test('rejects stale selected optional assemblies by name', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      selectedAssemblyId: context.catalog.heavyAxle.id,
      status: 'accepted',
    });

    await context.db.delete(productAssemblies).where(eq(productAssemblies.id, context.catalog.heavyAxle.id));

    await expect(
      createJob({
        access: jobAccess,
        actorUserId,
        db: context.db,
        input: { quoteId: quote.id },
      }),
    ).rejects.toThrow('Selected optional assembly is stale: Heavy Axle Upgrade.');
  });
});

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: actorUserId,
    name: 'Test User',
    role: 'sales',
    updatedAt: now,
  });
}

async function createCatalog(db: Db) {
  const [createdSupplier] = await db
    .insert(supplier)
    .values({
      companyName: 'Parts Supplier',
      email: null,
    })
    .returning();
  if (!createdSupplier) throw new Error('Supplier insert did not return a row');

  const createdParts = await db
    .insert(parts)
    .values([
      partInput(createdSupplier.id, 'PART-CHASSIS', 'Chassis Plate'),
      partInput(createdSupplier.id, 'PART-AXLE', 'Standard Axle'),
      partInput(createdSupplier.id, 'PART-HEAVY-AXLE', 'Heavy Axle'),
    ])
    .returning();

  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      description: null,
      modelCode: 'CFO-001',
      name: 'CFO Test Product',
    })
    .returning();
  if (!product) throw new Error('Product insert did not return a row');

  const [chassis, axle, heavyAxle] = await db
    .insert(productAssemblies)
    .values([
      {
        kind: 'standard',
        name: 'Standard Chassis',
        productId: product.id,
      },
      {
        kind: 'standard',
        name: 'Standard Axle',
        productId: product.id,
      },
      {
        kind: 'optional',
        name: 'Heavy Axle Upgrade',
        price: 250,
        productId: product.id,
      },
    ])
    .returning();
  if (!chassis || !axle || !heavyAxle) throw new Error('Assembly insert did not return every row');

  const [chassisPart, axlePart, heavyAxlePart] = createdParts;
  if (!chassisPart || !axlePart || !heavyAxlePart) throw new Error('Part insert did not return every row');

  await db.insert(assemblyParts).values([
    {
      assemblyId: chassis.id,
      partId: chassisPart.id,
      quantity: 2,
    },
    {
      assemblyId: axle.id,
      partId: axlePart.id,
      quantity: 1,
    },
    {
      assemblyId: heavyAxle.id,
      partId: heavyAxlePart.id,
      quantity: 1,
    },
  ]);
  await db.insert(assemblyOverrides).values({
    optionalAssemblyId: heavyAxle.id,
    productId: product.id,
    standardAssemblyId: axle.id,
  });

  return { heavyAxle, product };
}

function partInput(supplierId: string, code: string, name: string): typeof parts.$inferInsert {
  return {
    category: 'Fabrication',
    code,
    description: name,
    finish: 'Raw',
    name,
    supplierCode: code,
    supplierId,
  };
}

async function createQuote(
  db: Db,
  {
    productId,
    selectedAssemblyId,
    status,
  }: {
    productId: string;
    selectedAssemblyId?: string;
    status: 'accepted' | 'sent';
  },
) {
  const [customer] = await db
    .insert(customers)
    .values({
      companyName: 'CFO Test Customer',
      email: null,
    })
    .returning();
  if (!customer) throw new Error('Customer insert did not return a row');

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      productId,
      quotedBasePrice: 1_000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: actorUserId,
      status,
    })
    .returning();
  if (!quote) throw new Error('Quote insert did not return a row');

  if (selectedAssemblyId) {
    await db.insert(quoteSelectedAssemblies).values({
      productAssemblyId: selectedAssemblyId,
      quoteId: quote.id,
      quotedName: 'Heavy Axle Upgrade',
      quotedPrice: 250,
    });
  }

  return quote;
}

function quoteUpdateInput(quote: typeof quotes.$inferSelect) {
  return {
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    discount: quote.discount,
    id: quote.id,
    notes: quote.notes,
    paymentTerms: quote.paymentTerms,
    plannedDeliveryDate: quote.plannedDeliveryDate,
    preferredDeliveryDate: quote.preferredDeliveryDate,
    salesPersonId: quote.salesPersonId,
    selectedAssemblies: [],
    status: quote.status,
    validUntil: quote.validUntil,
  };
}
