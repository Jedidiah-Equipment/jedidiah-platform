import {
  assemblyOverrides,
  assemblyParts,
  auditEvents,
  customers,
  type Db,
  documents,
  jobBayCalendarExceptions,
  jobBays,
  jobCfoAssemblies,
  jobCfoParts,
  jobSlots,
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
  workingCalendarOffDays,
} from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import {
  AddBayCalendarExceptionInput,
  type Department,
  type JobDetail,
  type JobStageName,
  type PartUnitOfMeasure,
  type ProductDocumentType,
  QuoteUpdateInput,
  RemoveBayCalendarExceptionInput,
  ToggleOffDayInput,
} from '@pkg/schema';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { deleteProductDocument } from '../products/product-service.js';
import { updateQuote } from '../quotes/quote-service.js';
import { createTester } from '../test/create-tester.js';
import { getJob, listBays } from './job-read-service.js';
import {
  addBayCalendarException,
  addIdleJobSlot,
  bookJobSlot,
  createJob,
  removeBayCalendarException,
  removeJobSlot,
  resizeJobSlot,
  toggleOffDay,
} from './job-service.js';

const actorUserId = 'test-user-id';
const calendarAccess = createUserAccessSummary({ role: 'admin', userId: actorUserId });
const jobAccess = createUserAccessSummary({ role: 'admin', userId: actorUserId });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-05T09:00:00.000+02:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

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

  test('freezes CFO sequence by display order, ignoring name and selection order', async ({ context }) => {
    const product = await createProduct(context.db, { modelCode: 'ORD-001', name: 'Ordering Product' });

    // Display order deliberately contradicts alphabetical name order in both kind groups.
    const [bStandard, aStandard, bOptional, aOptional] = await context.db
      .insert(productAssemblies)
      .values([
        { displayOrder: 0, kind: 'standard', name: 'B Standard', productId: product.id },
        { displayOrder: 1, kind: 'standard', name: 'A Standard', productId: product.id },
        { displayOrder: 0, kind: 'optional', name: 'B Optional', price: 100, productId: product.id },
        { displayOrder: 1, kind: 'optional', name: 'A Optional', price: 100, productId: product.id },
      ])
      .returning();
    if (!bStandard || !aStandard || !bOptional || !aOptional) {
      throw new Error('Assembly insert did not return every row');
    }

    const [customer] = await context.db
      .insert(customers)
      .values({ companyName: 'Ordering Customer', email: null })
      .returning();
    if (!customer) throw new Error('Customer insert did not return a row');

    const [quote] = await context.db
      .insert(quotes)
      .values({
        customerId: customer.id,
        productId: product.id,
        quotedBasePrice: 1_000,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: actorUserId,
        status: 'accepted',
      })
      .returning();
    if (!quote) throw new Error('Quote insert did not return a row');

    // Select optionals in reverse display order, with createdAt also opposite, so only the
    // display order can produce the expected CFO order.
    await context.db.insert(quoteSelectedAssemblies).values([
      {
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        productAssemblyId: aOptional.id,
        quoteId: quote.id,
        quotedName: 'A Optional',
        quotedPrice: 100,
      },
      {
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        productAssemblyId: bOptional.id,
        quoteId: quote.id,
        quotedName: 'B Optional',
        quotedPrice: 100,
      },
    ]);

    const job = await createJob({
      access: jobAccess,
      actorUserId,
      db: context.db,
      input: { quoteId: quote.id },
    });

    expect(job.cfo.map((entry) => entry.assemblyName)).toEqual([
      'B Standard',
      'A Standard',
      'B Optional',
      'A Optional',
    ]);

    const cfoRows = await context.db
      .select({
        assemblyName: jobCfoAssemblies.assemblyName,
        kind: jobCfoAssemblies.kind,
        sequence: jobCfoAssemblies.sequence,
      })
      .from(jobCfoAssemblies)
      .where(eq(jobCfoAssemblies.jobId, job.id));
    expect(cfoRows).toEqual(
      expect.arrayContaining([
        { assemblyName: 'B Standard', kind: 'standard', sequence: 0 },
        { assemblyName: 'A Standard', kind: 'standard', sequence: 1 },
        { assemblyName: 'B Optional', kind: 'optional', sequence: 0 },
        { assemblyName: 'A Optional', kind: 'optional', sequence: 1 },
      ]),
    );

    // Reordering the source product afterward must not reshuffle the frozen CFO.
    await context.db.update(productAssemblies).set({ displayOrder: 1 }).where(eq(productAssemblies.id, bOptional.id));
    await context.db.update(productAssemblies).set({ displayOrder: 0 }).where(eq(productAssemblies.id, aOptional.id));

    const reread = await getJob({ access: jobAccess, db: context.db, id: job.id });
    expect(reread.cfo.map((entry) => entry.assemblyName)).toEqual([
      'B Standard',
      'A Standard',
      'B Optional',
      'A Optional',
    ]);
  });

  test('snapshots product documents onto the job as frozen rows with product provenance', async ({ context }) => {
    const sourceDocuments = await createProductDocuments(context.db, context.catalog.product.id, [
      {
        filename: 'Part Book.pdf',
        storageKey: 'documents/product/source/part-book.pdf',
        type: 'part_book',
      },
      {
        filename: 'SOP.pdf',
        storageKey: 'documents/product/source/sop.pdf',
        type: 'sop',
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
          metadata: { type: 'part_book' },
          ownerType: 'job',
          productId: null,
          sourceProductId: context.catalog.product.id,
          storageKey: sourceDocuments[0]?.storageKey,
        }),
        expect.objectContaining({
          filename: 'SOP.pdf',
          jobId: job.id,
          metadata: { type: 'sop' },
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
          metadata: { type: 'part_book' },
          ownerType: 'job',
          sourceProductId: context.catalog.product.id,
          sourceProductName: 'CFO Test Product',
        }),
        expect.objectContaining({
          filename: 'SOP.pdf',
          metadata: { type: 'sop' },
          ownerType: 'job',
          sourceProductId: context.catalog.product.id,
          sourceProductName: 'CFO Test Product',
        }),
      ]),
    );
  });

  test('keeps the job document snapshot frozen when a product document is re-classified', async ({ context }) => {
    const [sourceDocument] = await createProductDocuments(context.db, context.catalog.product.id, [
      {
        filename: 'Part Book.pdf',
        storageKey: 'documents/product/source/part-book.pdf',
        type: 'part_book',
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

    // Re-classify the Product Document: delete + re-upload the same filename with a different type.
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
        type: 'brochure',
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
        metadata: { type: 'part_book' },
        ownerType: 'job',
        storageKey: 'documents/product/source/part-book.pdf',
      }),
    ]);
    expect(liveProductRows).toEqual([
      expect.objectContaining({
        filename: 'Part Book.pdf',
        metadata: { type: 'brochure' },
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

describe('toggleOffDay', () => {
  test('inserts, updates, and removes org Off-Days for calendar editors', async ({ context }) => {
    await expect(
      toggleOffDay({
        access: calendarAccess,
        db: context.db,
        input: offDayInput({ date: '2026-06-16', isOffDay: true, label: '  Youth Day  ' }),
      }),
    ).resolves.toEqual({
      offDay: {
        date: '2026-06-16',
        label: 'Youth Day',
      },
    });
    await expect(
      toggleOffDay({
        access: calendarAccess,
        db: context.db,
        input: offDayInput({ date: '2026-06-16', isOffDay: true, label: null }),
      }),
    ).resolves.toEqual({
      offDay: {
        date: '2026-06-16',
        label: null,
      },
    });
    await expect(
      toggleOffDay({
        access: calendarAccess,
        db: context.db,
        input: offDayInput({ date: '2026-06-16', isOffDay: false, label: null }),
      }),
    ).resolves.toEqual({ offDay: null });

    const rows = await context.db.select().from(workingCalendarOffDays);
    expect(rows).toEqual([]);
  });

  test('denies users without the Job calendar permission', async ({ context }) => {
    await expect(
      toggleOffDay({
        access: createUserAccessSummary({ role: 'sales', userId: 'sales-user' }),
        db: context.db,
        input: offDayInput({ date: '2026-06-16', isOffDay: true, label: null }),
      }),
    ).rejects.toThrow('You do not have permission to manage the Job calendar.');
  });

  test('returns Off-Day facts and reflows Bay projections', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: new Date('2026-06-05T08:00:00.000Z'),
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    await toggleOffDay({
      access: calendarAccess,
      db: context.db,
      input: offDayInput({ date: '2026-06-06', isOffDay: true, label: 'Shutdown' }),
    });

    const firstSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(firstJob, 'fabrication') },
    });
    const secondSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(secondJob, 'fabrication') },
    });

    const schedule = await listBays({ access: jobAccess, db: context.db });
    expect(schedule.offDays).toEqual([{ date: '2026-06-06', label: 'Shutdown' }]);
    expect(getBaySchedule(schedule, bay.id)).toEqual(
      expect.objectContaining({
        slots: [
          expect.objectContaining({
            id: firstSlot.slot.id,
            startAt: '2026-06-04T22:00:00.000Z',
            endAt: '2026-06-05T22:00:00.000Z',
          }),
          expect.objectContaining({
            id: secondSlot.slot.id,
            startAt: '2026-06-05T22:00:00.000Z',
            endAt: '2026-06-07T22:00:00.000Z',
          }),
        ],
      }),
    );
  });
});

