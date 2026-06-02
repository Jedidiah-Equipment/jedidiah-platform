import {
  assemblyOverrides,
  assemblyParts,
  auditEvents,
  customers,
  type Db,
  documents,
  jobCfoAssemblies,
  jobCfoParts,
  jobStages,
  jobs,
  parts,
  productAssemblies,
  productSerialSequences,
  products,
  quoteSelectedAssemblies,
  quotes,
  supplier,
  user,
} from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import { type PartUnitOfMeasure, QuoteUpdateInput } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { deleteProductDocument } from '../products/product-service.js';
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
      currentDate: new Date('2026-06-01T10:00:00.000+02:00'),
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
      productSerialNumber: 'CFO-001260001',
      productSerialPrefix: 'CFO-001',
      productSerialSequence: 1,
      productSerialYear: 26,
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
              quantity: 6000,
              unitOfMeasure: 'mm',
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
              unitOfMeasure: 'quantity',
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
          discountAmount: 25,
        }),
      }),
    ).rejects.toThrow('Quote is locked because it already has a Job; discountAmount cannot be changed.');
  });

  test('snapshots product documents onto the job as frozen rows with product provenance', async ({ context }) => {
    const sourceDocuments = await createProductDocuments(context.db, context.catalog.product.id, [
      {
        filename: 'Part Book.pdf',
        storageKey: 'documents/product/source/part-book.pdf',
      },
      {
        filename: 'SOP.pdf',
        storageKey: 'documents/product/source/sop.pdf',
      },
    ]);
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    const job = await createJob({
      access: jobAccess,
      actorUserId,
      db: context.db,
      input: { quoteId: quote.id },
    });

    const snapshotRows = await context.db.select().from(documents).where(eq(documents.jobId, job.id));

    expect(snapshotRows).toHaveLength(2);
    expect(snapshotRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: 'Part Book.pdf',
          jobId: job.id,
          ownerType: 'job',
          productId: null,
          sourceProductId: context.catalog.product.id,
          storageKey: sourceDocuments[0]?.storageKey,
        }),
        expect.objectContaining({
          filename: 'SOP.pdf',
          jobId: job.id,
          ownerType: 'job',
          productId: null,
          sourceProductId: context.catalog.product.id,
          storageKey: sourceDocuments[1]?.storageKey,
        }),
      ]),
    );
    expect(job.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: 'Part Book.pdf',
          ownerType: 'job',
          sourceProductId: context.catalog.product.id,
          sourceProductName: 'CFO Test Product',
        }),
        expect.objectContaining({
          filename: 'SOP.pdf',
          ownerType: 'job',
          sourceProductId: context.catalog.product.id,
          sourceProductName: 'CFO Test Product',
        }),
      ]),
    );
  });

  test('keeps the job document snapshot when product documents are later deleted or replaced', async ({ context }) => {
    const [sourceDocument] = await createProductDocuments(context.db, context.catalog.product.id, [
      {
        filename: 'Part Book.pdf',
        storageKey: 'documents/product/source/part-book.pdf',
      },
    ]);
    if (!sourceDocument) throw new Error('Document insert did not return a row');
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });
    const job = await createJob({
      access: jobAccess,
      actorUserId,
      db: context.db,
      input: { quoteId: quote.id },
    });

    await deleteProductDocument({
      actorUserId,
      db: context.db,
      documentId: sourceDocument.id,
      productId: context.catalog.product.id,
    });
    await createProductDocuments(context.db, context.catalog.product.id, [
      {
        filename: 'Part Book.pdf',
        storageKey: 'documents/product/source/replacement-part-book.pdf',
      },
    ]);

    const snapshotRows = await context.db.select().from(documents).where(eq(documents.jobId, job.id));
    const liveProductRows = await context.db
      .select()
      .from(documents)
      .where(eq(documents.productId, context.catalog.product.id));

    expect(snapshotRows).toEqual([
      expect.objectContaining({
        filename: 'Part Book.pdf',
        ownerType: 'job',
        storageKey: 'documents/product/source/part-book.pdf',
      }),
    ]);
    expect(liveProductRows).toEqual([
      expect.objectContaining({
        filename: 'Part Book.pdf',
        ownerType: 'product',
        storageKey: 'documents/product/source/replacement-part-book.pdf',
      }),
    ]);
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

  test('allocates product serial sequences per product', async ({ context }) => {
    const firstQuote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });
    const secondQuote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });
    const otherProduct = await createProduct(context.db, {
      modelCode: 'ALT-001',
      name: 'Alternate Product',
    });
    const otherProductQuote = await createQuote(context.db, {
      productId: otherProduct.id,
      status: 'accepted',
    });

    const firstJob = await createJob({
      access: jobAccess,
      actorUserId,
      currentDate: new Date('2026-06-01T10:00:00.000+02:00'),
      db: context.db,
      input: { quoteId: firstQuote.id },
    });
    const secondJob = await createJob({
      access: jobAccess,
      actorUserId,
      currentDate: new Date('2026-06-02T10:00:00.000+02:00'),
      db: context.db,
      input: { quoteId: secondQuote.id },
    });
    const otherProductJob = await createJob({
      access: jobAccess,
      actorUserId,
      currentDate: new Date('2026-06-03T10:00:00.000+02:00'),
      db: context.db,
      input: { quoteId: otherProductQuote.id },
    });

    expect(firstJob.productSerialNumber).toBe('CFO-001260001');
    expect(secondJob.productSerialNumber).toBe('CFO-001260002');
    expect(otherProductJob.productSerialNumber).toBe('ALT-001260001');
  });

  test('continues product serial sequences across years', async ({ context }) => {
    await context.db.insert(productSerialSequences).values({
      lastSequence: 8,
      productId: context.catalog.product.id,
    });
    const firstQuote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });
    const secondQuote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    const firstJob = await createJob({
      access: jobAccess,
      actorUserId,
      currentDate: new Date('2026-12-31T23:30:00.000+02:00'),
      db: context.db,
      input: { quoteId: firstQuote.id },
    });
    const secondJob = await createJob({
      access: jobAccess,
      actorUserId,
      currentDate: new Date('2027-01-01T00:30:00.000+02:00'),
      db: context.db,
      input: { quoteId: secondQuote.id },
    });

    expect(firstJob.productSerialNumber).toBe('CFO-001260009');
    expect(secondJob.productSerialNumber).toBe('CFO-001270010');
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
      partInput(createdSupplier.id, 'PART-CHASSIS', 'Chassis Plate', 'mm'),
      partInput(createdSupplier.id, 'PART-AXLE', 'Standard Axle'),
      partInput(createdSupplier.id, 'PART-HEAVY-AXLE', 'Heavy Axle'),
    ])
    .returning();

  const product = await createProduct(db, {
    modelCode: 'CFO-001',
    name: 'CFO Test Product',
  });

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
      quantity: 6000,
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

async function createProduct(db: Db, { modelCode, name }: { modelCode: string; name: string }) {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      description: null,
      modelCode,
      name,
    })
    .returning();

  if (!product) throw new Error('Product insert did not return a row');

  return product;
}

async function createProductDocuments(db: Db, productId: string, inputs: { filename: string; storageKey: string }[]) {
  return db
    .insert(documents)
    .values(
      inputs.map((input) => ({
        byteSize: 8,
        contentType: 'application/pdf',
        filename: input.filename,
        ownerType: 'product' as const,
        productId,
        storageKey: input.storageKey,
        uploaderUserId: actorUserId,
      })),
    )
    .returning();
}

function partInput(
  supplierId: string,
  code: string,
  name: string,
  unitOfMeasure: PartUnitOfMeasure = 'quantity',
): typeof parts.$inferInsert {
  return {
    category: 'Fabrication',
    code,
    description: name,
    finish: 'Raw',
    name,
    supplierCode: code,
    supplierId,
    unitOfMeasure,
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
    depositPercent: quote.depositPercent,
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    discountAmount: quote.discountAmount,
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