describe('Bay calendar exceptions', () => {
  test('inserts, updates, and removes Bay exceptions for authorized schedulers', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });

    await expect(
      addBayCalendarException({
        access: jobAccess,
        db: context.db,
        input: bayExceptionInput({
          bayId: bay.id,
          date: '2026-06-06',
          direction: 'work',
          label: '  Saturday push  ',
        }),
      }),
    ).resolves.toEqual({
      exception: {
        bayId: bay.id,
        date: '2026-06-06',
        direction: 'work',
        label: 'Saturday push',
      },
    });
    await expect(
      addBayCalendarException({
        access: jobAccess,
        db: context.db,
        input: bayExceptionInput({
          bayId: bay.id,
          date: '2026-06-06',
          direction: 'off',
          label: null,
        }),
      }),
    ).resolves.toEqual({
      exception: {
        bayId: bay.id,
        date: '2026-06-06',
        direction: 'off',
        label: null,
      },
    });
    await expect(
      removeBayCalendarException({
        access: jobAccess,
        db: context.db,
        input: removeBayExceptionInput({ bayId: bay.id, date: '2026-06-06' }),
      }),
    ).resolves.toEqual({
      exception: {
        bayId: bay.id,
        date: '2026-06-06',
        direction: 'off',
        label: null,
      },
    });
    await expect(
      removeBayCalendarException({
        access: jobAccess,
        db: context.db,
        input: removeBayExceptionInput({ bayId: bay.id, date: '2026-06-06' }),
      }),
    ).resolves.toEqual({ exception: null });

    const rows = await context.db.select().from(jobBayCalendarExceptions);
    expect(rows).toEqual([]);
  });

  test('rejects missing Bays and unauthorized schedulers', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });

    await expect(
      addBayCalendarException({
        access: jobAccess,
        db: context.db,
        input: bayExceptionInput({
          bayId: '00000000-0000-4000-8000-00000000dead',
          date: '2026-06-06',
          direction: 'work',
          label: null,
        }),
      }),
    ).rejects.toThrow('Job bay not found');
    await expect(
      addBayCalendarException({
        access: createUserAccessSummary({ role: 'sales', userId: 'sales-user' }),
        db: context.db,
        input: bayExceptionInput({ bayId: bay.id, date: '2026-06-06', direction: 'work', label: null }),
      }),
    ).rejects.toThrow('You do not have permission to manage this Bay calendar.');
    await expect(
      addBayCalendarException({
        access: createUserAccessSummary({
          departments: ['paint'],
          role: 'job-department-manager',
          userId: 'paint-manager',
        }),
        db: context.db,
        input: bayExceptionInput({ bayId: bay.id, date: '2026-06-06', direction: 'work', label: null }),
      }),
    ).rejects.toThrow('You do not have permission to manage this Bay calendar.');
  });

  test('opens an org Off-Day for one Bay only and reflows back after removal', async ({ context }) => {
    const firstBay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: new Date('2026-06-05T08:00:00.000Z'),
    });
    const secondBay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: new Date('2026-06-05T08:00:00.000Z'),
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    await toggleOffDay({
      access: calendarAccess,
      db: context.db,
      input: offDayInput({ date: '2026-06-06', isOffDay: true, label: 'Shutdown' }),
    });
    await addBayCalendarException({
      access: jobAccess,
      db: context.db,
      input: bayExceptionInput({ bayId: firstBay.id, date: '2026-06-06', direction: 'work', label: 'Overtime' }),
    });

    await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: firstBay.id, durationDays: 2, jobStageId: getStageId(firstJob, 'fabrication') },
    });
    await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: secondBay.id, durationDays: 2, jobStageId: getStageId(secondJob, 'fabrication') },
    });

    let schedule = await listBays({ access: jobAccess, db: context.db });
    expect(getBaySchedule(schedule, firstBay.id)).toEqual(
      expect.objectContaining({
        calendarExceptions: [{ bayId: firstBay.id, date: '2026-06-06', direction: 'work', label: 'Overtime' }],
        nextAvailableAt: '2026-06-06T22:00:00.000Z',
      }),
    );
    expect(getBaySchedule(schedule, secondBay.id)).toEqual(
      expect.objectContaining({
        calendarExceptions: [],
        nextAvailableAt: '2026-06-07T22:00:00.000Z',
      }),
    );

    await removeBayCalendarException({
      access: jobAccess,
      db: context.db,
      input: removeBayExceptionInput({ bayId: firstBay.id, date: '2026-06-06' }),
    });

    schedule = await listBays({ access: jobAccess, db: context.db });
    expect(getBaySchedule(schedule, firstBay.id)).toEqual(
      expect.objectContaining({
        calendarExceptions: [],
        nextAvailableAt: '2026-06-07T22:00:00.000Z',
      }),
    );
  });

  test('closes an otherwise-working day for one Bay only', async ({ context }) => {
    const firstBay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: new Date('2026-06-05T08:00:00.000Z'),
    });
    const secondBay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: new Date('2026-06-05T08:00:00.000Z'),
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);

    await addBayCalendarException({
      access: jobAccess,
      db: context.db,
      input: bayExceptionInput({ bayId: firstBay.id, date: '2026-06-06', direction: 'off', label: 'Maintenance' }),
    });
    await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: firstBay.id, durationDays: 2, jobStageId: getStageId(firstJob, 'fabrication') },
    });
    await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: secondBay.id, durationDays: 2, jobStageId: getStageId(secondJob, 'fabrication') },
    });

    const schedule = await listBays({ access: jobAccess, db: context.db });
    expect(getBaySchedule(schedule, firstBay.id)).toEqual(
      expect.objectContaining({
        nextAvailableAt: '2026-06-07T22:00:00.000Z',
      }),
    );
    expect(getBaySchedule(schedule, secondBay.id)).toEqual(
      expect.objectContaining({
        nextAvailableAt: '2026-06-06T22:00:00.000Z',
      }),
    );
  });
});

describe('bookJobSlot', () => {
  test('appends slots to the back of a bay queue and returns projected dates', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: new Date('2026-06-05T08:00:00.000Z'),
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);

    const firstSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: {
        bayId: bay.id,
        durationDays: 1,
        jobStageId: getStageId(firstJob, 'fabrication'),
      },
    });
    const secondSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: {
        bayId: bay.id,
        durationDays: 2,
        jobStageId: getStageId(secondJob, 'fabrication'),
      },
    });

    const storedSlots = await context.db
      .select({
        durationDays: jobSlots.durationDays,
        id: jobSlots.id,
        sequence: jobSlots.sequence,
      })
      .from(jobSlots)
      .orderBy(asc(jobSlots.sequence));
    expect(storedSlots).toEqual([
      { id: firstSlot.slot.id, sequence: 1, durationDays: 1 },
      { id: secondSlot.slot.id, sequence: 2, durationDays: 2 },
    ]);

    const schedule = await listBays({ access: jobAccess, db: context.db });
    expect(getBaySchedule(schedule, bay.id)).toEqual(
      expect.objectContaining({
        nextAvailableAt: '2026-06-07T22:00:00.000Z',
        slots: [
          expect.objectContaining({
            id: firstSlot.slot.id,
            jobCode: firstJob.code,
            sequence: 1,
            startAt: '2026-06-04T22:00:00.000Z',
            endAt: '2026-06-05T22:00:00.000Z',
          }),
          expect.objectContaining({
            id: secondSlot.slot.id,
            jobCode: secondJob.code,
            sequence: 2,
            startAt: '2026-06-05T22:00:00.000Z',
            endAt: '2026-06-07T22:00:00.000Z',
          }),
        ],
      }),
    );
  });

  test('allows the same job stage to be booked more than once', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const jobStageId = getStageId(job, 'fabrication');

    await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId },
    });
    await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId },
    });

    const schedule = await listBays({ access: jobAccess, db: context.db });
    expect(getBaySchedule(schedule, bay.id).slots.map((slot) => slot.jobStageId)).toEqual([jobStageId, jobStageId]);
  });

  test('rejects a bay whose department does not match the job stage', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'paint' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);

    await expect(
      bookJobSlot({
        access: jobAccess,
        db: context.db,
        input: {
          bayId: bay.id,
          durationDays: 1,
          jobStageId: getStageId(job, 'fabrication'),
        },
      }),
    ).rejects.toThrow('Bay department must match the Job stage department.');
  });

  test('enforces bay schedule permissions by role and department', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const jobStageId = getStageId(job, 'fabrication');

    await expect(
      bookJobSlot({
        access: createUserAccessSummary({ role: 'admin', userId: 'admin-user' }),
        db: context.db,
        input: { bayId: bay.id, durationDays: 1, jobStageId },
      }),
    ).resolves.toMatchObject({ slot: { sequence: 1 } });
    await expect(
      bookJobSlot({
        access: createUserAccessSummary({
          departments: ['fabrication'],
          role: 'job-department-manager',
          userId: 'fabrication-manager',
        }),
        db: context.db,
        input: { bayId: bay.id, durationDays: 1, jobStageId },
      }),
    ).resolves.toMatchObject({ slot: { sequence: 2 } });
    await expect(
      bookJobSlot({
        access: createUserAccessSummary({
          departments: ['paint'],
          role: 'job-department-manager',
          userId: 'paint-manager',
        }),
        db: context.db,
        input: { bayId: bay.id, durationDays: 1, jobStageId },
      }),
    ).rejects.toThrow('You do not have permission to book this Bay.');
  });

  test('inserts an explicit idle slot before new work when the queue ended in the past', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: new Date('2026-06-05T08:00:00.000Z'),
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);

    const firstSlot = await bookJobSlot({
      access: jobAccess,
      currentDate: new Date('2026-06-05T09:00:00.000+02:00'),
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(firstJob, 'fabrication') },
    });
    const secondSlot = await bookJobSlot({
      access: jobAccess,
      currentDate: new Date('2026-06-10T09:00:00.000+02:00'),
      db: context.db,
      input: { bayId: bay.id, durationDays: 2, jobStageId: getStageId(secondJob, 'fabrication') },
    });

    const schedule = await listBays({ access: jobAccess, db: context.db });
    expect(getBaySchedule(schedule, bay.id)).toEqual(
      expect.objectContaining({
        nextAvailableAt: '2026-06-11T22:00:00.000Z',
        slots: [
          expect.objectContaining({
            id: firstSlot.slot.id,
            kind: 'work',
            startAt: '2026-06-04T22:00:00.000Z',
            endAt: '2026-06-05T22:00:00.000Z',
          }),
          expect.objectContaining({
            durationDays: 4,
            jobStageId: null,
            kind: 'idle',
            label: null,
            sequence: 2,
            startAt: '2026-06-05T22:00:00.000Z',
            endAt: '2026-06-09T22:00:00.000Z',
          }),
          expect.objectContaining({
            id: secondSlot.slot.id,
            kind: 'work',
            sequence: 3,
            startAt: '2026-06-09T22:00:00.000Z',
            endAt: '2026-06-11T22:00:00.000Z',
          }),
        ],
      }),
    );
  });

  test('counts auto-inserted idle gaps in working days from persisted Off-Days', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: new Date('2026-06-05T08:00:00.000Z'),
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    await toggleOffDay({
      access: calendarAccess,
      db: context.db,
      input: offDayInput({ date: '2026-06-06', isOffDay: true, label: null }),
    });
    await toggleOffDay({
      access: calendarAccess,
      db: context.db,
      input: offDayInput({ date: '2026-06-07', isOffDay: true, label: null }),
    });

    await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(firstJob, 'fabrication') },
    });
    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));
    await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(secondJob, 'fabrication') },
    });

    const storedSlots = await context.db
      .select({
        durationDays: jobSlots.durationDays,
        kind: jobSlots.kind,
        sequence: jobSlots.sequence,
      })
      .from(jobSlots)
      .where(eq(jobSlots.bayId, bay.id))
      .orderBy(asc(jobSlots.sequence));
    expect(storedSlots).toEqual([
      { durationDays: 1, kind: 'work', sequence: 1 },
      { durationDays: 2, kind: 'idle', sequence: 2 },
      { durationDays: 1, kind: 'work', sequence: 3 },
    ]);
  });

  test('counts auto-inserted idle gaps in working days from persisted Off-Days', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: new Date('2026-06-05T08:00:00.000Z'),
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    await toggleOffDay({
      access: calendarAccess,
      db: context.db,
      input: offDayInput({ date: '2026-06-06', isOffDay: true, label: null }),
    });
    await toggleOffDay({
      access: calendarAccess,
      db: context.db,
      input: offDayInput({ date: '2026-06-07', isOffDay: true, label: null }),
    });

    await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(firstJob, 'fabrication') },
    });
    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));
    await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(secondJob, 'fabrication') },
    });

    const storedSlots = await context.db
      .select({
        durationDays: jobSlots.durationDays,
        kind: jobSlots.kind,
        sequence: jobSlots.sequence,
      })
      .from(jobSlots)
      .where(eq(jobSlots.bayId, bay.id))
      .orderBy(asc(jobSlots.sequence));
    expect(storedSlots).toEqual([
      { durationDays: 1, kind: 'work', sequence: 1 },
      { durationDays: 2, kind: 'idle', sequence: 2 },
      { durationDays: 1, kind: 'work', sequence: 3 },
    ]);
  });

  test('counts auto-inserted idle gaps from persisted Bay exceptions', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: new Date('2026-06-05T08:00:00.000Z'),
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    await addBayCalendarException({
      access: jobAccess,
      db: context.db,
      input: bayExceptionInput({ bayId: bay.id, date: '2026-06-06', direction: 'off', label: null }),
    });
    await addBayCalendarException({
      access: jobAccess,
      db: context.db,
      input: bayExceptionInput({ bayId: bay.id, date: '2026-06-07', direction: 'off', label: null }),
    });

    await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(firstJob, 'fabrication') },
    });
    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));
    await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(secondJob, 'fabrication') },
    });

    const storedSlots = await context.db
      .select({
        durationDays: jobSlots.durationDays,
        kind: jobSlots.kind,
        sequence: jobSlots.sequence,
      })
      .from(jobSlots)
      .where(eq(jobSlots.bayId, bay.id))
      .orderBy(asc(jobSlots.sequence));
    expect(storedSlots).toEqual([
      { durationDays: 1, kind: 'work', sequence: 1 },
      { durationDays: 2, kind: 'idle', sequence: 2 },
      { durationDays: 1, kind: 'work', sequence: 3 },
    ]);
  });
});

describe('addIdleJobSlot', () => {
  test('inserts one-day idle slots before and after target slots and keeps sequences contiguous', async ({
    context,
  }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const firstSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(firstJob, 'fabrication') },
    });
    const secondSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(secondJob, 'fabrication') },
    });

    const beforeIdle = await addIdleJobSlot({
      access: jobAccess,
      db: context.db,
      input: { durationDays: 1, label: null, placement: 'before', targetSlotId: secondSlot.slot.id },
    });
    const afterIdle = await addIdleJobSlot({
      access: jobAccess,
      db: context.db,
      input: { durationDays: 1, label: null, placement: 'after', targetSlotId: beforeIdle.slot.id },
    });

    const storedSlots = await context.db
      .select({
        id: jobSlots.id,
        kind: jobSlots.kind,
        sequence: jobSlots.sequence,
      })
      .from(jobSlots)
      .where(eq(jobSlots.bayId, bay.id))
      .orderBy(asc(jobSlots.sequence));
    expect(storedSlots).toEqual([
      { id: firstSlot.slot.id, kind: 'work', sequence: 1 },
      { id: beforeIdle.slot.id, kind: 'idle', sequence: 2 },
      { id: afterIdle.slot.id, kind: 'idle', sequence: 3 },
      { id: secondSlot.slot.id, kind: 'work', sequence: 4 },
    ]);
  });

  test('allows adjacent idle slots without merging them', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const workSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(job, 'fabrication') },
    });

    const firstIdle = await addIdleJobSlot({
      access: jobAccess,
      db: context.db,
      input: { durationDays: 1, placement: 'after', targetSlotId: workSlot.slot.id },
    });
    const secondIdle = await addIdleJobSlot({
      access: jobAccess,
      db: context.db,
      input: { durationDays: 1, placement: 'after', targetSlotId: firstIdle.slot.id },
    });

    const schedule = await listBays({ access: jobAccess, db: context.db });
    expect(getBaySchedule(schedule, bay.id).slots).toEqual([
      expect.objectContaining({ id: workSlot.slot.id, kind: 'work', sequence: 1 }),
      expect.objectContaining({ id: firstIdle.slot.id, kind: 'idle', sequence: 2 }),
      expect.objectContaining({ id: secondIdle.slot.id, kind: 'idle', sequence: 3 }),
    ]);
  });

  test('enforces bay schedule permissions by role and department', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const workSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(job, 'fabrication') },
    });

    await expect(
      addIdleJobSlot({
        access: createUserAccessSummary({
          departments: ['paint'],
          role: 'job-department-manager',
          userId: 'paint-manager',
        }),
        db: context.db,
        input: { durationDays: 1, placement: 'after', targetSlotId: workSlot.slot.id },
      }),
    ).rejects.toThrow('You do not have permission to add idle time to this Bay schedule.');
  });
});

describe('resizeJobSlot', () => {
  test('updates duration and reflows downstream projected dates only', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: new Date('2026-06-05T08:00:00.000Z'),
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const thirdJob = await createAcceptedJob(context.db, context.catalog.product.id);

    const firstSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(firstJob, 'fabrication') },
    });
    const secondSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(secondJob, 'fabrication') },
    });
    const thirdSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(thirdJob, 'fabrication') },
    });

    await expect(
      resizeJobSlot({
        access: jobAccess,
        db: context.db,
        input: { slotId: secondSlot.slot.id, durationDays: 2 },
      }),
    ).resolves.toMatchObject({
      slot: {
        id: secondSlot.slot.id,
        durationDays: 2,
        sequence: 2,
      },
    });

    const schedule = await listBays({ access: jobAccess, db: context.db });
    expect(getBaySchedule(schedule, bay.id)).toEqual(
      expect.objectContaining({
        id: bay.id,
        nextAvailableAt: '2026-06-08T22:00:00.000Z',
        slots: [
          expect.objectContaining({
            id: firstSlot.slot.id,
            durationDays: 1,
            startAt: '2026-06-04T22:00:00.000Z',
            endAt: '2026-06-05T22:00:00.000Z',
          }),
          expect.objectContaining({
            id: secondSlot.slot.id,
            durationDays: 2,
            startAt: '2026-06-05T22:00:00.000Z',
            endAt: '2026-06-07T22:00:00.000Z',
          }),
          expect.objectContaining({
            id: thirdSlot.slot.id,
            durationDays: 1,
            startAt: '2026-06-07T22:00:00.000Z',
            endAt: '2026-06-08T22:00:00.000Z',
          }),
        ],
      }),
    );
  });

  test('rejects missing slots', async ({ context }) => {
    await expect(
      resizeJobSlot({
        access: jobAccess,
        db: context.db,
        input: {
          durationDays: 2,
          slotId: '00000000-0000-4000-8000-000000000999',
        },
      }),
    ).rejects.toThrow('Job slot not found');
  });

  test('enforces bay schedule resize permissions by role and department', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const bookedSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(job, 'fabrication') },
    });

    await expect(
      resizeJobSlot({
        access: createUserAccessSummary({ role: 'admin', userId: 'admin-user' }),
        db: context.db,
        input: { durationDays: 2, slotId: bookedSlot.slot.id },
      }),
    ).resolves.toMatchObject({ slot: { durationDays: 2 } });
    await expect(
      resizeJobSlot({
        access: jobAccess,
        db: context.db,
        input: { durationDays: 1, slotId: bookedSlot.slot.id },
      }),
    ).resolves.toMatchObject({ slot: { durationDays: 1 } });
    await expect(
      resizeJobSlot({
        access: createUserAccessSummary({
          departments: ['fabrication'],
          role: 'job-department-manager',
          userId: 'fabrication-manager',
        }),
        db: context.db,
        input: { durationDays: 2, slotId: bookedSlot.slot.id },
      }),
    ).resolves.toMatchObject({ slot: { durationDays: 2 } });
    await expect(
      resizeJobSlot({
        access: createUserAccessSummary({
          departments: ['paint'],
          role: 'job-department-manager',
          userId: 'paint-manager',
        }),
        db: context.db,
        input: { durationDays: 1, slotId: bookedSlot.slot.id },
      }),
    ).rejects.toThrow('You do not have permission to resize this Bay schedule.');
  });

  test('resizes idle slots and reflows later work', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const workSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(job, 'fabrication') },
    });
    const idleSlot = await addIdleJobSlot({
      access: jobAccess,
      db: context.db,
      input: { durationDays: 1, placement: 'before', targetSlotId: workSlot.slot.id },
    });

    await expect(
      resizeJobSlot({
        access: jobAccess,
        db: context.db,
        input: { durationDays: 2, slotId: idleSlot.slot.id },
      }),
    ).resolves.toMatchObject({ slot: { durationDays: 2, kind: 'idle' } });

    const schedule = await listBays({ access: jobAccess, db: context.db });
    expect(getBaySchedule(schedule, bay.id).slots).toEqual([
      expect.objectContaining({
        id: idleSlot.slot.id,
        endAt: '2026-06-06T22:00:00.000Z',
        kind: 'idle',
        startAt: '2026-06-04T22:00:00.000Z',
      }),
      expect.objectContaining({
        id: workSlot.slot.id,
        endAt: '2026-06-07T22:00:00.000Z',
        kind: 'work',
        startAt: '2026-06-06T22:00:00.000Z',
      }),
    ]);
  });
});

describe('removeJobSlot', () => {
  test('removes a middle slot, closes the projected gap, and keeps stored sequences contiguous', async ({
    context,
  }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: new Date('2026-06-05T08:00:00.000Z'),
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const thirdJob = await createAcceptedJob(context.db, context.catalog.product.id);

    const firstSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(firstJob, 'fabrication') },
    });
    const secondSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(secondJob, 'fabrication') },
    });
    const thirdSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(thirdJob, 'fabrication') },
    });

    await expect(
      removeJobSlot({
        access: jobAccess,
        db: context.db,
        input: { slotId: secondSlot.slot.id },
      }),
    ).resolves.toMatchObject({
      slot: {
        id: secondSlot.slot.id,
        sequence: 2,
      },
    });

    const storedSlots = await context.db
      .select({
        id: jobSlots.id,
        sequence: jobSlots.sequence,
      })
      .from(jobSlots)
      .where(eq(jobSlots.bayId, bay.id))
      .orderBy(asc(jobSlots.sequence));
    expect(storedSlots).toEqual([
      { id: firstSlot.slot.id, sequence: 1 },
      { id: thirdSlot.slot.id, sequence: 2 },
    ]);

    const schedule = await listBays({ access: jobAccess, db: context.db });
    expect(getBaySchedule(schedule, bay.id)).toEqual(
      expect.objectContaining({
        id: bay.id,
        nextAvailableAt: '2026-06-06T22:00:00.000Z',
        slots: [
          expect.objectContaining({
            id: firstSlot.slot.id,
            startAt: '2026-06-04T22:00:00.000Z',
            endAt: '2026-06-05T22:00:00.000Z',
          }),
          expect.objectContaining({
            id: thirdSlot.slot.id,
            sequence: 2,
            startAt: '2026-06-05T22:00:00.000Z',
            endAt: '2026-06-06T22:00:00.000Z',
          }),
        ],
      }),
    );
  });

  test('removing the last slot keeps upstream slots unchanged', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: new Date('2026-06-05T08:00:00.000Z'),
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const firstSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(firstJob, 'fabrication') },
    });
    const secondSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 2, jobStageId: getStageId(secondJob, 'fabrication') },
    });

    await removeJobSlot({
      access: jobAccess,
      db: context.db,
      input: { slotId: secondSlot.slot.id },
    });

    const schedule = await listBays({ access: jobAccess, db: context.db });
    expect(getBaySchedule(schedule, bay.id)).toEqual(
      expect.objectContaining({
        id: bay.id,
        nextAvailableAt: '2026-06-05T22:00:00.000Z',
        slots: [
          expect.objectContaining({
            id: firstSlot.slot.id,
            sequence: 1,
            startAt: '2026-06-04T22:00:00.000Z',
            endAt: '2026-06-05T22:00:00.000Z',
          }),
        ],
      }),
    );
  });

  test('rejects missing slots', async ({ context }) => {
    await expect(
      removeJobSlot({
        access: jobAccess,
        db: context.db,
        input: {
          slotId: '00000000-0000-4000-8000-000000000999',
        },
      }),
    ).rejects.toThrow('Job slot not found');
  });

  test('enforces bay schedule remove permissions by role and department', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const adminJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const adminSecondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const managerJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const deniedJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const adminSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(adminJob, 'fabrication') },
    });
    const adminSecondSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(adminSecondJob, 'fabrication') },
    });
    const managerSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(managerJob, 'fabrication') },
    });
    const deniedSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(deniedJob, 'fabrication') },
    });

    await expect(
      removeJobSlot({
        access: createUserAccessSummary({ role: 'admin', userId: 'admin-user' }),
        db: context.db,
        input: { slotId: adminSlot.slot.id },
      }),
    ).resolves.toMatchObject({ slot: { id: adminSlot.slot.id } });
    await expect(
      removeJobSlot({
        access: jobAccess,
        db: context.db,
        input: { slotId: adminSecondSlot.slot.id },
      }),
    ).resolves.toMatchObject({ slot: { id: adminSecondSlot.slot.id } });
    await expect(
      removeJobSlot({
        access: createUserAccessSummary({
          departments: ['fabrication'],
          role: 'job-department-manager',
          userId: 'fabrication-manager',
        }),
        db: context.db,
        input: { slotId: managerSlot.slot.id },
      }),
    ).resolves.toMatchObject({ slot: { id: managerSlot.slot.id } });
    await expect(
      removeJobSlot({
        access: createUserAccessSummary({
          departments: ['paint'],
          role: 'job-department-manager',
          userId: 'paint-manager',
        }),
        db: context.db,
        input: { slotId: deniedSlot.slot.id },
      }),
    ).rejects.toThrow('You do not have permission to remove from this Bay schedule.');
  });

  test('removes idle slots and closes the queue gap', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const workSlot = await bookJobSlot({
      access: jobAccess,
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobStageId: getStageId(job, 'fabrication') },
    });
    const idleSlot = await addIdleJobSlot({
      access: jobAccess,
      db: context.db,
      input: { durationDays: 1, placement: 'before', targetSlotId: workSlot.slot.id },
    });

    await expect(
      removeJobSlot({
        access: jobAccess,
        db: context.db,
        input: { slotId: idleSlot.slot.id },
      }),
    ).resolves.toMatchObject({ slot: { id: idleSlot.slot.id, kind: 'idle' } });

    const schedule = await listBays({ access: jobAccess, db: context.db });
    expect(getBaySchedule(schedule, bay.id).slots).toEqual([
      expect.objectContaining({
        id: workSlot.slot.id,
        kind: 'work',
        sequence: 1,
        startAt: '2026-06-04T22:00:00.000Z',
      }),
    ]);
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

async function createBay(
  db: Db,
  {
    department,
    scheduleOrigin = new Date('2026-06-05T08:00:00.000Z'),
  }: {
    department: Department;
    scheduleOrigin?: Date;
  },
) {
  const [bay] = await db
    .insert(jobBays)
    .values({
      department,
      name: `${department} Test Bay`,
      scheduleOrigin,
    })
    .returning();

  if (!bay) {
    throw new Error('Bay insert did not return a row');
  }

  return bay;
}

function getBaySchedule(schedule: Awaited<ReturnType<typeof listBays>>, bayId: string) {
  const bay = schedule.items.find((item) => item.id === bayId);

  if (!bay) {
    throw new Error(`Bay schedule not found: ${bayId}`);
  }

  return bay;
}

function offDayInput(input: Parameters<typeof ToggleOffDayInput.parse>[0]) {
  return ToggleOffDayInput.parse(input);
}

function bayExceptionInput(input: Parameters<typeof AddBayCalendarExceptionInput.parse>[0]) {
  return AddBayCalendarExceptionInput.parse(input);
}

function removeBayExceptionInput(input: Parameters<typeof RemoveBayCalendarExceptionInput.parse>[0]) {
  return RemoveBayCalendarExceptionInput.parse(input);
}

async function createAcceptedJob(db: Db, productId: string): Promise<JobDetail> {
  const quote = await createQuote(db, {
    productId,
    status: 'accepted',
  });

  return createJob({
    access: jobAccess,
    actorUserId,
    db,
    input: { quoteId: quote.id },
  });
}

function getStageId(job: JobDetail, stageName: JobStageName) {
  const stage = job.stages.find((item) => item.stage === stageName);

  if (!stage) {
    throw new Error(`Job stage not found: ${stageName}`);
  }

  return stage.id;
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
        displayOrder: 0,
        kind: 'standard',
        name: 'Standard Chassis',
        productId: product.id,
      },
      {
        displayOrder: 1,
        kind: 'standard',
        name: 'Standard Axle',
        productId: product.id,
      },
      {
        displayOrder: 0,
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

async function createProductDocuments(
  db: Db,
  productId: string,
  inputs: { filename: string; storageKey: string; type?: ProductDocumentType }[],
) {
  return db
    .insert(documents)
    .values(
      inputs.map((input) => ({
        byteSize: 8,
        contentType: 'application/pdf',
        filename: input.filename,
        metadata: { type: input.type ?? 'part_book' },
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
    documentNotes: quote.documentNotes,
    plannedDeliveryDate: quote.plannedDeliveryDate,
    preferredDeliveryDate: quote.preferredDeliveryDate,
    salesPersonId: quote.salesPersonId,
    selectedAssemblies: [],
    status: quote.status,
    validUntil: quote.validUntil,
  };
}
