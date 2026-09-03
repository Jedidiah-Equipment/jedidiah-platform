import {
  assemblyOverrides,
  assemblyParts,
  auditEvents,
  customers,
  type Db,
  documents,
  jobBayOperatorAssignments,
  jobBays,
  jobBuildSpecAssemblies,
  jobCfoAssemblies,
  jobCfoParts,
  jobEstimateSnapshots,
  jobSlots,
  jobs,
  parts,
  productAssemblies,
  productSerialSequences,
  products,
  productUnitOwnershipTransfers,
  productUnits,
  quoteSelectedAssemblies,
  quotes,
  quoteWorkItemParts,
  quoteWorkItems,
  supplier,
  user,
} from '@pkg/db';
import { addDateOnlyDays, getPlantDateNow, resolveProductUnitOwnerId } from '@pkg/domain';
import {
  AddBayCalendarExceptionInput,
  type BrochurePdfRenderer,
  DateOnlyIso,
  type Department,
  JobBayCreateInput,
  JobBayRenameInput,
  JobCancelInput,
  type JobCreateInput,
  type JobDetail,
  JobUpdateInput,
  type PartUnitOfMeasure,
  type ProductDocumentType,
  ProductUnitTransferInput,
  type QuoteStatus,
  QuoteUpdateInput,
  ToggleOffDayInput,
} from '@pkg/schema';
import { and, asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { getJobCancellationPlan } from '../cancellation/cancellation-plan-service.js';
import { deleteProductDocument } from '../products/product-service.js';
import { updateQuote } from '../quotes/quote-service.js';
import { createTester } from '../test/create-tester.js';
import { InMemoryStorageAdapter } from '../test/in-memory-storage-adapter.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { getProductUnit } from '../units/product-unit-read-service.js';
import { removeProductUnit, transferProductUnitOwnership } from '../units/product-unit-service.js';
import {
  assignJobBayOperator,
  createJobBay,
  listBayOperatorAssignmentHistory,
  listBayOperators,
  listJobBays,
  renameJobBay,
  setJobBayDisabled,
  unassignJobBayOperator,
} from './job-bay-service.js';
import { sweepJobCompletions } from './job-completion-service.js';
import { getJob, listBayQueueAvailability, listBays, listJobCustomerOptions, listJobs } from './job-read-service.js';
import {
  addIdleJobSlot,
  bookJobSlot,
  cancelJob,
  createJob as createJobCore,
  moveJobSlot,
  removeJobSlot,
  resizeJobSlot,
  updateJob,
} from './job-service.js';
import { addBayCalendarException, toggleOffDay } from './working-calendar-service.js';

const actorUserId = 'test-user-id';

// Minimal but valid PDF header so the saved brochure bytes are recognisable PDF content.
const BROCHURE_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);

// Most Job tests do not exercise the Brochure; a shared fake renderer and in-memory storage keep the
// existing call sites unchanged while still injecting the dependencies createJob now requires.
// Brochure-focused tests pass their own renderer/storage to assert generation precisely.
const brochureRenderer: BrochurePdfRenderer = async () => BROCHURE_PDF_BYTES;
const jobStorage = new InMemoryStorageAdapter();

function createJob(args: {
  actorUserId: string;
  brochureRenderer?: BrochurePdfRenderer;
  db: Db;
  input: JobCreateInput;
  storage?: InMemoryStorageAdapter;
}): Promise<JobDetail> {
  return createJobCore({
    actorUserId: args.actorUserId,
    brochureRenderer: args.brochureRenderer ?? brochureRenderer,
    db: args.db,
    input: args.input,
    storage: args.storage ?? jobStorage,
  });
}

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
  test('returns no work rows for product Jobs', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });
    const created = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });
    const job = await getJob({ db: context.db, id: created.id });

    expect(job.workRows).toEqual([]);
  });

  test('reads custom Work Item names live in position order after the Quote is accepted', async ({ context }) => {
    const quote = await createCustomQuote(context.db, {
      status: 'draft',
      workTitle: 'Pump skid rebuild',
    });
    await context.db.insert(quoteWorkItems).values([
      {
        id: '00000000-0000-4000-8000-000000000202',
        hours: 3,
        name: 'Reassemble pump',
        position: 1,
        quoteId: quote.id,
      },
      {
        id: '00000000-0000-4000-8000-000000000201',
        department: 'assembly',
        description: 'Strip pump assembly',
        hourlyRate: 320,
        hours: 1.5,
        position: 0,
        quoteId: quote.id,
      },
    ]);
    await context.db.insert(quoteWorkItemParts).values({
      name: 'Internal seal kit',
      position: 0,
      quantity: 1,
      unitPrice: 250,
      workItemId: '00000000-0000-4000-8000-000000000201',
    });
    const created = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });
    const draftUpdateInput = quoteUpdateInput(quote);
    if (draftUpdateInput.offering.kind !== 'custom') throw new Error('Expected a Custom Quote update input');

    // The floor reads the internal Department label — Assembly, not the quote's "Workshop" wording.
    expect((await getJob({ db: context.db, id: created.id })).workRows).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000201',
        department: 'assembly',
        description: 'Strip pump assembly',
        hours: 1.5,
        name: 'Assembly',
      },
      {
        id: '00000000-0000-4000-8000-000000000202',
        department: null,
        description: null,
        hours: 3,
        name: 'Reassemble pump',
      },
    ]);

    await updateQuote({
      actorUserId,
      db: context.db,
      input: QuoteUpdateInput.parse({
        ...draftUpdateInput,
        offering: {
          ...draftUpdateInput.offering,
          workItems: [
            { hours: 0, name: 'Inspect replacement pump', parts: [] },
            { hours: 2, name: 'Install replacement pump', parts: [] },
          ],
        },
      }),
    });
    const editedWorkRows = (await getJob({ db: context.db, id: created.id })).workRows;

    expect(editedWorkRows.map(({ name }) => name)).toEqual(['Inspect replacement pump', 'Install replacement pump']);
    expect(
      editedWorkRows.every((item) => Object.keys(item).sort().join(',') === 'department,description,hours,id,name'),
    ).toBe(true);

    await updateQuote({
      actorUserId,
      db: context.db,
      input: QuoteUpdateInput.parse({
        ...draftUpdateInput,
        offering: {
          ...draftUpdateInput.offering,
          workItems: [
            { hours: 0, name: 'Inspect replacement pump', parts: [] },
            { hours: 2, name: 'Install replacement pump', parts: [] },
          ],
        },
        status: 'accepted',
      }),
    });
    await updateQuote({
      actorUserId,
      db: context.db,
      input: QuoteUpdateInput.parse({
        ...draftUpdateInput,
        offering: {
          ...draftUpdateInput.offering,
          workItems: [{ hours: 1, name: 'Test installed pump', parts: [] }],
        },
        status: 'accepted',
      }),
    });
    expect((await getJob({ db: context.db, id: created.id })).workRows.map(({ name }) => name)).toEqual([
      'Test installed pump',
    ]);
  });

  test('creates one Product Unit carrying the serial and binds the Job to it', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    const job = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });

    const [unitRows, jobRows] = await Promise.all([
      context.db.select().from(productUnits),
      context.db.select().from(jobs),
    ]);

    expect(unitRows).toHaveLength(1);
    expect(unitRows[0]).toMatchObject({
      productId: context.catalog.product.id,
      productSerialNumber: 'CFO-001260001',
      productSerialPrefix: 'CFO-001',
      productSerialSequence: 1,
      productSerialYear: 26,
      vinNumber: null,
    });
    expect(jobRows[0]?.productUnitId).toBe(unitRows[0]?.id);
    // The Job carries no serial of its own: it reports the one on the machine it is bound to.
    expect(job.productUnit?.productSerialNumber).toBe('CFO-001260001');
  });

  // The serial used to be audited as a Job field. It is a fact about the machine, so the machine's own
  // create event is what keeps a minted serial in the audit trail.
  test('audits the machine that came into being, naming its serial', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    await createJob({ actorUserId, db: context.db, input: { baySeeds: [], quoteId: quote.id } });

    const [event] = await context.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityType, 'product_unit'), eq(auditEvents.action, 'created')));

    expect(event).toMatchObject({ action: 'created', actorUserId });
    expect(event?.summary).toContain('CFO-001260001');
  });

  // A build-to-order sale moves the machine to its buyer, so it is audited like every other ownership
  // move. It used to write the Transfer row and no event, leaving that one sale invisible in the feed.
  test('audits the initial ownership move to the Quote customer', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    await createJob({ actorUserId, db: context.db, input: { baySeeds: [], quoteId: quote.id } });

    const [event] = await context.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityType, 'product_unit'), eq(auditEvents.action, 'updated')));

    expect(event).toMatchObject({ action: 'updated', actorUserId });
    expect(event?.changes).toMatchObject({ ownerCustomerId: { from: null, to: quote.customerId } });
  });

  test('writes an initial Ownership Transfer out of Stock to the Quote customer', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });

    const [unit] = await context.db.select().from(productUnits);
    const transfers = await context.db.select().from(productUnitOwnershipTransfers);

    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({
      actorUserId,
      fromCustomerId: null,
      note: null,
      occurredOn: '2026-06-05',
      productUnitId: unit?.id,
      sourceQuoteId: quote.id,
      toCustomerId: quote.customerId,
    });
    expect(resolveProductUnitOwnerId(transfers)).toBe(quote.customerId);
  });

  test('reuses the sold Product Unit each time a cancelled Job is replaced', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });
    const first = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });
    const originalTransfers = await context.db
      .select()
      .from(productUnitOwnershipTransfers)
      .where(eq(productUnitOwnershipTransfers.productUnitId, first.productUnit?.id ?? ''));

    await cancelJob({
      actorUserId,
      db: context.db,
      input: { cancellationReason: 'Raised with the wrong build details', id: first.id, removeUnit: false },
    });
    await expect(
      updateQuote({
        actorUserId,
        db: context.db,
        input: QuoteUpdateInput.parse({
          ...quoteUpdateInput(quote),
          discountPercent: 25,
        }),
      }),
    ).rejects.toThrow('Quote is locked because it has already sourced a Job; discountPercent cannot be changed.');
    const replacement = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });
    await cancelJob({
      actorUserId,
      db: context.db,
      input: { cancellationReason: 'Replacement was also raised incorrectly', id: replacement.id, removeUnit: false },
    });
    const third = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });

    expect(replacement.productUnit?.id).toBe(first.productUnit?.id);
    expect(third.productUnit?.id).toBe(first.productUnit?.id);
    await expect(
      context.db
        .select()
        .from(productUnitOwnershipTransfers)
        .where(eq(productUnitOwnershipTransfers.productUnitId, first.productUnit?.id ?? '')),
    ).resolves.toEqual(originalTransfers);
  });

  test('mints a fresh Product Unit when ownership moved away from the Quote customer', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });
    const cancelled = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });
    const originalUnitId = cancelled.productUnit?.id;
    if (!originalUnitId) throw new Error('Build-to-order Job did not return its Product Unit');

    await cancelJob({
      actorUserId,
      db: context.db,
      input: { cancellationReason: 'Raised against the wrong machine', id: cancelled.id, removeUnit: false },
    });
    await transferProductUnitOwnership({
      actorUserId,
      db: context.db,
      input: ProductUnitTransferInput.parse({
        id: originalUnitId,
        note: 'The sale still needs a replacement machine',
        occurredOn: '2026-06-05',
        toCustomerId: null,
      }),
    });

    const replacement = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });

    expect(replacement.productUnit?.id).not.toBe(originalUnitId);
    expect(replacement.customerId).toBe(quote.customerId);
  });

  test('mints a fresh Product Unit when the cancelled Job orphan was removed', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });
    const cancelled = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });
    const orphanUnitId = cancelled.productUnit?.id;
    if (!orphanUnitId) throw new Error('Build-to-order Job did not return its Product Unit');

    await cancelJob({
      actorUserId,
      db: context.db,
      input: { cancellationReason: 'Raised against the wrong machine', id: cancelled.id, removeUnit: false },
    });
    await transferProductUnitOwnership({
      actorUserId,
      db: context.db,
      input: ProductUnitTransferInput.parse({
        id: orphanUnitId,
        note: 'The machine was never built',
        occurredOn: '2026-06-05',
        toCustomerId: null,
      }),
    });
    await removeProductUnit({ actorUserId, db: context.db, id: orphanUnitId });

    const replacement = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });

    expect(replacement.productUnit?.id).not.toBe(orphanUnitId);
    expect(replacement.productUnit?.productSerialNumber).toBe('CFO-001260002');
  });

  test('creates no Product Unit or Ownership Transfer for a Custom Job', async ({ context }) => {
    const quote = await createCustomQuote(context.db, {
      status: 'accepted',
      workTitle: 'Pump skid rebuild',
    });

    const job = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });

    const [unitRows, transferRows, jobRows] = await Promise.all([
      context.db.select().from(productUnits),
      context.db.select().from(productUnitOwnershipTransfers),
      context.db.select().from(jobs),
    ]);

    expect(unitRows).toEqual([]);
    expect(transferRows).toEqual([]);
    expect(jobRows[0]?.productUnitId).toBeNull();
    expect(job.productUnit).toBeNull();
    await expect(context.db.select().from(jobEstimateSnapshots)).resolves.toEqual([]);
  });

  test('snapshots the full honest estimate for a Product Job', async ({ context }) => {
    const job = await createJob({
      actorUserId,
      db: context.db,
      input: {
        baySeeds: [],
        buildSpecAssemblyIds: [context.catalog.heavyAxle.id],
        productId: context.catalog.product.id,
      },
    });

    await expect(
      context.db.select().from(jobEstimateSnapshots).where(eq(jobEstimateSnapshots.jobId, job.id)),
    ).resolves.toEqual([
      expect.objectContaining({
        jobId: job.id,
        payload: expect.objectContaining({
          complete: false,
          missing: expect.objectContaining({ laborHours: true, materialList: true }),
          productId: context.catalog.product.id,
        }),
      }),
    ]);
  });

  test('builds for stock with no Quote, minting a Unit that stays unowned', async ({ context }) => {
    const job = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], buildSpecAssemblyIds: [], productId: context.catalog.product.id },
    });

    const [unitRows, transferRows, jobRows] = await Promise.all([
      context.db.select().from(productUnits),
      context.db.select().from(productUnitOwnershipTransfers),
      context.db.select().from(jobs),
    ]);

    expect(jobRows[0]?.quoteId).toBeNull();
    expect(unitRows).toMatchObject([{ productId: context.catalog.product.id, productSerialNumber: 'CFO-001260001' }]);
    expect(jobRows[0]?.productUnitId).toBe(unitRows[0]?.id);
    // No sale, so nothing attributes the machine to anyone: it reads as Stock everywhere.
    expect(transferRows).toEqual([]);
    expect(resolveProductUnitOwnerId(transferRows)).toBeNull();
    expect(job).toMatchObject({
      customerCompanyName: null,
      customerId: null,
      productUnit: { productSerialNumber: 'CFO-001260001' },
      quoteCode: null,
      quoteId: null,
      quoteKind: null,
      workRows: [],
    });
  });

  // The quote uniqueness rule ignores null quote ids; a quoteless Job must not trip it, or the
  // showroom could only ever hold one machine.
  test('lets the floor hold several Stock Builds at once', async ({ context }) => {
    const input = { baySeeds: [], buildSpecAssemblyIds: [], productId: context.catalog.product.id };

    await createJob({ actorUserId, db: context.db, input });
    await createJob({ actorUserId, db: context.db, input });

    await expect(context.db.select().from(productUnits)).resolves.toMatchObject([
      { productSerialNumber: 'CFO-001260001' },
      { productSerialNumber: 'CFO-001260002' },
    ]);
  });

  test('enforces at most one live Job per Quote at the database boundary', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    await context.db
      .insert(jobs)
      .values([
        { cancelledAt: new Date('2026-06-03T08:00:00.000Z'), quoteId: quote.id },
        { cancelledAt: new Date('2026-06-04T08:00:00.000Z'), quoteId: quote.id },
        { quoteId: quote.id },
      ]);

    const failure = await context.db
      .insert(jobs)
      .values({ quoteId: quote.id })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(String((failure as { cause?: unknown } | null)?.cause)).toContain('job_quote_id_live_unique');
  });

  test('snapshots a Stock Build CFO from the Build Spec it was specced with', async ({ context }) => {
    const job = await createJob({
      actorUserId,
      db: context.db,
      input: {
        baySeeds: [],
        buildSpecAssemblyIds: [context.catalog.heavyAxle.id],
        productId: context.catalog.product.id,
      },
    });

    await expect(
      context.db.select().from(jobBuildSpecAssemblies).where(eq(jobBuildSpecAssemblies.jobId, job.id)),
    ).resolves.toMatchObject([
      { assemblyName: 'Heavy Axle Upgrade', productAssemblyId: context.catalog.heavyAxle.id, sequence: 0 },
    ]);
    // The optional overrides Standard Axle, exactly as it does when a Quote seeds the same selection.
    expect(job.cfo.map((entry) => [entry.kind, entry.assemblyName])).toEqual([
      ['standard', 'Standard Chassis'],
      ['optional', 'Heavy Axle Upgrade'],
    ]);
  });

  test('gives a Stock Build the same Documents and Brochure a customer build gets', async ({ context }) => {
    const storage = new InMemoryStorageAdapter();
    await makeBrochureComplete(context.db, storage, context.catalog.product.id);
    await createProductDocuments(context.db, context.catalog.product.id, [
      { filename: 'Part Book.pdf', storageKey: 'documents/product/source/part-book.pdf', type: 'part_book' },
    ]);

    const job = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], buildSpecAssemblyIds: [], productId: context.catalog.product.id },
      storage,
    });

    expect(job.documents.map((document) => document.filename).sort()).toEqual([
      'CFO-001-brochure.pdf',
      'Part Book.pdf',
    ]);
  });

  test('books a Stock Build into the Bays it was seeded with', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });

    const job = await createJob({
      actorUserId,
      db: context.db,
      input: {
        baySeeds: [{ bayId: bay.id, durationDays: 4 }],
        buildSpecAssemblyIds: [],
        productId: context.catalog.product.id,
      },
    });

    await expect(context.db.select().from(jobSlots)).resolves.toMatchObject([
      { bayId: bay.id, durationDays: 4, jobId: job.id, kind: 'work' },
    ]);
  });

  test('reads a Stock Build as Stock in the Job list, matching no Customer filter', async ({ context }) => {
    await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], buildSpecAssemblyIds: [], productId: context.catalog.product.id },
    });

    const result = await listJobs({
      db: context.db,
      input: {
        columnFilters: {},
        filters: {},
        include: {},
        cursor: 0,
        limit: 50,
        search: '',
        sortBy: 'createdAt',
        sortDirection: 'asc',
      },
    });

    expect(result.items).toMatchObject([{ customerCompanyName: null, customerId: null, quoteCode: null }]);
    // Stock belongs to no Customer, so it offers none to filter by either.
    await expect(
      listJobCustomerOptions({
        db: context.db,
        input: { cursor: 0, limit: 0, search: '', sortBy: 'companyName', sortDirection: 'asc' },
      }),
    ).resolves.toMatchObject({ items: [] });
  });

  test('refuses a Stock Build specced with an Optional Assembly from another Product', async ({ context }) => {
    const otherProduct = await createProduct(context.db, { modelCode: 'OTHER-001', name: 'Other Product' });
    const [otherAssembly] = await context.db
      .insert(productAssemblies)
      .values({ displayOrder: 0, kind: 'optional', name: 'Other Upgrade', price: 100, productId: otherProduct.id })
      .returning();

    await expect(
      createJob({
        actorUserId,
        db: context.db,
        input: {
          baySeeds: [],
          buildSpecAssemblyIds: [otherAssembly?.id ?? ''],
          productId: context.catalog.product.id,
        },
      }),
    ).rejects.toThrow('Optional assembly does not belong to this Product');

    await expect(context.db.select().from(jobs)).resolves.toEqual([]);
    await expect(context.db.select().from(productUnits)).resolves.toEqual([]);
  });

  test('refuses a Stock Build of a removed Product', async ({ context }) => {
    await context.db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, context.catalog.product.id));

    await expect(
      createJob({
        actorUserId,
        db: context.db,
        input: { baySeeds: [], buildSpecAssemblyIds: [], productId: context.catalog.product.id },
      }),
    ).rejects.toThrow('Product not found.');

    // Nothing was minted: a serial spent on a retired catalog entry could not be taken back.
    await expect(context.db.select().from(productUnits)).resolves.toEqual([]);
    await expect(context.db.select().from(productSerialSequences)).resolves.toEqual([]);
  });

  test('rejects a Job that is about neither a machine nor a sale', async ({ context }) => {
    const failure = await context.db
      .insert(jobs)
      .values({})
      .returning()
      .then(() => null)
      .catch((error: unknown) => error);

    // Drizzle wraps the driver error, so the constraint that fired is read off the cause.
    expect(String((failure as { cause?: unknown } | null)?.cause)).toContain('job_product_unit_or_quote_required');
  });

  test('gives each build its own Product Unit', async ({ context }) => {
    const [firstQuote, secondQuote] = await Promise.all([
      createQuote(context.db, { productId: context.catalog.product.id, status: 'accepted' }),
      createQuote(context.db, { productId: context.catalog.product.id, status: 'accepted' }),
    ]);

    await createJob({ actorUserId, db: context.db, input: { baySeeds: [], quoteId: firstQuote.id } });
    await createJob({ actorUserId, db: context.db, input: { baySeeds: [], quoteId: secondQuote.id } });

    const unitRows = await context.db.select().from(productUnits);

    expect(unitRows.map((unit) => unit.productSerialNumber).sort()).toEqual(['CFO-001260001', 'CFO-001260002']);
    expect(new Set(unitRows.map((unit) => unit.id)).size).toBe(2);
  });

  test('creates one quote-backed job with CFO rows, audit, and a locked quote', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      selectedAssemblyId: context.catalog.heavyAxle.id,
      status: 'accepted',
    });

    const job = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });

    const [jobRows, cfoAssemblyRows, cfoPartRows, events] = await Promise.all([
      context.db.select().from(jobs),
      context.db.select().from(jobCfoAssemblies),
      context.db.select().from(jobCfoParts),
      context.db.select().from(auditEvents).where(eq(auditEvents.entityType, 'job')),
    ]);

    expect(job).toMatchObject({
      productUnit: { productId: context.catalog.product.id, productSerialNumber: 'CFO-001260001' },
      quoteId: quote.id,
    });
    // The serial's component parts stay on the machine; only the full serial is worth reading back.
    await expect(context.db.select().from(productUnits)).resolves.toMatchObject([
      { productSerialPrefix: 'CFO-001', productSerialSequence: 1, productSerialYear: 26 },
    ]);
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
              unitOfMeasure: 'piece',
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
    expect(job.schedule.map((item) => item.department)).toEqual([
      'fabrication',
      'procurement',
      'supply',
      'paint',
      'assembly',
      'workshop',
    ]);
    expect(job.schedule.every((item) => item.bays.length === 0)).toBe(true);
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
          discountPercent: 25,
        }),
      }),
    ).rejects.toThrow('Quote is locked because it has already sourced a Job; discountPercent cannot be changed.');
  });

  test('seeds the job build spec from the quote selection and snapshots the CFO from it', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      selectedAssemblyId: context.catalog.heavyAxle.id,
      status: 'accepted',
    });

    const job = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });

    const buildSpecRows = await context.db
      .select()
      .from(jobBuildSpecAssemblies)
      .where(eq(jobBuildSpecAssemblies.jobId, job.id));

    expect(buildSpecRows).toMatchObject([
      { assemblyName: 'Heavy Axle Upgrade', productAssemblyId: context.catalog.heavyAxle.id, sequence: 0 },
    ]);
    expect(job.cfo.filter((entry) => entry.kind === 'optional').map((entry) => entry.assemblyName)).toEqual([
      'Heavy Axle Upgrade',
    ]);

    // The Build Spec is a copy taken at creation: later edits to the Quote's selection cannot reach it.
    await context.db.delete(quoteSelectedAssemblies).where(eq(quoteSelectedAssemblies.quoteId, quote.id));

    await expect(
      context.db.select().from(jobBuildSpecAssemblies).where(eq(jobBuildSpecAssemblies.jobId, job.id)),
    ).resolves.toMatchObject([{ assemblyName: 'Heavy Axle Upgrade', sequence: 0 }]);
  });

  test('keeps a build spec entry, under its snapshot name, after its catalog assembly is deleted', async ({
    context,
  }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      selectedAssemblyId: context.catalog.heavyAxle.id,
      status: 'accepted',
    });

    const job = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });

    await context.db.delete(productAssemblies).where(eq(productAssemblies.id, context.catalog.heavyAxle.id));

    await expect(
      context.db.select().from(jobBuildSpecAssemblies).where(eq(jobBuildSpecAssemblies.jobId, job.id)),
    ).resolves.toMatchObject([{ assemblyName: 'Heavy Axle Upgrade', productAssemblyId: null }]);
  });

  test('creates a bare job with an explicit empty Bay seed list', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    const job = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });

    expect(job.schedule.every((department) => department.bays.length === 0)).toBe(true);
    await expect(context.db.select().from(jobSlots)).resolves.toHaveLength(0);
  });

  test('creates a custom job from a draft custom quote without product side effects and books Bays', async ({
    context,
  }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const quote = await createCustomQuote(context.db, {
      status: 'draft',
      workTitle: 'Pump skid rebuild',
    });
    await context.db.insert(productSerialSequences).values({
      lastSequence: 8,
      productId: context.catalog.product.id,
    });
    const storage = new InMemoryStorageAdapter();
    let rendererCalls = 0;
    const renderer: BrochurePdfRenderer = async () => {
      rendererCalls += 1;

      return BROCHURE_PDF_BYTES;
    };

    const job = await createJob({
      actorUserId,
      brochureRenderer: renderer,
      db: context.db,
      input: { baySeeds: [{ bayId: bay.id, durationDays: 2 }], quoteId: quote.id },
      storage,
    });

    const [jobRows, buildSpecRows, cfoAssemblyRows, cfoPartRows, documentRows, serialRows, slotRows] =
      await Promise.all([
        context.db.select().from(jobs),
        context.db.select().from(jobBuildSpecAssemblies),
        context.db.select().from(jobCfoAssemblies),
        context.db.select().from(jobCfoParts),
        context.db.select().from(documents).where(eq(documents.jobId, job.id)),
        context.db.select().from(productSerialSequences),
        context.db.select().from(jobSlots),
      ]);

    expect(job).toMatchObject({
      productUnit: null,
      quoteId: quote.id,
      quoteKind: 'custom',
      workTitle: 'Pump skid rebuild',
    });
    expect(job.cfo).toEqual([]);
    expect(job.documents).toEqual([]);
    // No machine: a Custom Job produces none, which is exactly what makes it a Custom Job.
    expect(jobRows).toMatchObject([
      {
        productUnitId: null,
        quoteId: quote.id,
      },
    ]);
    expect(buildSpecRows).toHaveLength(0);
    expect(cfoAssemblyRows).toHaveLength(0);
    expect(cfoPartRows).toHaveLength(0);
    expect(documentRows).toHaveLength(0);
    expect(rendererCalls).toBe(0);
    expect(storage.objects.size).toBe(0);
    expect(serialRows).toMatchObject([{ lastSequence: 8, productId: context.catalog.product.id }]);
    expect(slotRows).toMatchObject([{ durationDays: 2, jobId: job.id, kind: 'work' }]);

    await expect(
      createJob({
        actorUserId,
        db: context.db,
        input: { baySeeds: [], quoteId: quote.id },
      }),
    ).rejects.toThrow('Quote already has a Job.');
  });

  test('enforces the quote kind and status matrix for job creation', async ({ context }) => {
    const cases: {
      allowed: boolean;
      kind: 'product' | 'custom';
      message?: string;
      status: QuoteStatus;
    }[] = [
      { allowed: false, kind: 'product', message: 'Only accepted quotes can start a Job.', status: 'draft' },
      { allowed: false, kind: 'product', message: 'Only accepted quotes can start a Job.', status: 'sent' },
      { allowed: true, kind: 'product', status: 'accepted' },
      { allowed: false, kind: 'product', message: 'Only accepted quotes can start a Job.', status: 'rejected' },
      { allowed: false, kind: 'product', message: 'Only accepted quotes can start a Job.', status: 'cancelled' },
      { allowed: true, kind: 'custom', status: 'draft' },
      { allowed: true, kind: 'custom', status: 'sent' },
      { allowed: true, kind: 'custom', status: 'accepted' },
      {
        allowed: false,
        kind: 'custom',
        message: 'Rejected or cancelled quotes cannot start a Job.',
        status: 'rejected',
      },
      {
        allowed: false,
        kind: 'custom',
        message: 'Rejected or cancelled quotes cannot start a Job.',
        status: 'cancelled',
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      const quote =
        testCase.kind === 'product'
          ? await createQuote(context.db, {
              productId: context.catalog.product.id,
              status: testCase.status,
            })
          : await createCustomQuote(context.db, {
              status: testCase.status,
              workTitle: `Custom status matrix ${index}`,
            });
      const attempt = createJob({
        actorUserId,
        db: context.db,
        input: { baySeeds: [], quoteId: quote.id },
      });

      if (testCase.allowed) {
        await expect(attempt).resolves.toMatchObject({
          quoteId: quote.id,
          quoteKind: testCase.kind,
        });
      } else {
        await expect(attempt).rejects.toThrow(testCase.message);
      }
    }
  });

  test('creates a Rework Job on the allocated Unit for only the Assemblies being added', async ({ context }) => {
    const stockBuild = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], buildSpecAssemblyIds: [], productId: context.catalog.product.id },
    });
    const [unit] = await context.db.select().from(productUnits);
    if (!unit) throw new Error('Stock Build test setup did not return a Product Unit');
    await context.db.update(productUnits).set({ vinNumber: 'VIN-REWORK-1' }).where(eq(productUnits.id, unit.id));

    const storage = new InMemoryStorageAdapter();
    await makeBrochureComplete(context.db, storage, context.catalog.product.id);
    await createProductDocuments(context.db, context.catalog.product.id, [
      { filename: 'Part Book.pdf', storageKey: 'documents/product/rework-part-book.pdf' },
    ]);
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      productUnitId: unit.id,
      selectedAssemblyId: context.catalog.heavyAxle.id,
      status: 'accepted',
    });
    await context.db.insert(productUnitOwnershipTransfers).values({
      actorUserId,
      occurredOn: getPlantDateNow(),
      productUnitId: unit.id,
      sourceQuoteId: quote.id,
      toCustomerId: quote.customerId,
    });
    const bay = await createBay(context.db, { department: 'assembly' });
    let rendererCalls = 0;
    const renderer: BrochurePdfRenderer = async () => {
      rendererCalls += 1;

      return BROCHURE_PDF_BYTES;
    };

    const rework = await createJob({
      actorUserId,
      brochureRenderer: renderer,
      db: context.db,
      input: { baySeeds: [{ bayId: bay.id, durationDays: 2 }], quoteId: quote.id },
      storage,
    });

    expect(rework).toMatchObject({
      customerCompanyName: 'CFO Test Customer',
      productUnit: {
        productSerialNumber: stockBuild.productUnit?.productSerialNumber,
        vinNumber: 'VIN-REWORK-1',
      },
      quoteId: quote.id,
    });
    expect(rework.cfo).toEqual([
      {
        assemblyName: 'Heavy Axle Upgrade',
        kind: 'optional',
        parts: [
          expect.objectContaining({
            partCode: 'PART-HEAVY-AXLE',
            quantity: 1,
          }),
        ],
      },
    ]);
    await expect(
      context.db.select().from(jobEstimateSnapshots).where(eq(jobEstimateSnapshots.jobId, rework.id)),
    ).resolves.toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          assemblies: [expect.objectContaining({ assemblyName: 'Heavy Axle Upgrade' })],
          laborHours: [],
          materialLines: [],
          missing: expect.objectContaining({ unattributedProductTerms: true }),
          scope: 'rework',
        }),
      }),
    ]);
    expect(rework.documents).toEqual([]);
    expect(rendererCalls).toBe(0);
    expect(
      rework.schedule.flatMap((department) => department.bays).find((scheduledBay) => scheduledBay.id === bay.id)
        ?.slots,
    ).toHaveLength(1);

    await expect(context.db.select().from(productUnits)).resolves.toHaveLength(1);
    await expect(context.db.select().from(productUnitOwnershipTransfers)).resolves.toHaveLength(1);
    await expect(context.db.select().from(productSerialSequences)).resolves.toMatchObject([
      { lastSequence: 1, productId: context.catalog.product.id },
    ]);
    await expect(context.db.select().from(jobs).where(eq(jobs.id, rework.id))).resolves.toMatchObject([
      { productUnitId: unit.id, quoteId: quote.id },
    ]);
    await expect(
      context.db
        .select({
          assemblyName: jobBuildSpecAssemblies.assemblyName,
          productAssemblyId: jobBuildSpecAssemblies.productAssemblyId,
        })
        .from(jobBuildSpecAssemblies)
        .where(eq(jobBuildSpecAssemblies.jobId, rework.id)),
    ).resolves.toEqual([
      {
        assemblyName: 'Heavy Axle Upgrade',
        productAssemblyId: context.catalog.heavyAxle.id,
      },
    ]);

    const unitAfterRework = await getProductUnit({ db: context.db, id: unit.id });
    expect(unitAfterRework.asBuiltSpec.map((assembly) => assembly.name)).toEqual(['Heavy Axle Upgrade']);
  });

  test('does not create Rework when the Allocation Quote adds nothing to the Unit', async ({ context }) => {
    await createJob({
      actorUserId,
      db: context.db,
      input: {
        baySeeds: [],
        buildSpecAssemblyIds: [context.catalog.heavyAxle.id],
        productId: context.catalog.product.id,
      },
    });
    const [unit] = await context.db.select({ id: productUnits.id }).from(productUnits);
    if (!unit) throw new Error('Stock Build test setup did not return a Product Unit');
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      productUnitId: unit.id,
      selectedAssemblyId: context.catalog.heavyAxle.id,
      status: 'accepted',
    });

    await expect(
      createJob({
        actorUserId,
        db: context.db,
        input: { baySeeds: [], quoteId: quote.id },
      }),
    ).rejects.toThrow('Allocation Quote has no new Assemblies to fit.');
    await expect(context.db.select().from(jobs)).resolves.toHaveLength(1);
  });

  test('seeds work slots across Bays in input order, including duplicate Bay rows', async ({ context }) => {
    const fabricationBay = await createBay(context.db, { department: 'fabrication' });
    const paintBay = await createBay(context.db, { department: 'paint' });
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    const job = await createJob({
      actorUserId,
      db: context.db,
      input: {
        baySeeds: [
          { bayId: fabricationBay.id, durationDays: 2 },
          { bayId: paintBay.id, durationDays: 3 },
          { bayId: fabricationBay.id, durationDays: 1 },
        ],
        quoteId: quote.id,
      },
    });

    const fabricationSlots = await context.db
      .select()
      .from(jobSlots)
      .where(eq(jobSlots.bayId, fabricationBay.id))
      .orderBy(asc(jobSlots.sequence));
    const paintSlots = await context.db
      .select()
      .from(jobSlots)
      .where(eq(jobSlots.bayId, paintBay.id))
      .orderBy(asc(jobSlots.sequence));

    expect(fabricationSlots).toMatchObject([
      { durationDays: 2, jobId: job.id, kind: 'work', sequence: 1 },
      { durationDays: 1, jobId: job.id, kind: 'work', sequence: 2 },
    ]);
    expect(paintSlots).toMatchObject([{ durationDays: 3, jobId: job.id, kind: 'work', sequence: 1 }]);
    expect(
      job.schedule.flatMap((department) => department.bays).find((bay) => bay.id === fabricationBay.id)?.slots,
    ).toHaveLength(2);
  });

  test('returns operator and day breakdown on Job detail schedule slots', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-05',
    });
    const operator = await createTestUser(context.db, {
      email: 'schedule.operator@example.com',
      id: 'schedule-operator-user-id',
      name: 'Schedule Operator',
      role: 'bay-operator',
    });
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    await assignJobBayOperator({
      actorUserId,
      db: context.db,
      input: { bayId: bay.id, operatorUserId: operator.id },
    });
    await toggleOffDay({
      db: context.db,
      input: offDayInput({ date: '2026-06-06', isOffDay: true, label: 'Shutdown' }),
    });
    await toggleOffDay({
      db: context.db,
      input: offDayInput({ date: '2026-06-07', isOffDay: true, label: 'Sunday shutdown' }),
    });
    await addBayCalendarException({
      db: context.db,
      input: bayExceptionInput({ bayId: bay.id, date: '2026-06-06', direction: 'work', label: 'Saturday push' }),
    });

    const job = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [{ bayId: bay.id, durationDays: 3 }], quoteId: quote.id },
    });
    const detail = await getJob({ db: context.db, id: job.id });

    expect(detail.schedule.find((department) => department.department === 'fabrication')?.bays).toMatchObject([
      {
        id: bay.id,
        slots: [
          {
            dayBreakdown: {
              closureDays: 1,
              overtimeDays: 1,
              workingDays: 3,
            },
            endDate: '2026-06-09',
            operator: {
              email: 'schedule.operator@example.com',
              id: operator.id,
              name: 'Schedule Operator',
            },
            startDate: '2026-06-05',
          },
        ],
      },
    ]);
  });

  test('auto-inserts an idle gap before a seeded slot when the Bay queue ended in the past', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-01',
    });
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    const job = await createJob({
      actorUserId,
      db: context.db,
      input: {
        baySeeds: [{ bayId: bay.id, durationDays: 1 }],
        quoteId: quote.id,
      },
    });

    const slots = await context.db
      .select()
      .from(jobSlots)
      .where(eq(jobSlots.bayId, bay.id))
      .orderBy(asc(jobSlots.sequence));
    expect(slots).toMatchObject([
      { durationDays: 4, jobId: null, kind: 'idle', sequence: 1 },
      { durationDays: 1, jobId: job.id, kind: 'work', sequence: 2 },
    ]);
  });

  test('rejects disabled Bay seeds and rolls back the created Job', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    await context.db.update(jobBays).set({ disabledAt: new Date() }).where(eq(jobBays.id, bay.id));
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    await expect(
      createJob({
        actorUserId,
        db: context.db,
        input: {
          baySeeds: [{ bayId: bay.id, durationDays: 1 }],
          quoteId: quote.id,
        },
      }),
    ).rejects.toThrow('This Bay is disabled and cannot accept new bookings.');
    await expect(context.db.select().from(jobs)).resolves.toHaveLength(0);
    await expect(context.db.select().from(jobSlots)).resolves.toHaveLength(0);
  });

  test('rejects missing Bay seeds and rolls back the created Job', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    await expect(
      createJob({
        actorUserId,
        db: context.db,
        input: {
          baySeeds: [{ bayId: '00000000-0000-4000-8000-00000000dead', durationDays: 1 }],
          quoteId: quote.id,
        },
      }),
    ).rejects.toThrow('Job bay not found: 00000000-0000-4000-8000-00000000dead');
    await expect(context.db.select().from(jobs)).resolves.toHaveLength(0);
    await expect(context.db.select().from(jobSlots)).resolves.toHaveLength(0);
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
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });

    expect(job.cfo.map((entry) => entry.assemblyName)).toEqual([
      'B Standard',
      'A Standard',
      'B Optional',
      'A Optional',
    ]);

    // The Build Spec keeps the Quote's own selection order; the CFO applies the catalog's display order.
    const buildSpecRows = await context.db
      .select({ assemblyName: jobBuildSpecAssemblies.assemblyName, sequence: jobBuildSpecAssemblies.sequence })
      .from(jobBuildSpecAssemblies)
      .where(eq(jobBuildSpecAssemblies.jobId, job.id))
      .orderBy(asc(jobBuildSpecAssemblies.sequence));
    expect(buildSpecRows).toEqual([
      { assemblyName: 'A Optional', sequence: 0 },
      { assemblyName: 'B Optional', sequence: 1 },
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

    const reread = await getJob({ db: context.db, id: job.id });
    expect(reread.cfo.map((entry) => entry.assemblyName)).toEqual([
      'B Standard',
      'A Standard',
      'B Optional',
      'A Optional',
    ]);
  });

  test('snapshots product documents onto the job as frozen rows with product provenance', async ({ context }) => {
    const drawingStorageKey = 'documents/product/source/fabrication-drawings.zip';
    const drawingBytes = drawingZipBytes();
    await jobStorage.put({
      body: drawingBytes,
      byteSize: drawingBytes.byteLength,
      contentType: 'application/zip',
      key: drawingStorageKey,
    });
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
      {
        contentType: 'application/zip',
        filename: 'Fabrication Drawings.zip',
        storageKey: drawingStorageKey,
        type: 'drawing',
      },
    ]);
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    const job = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });

    const snapshotRows = await context.db.select().from(documents).where(eq(documents.jobId, job.id));

    expect(snapshotRows).toHaveLength(3);
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
        expect.objectContaining({
          contentType: 'application/zip',
          filename: 'Fabrication Drawings.zip',
          jobId: job.id,
          metadata: { type: 'drawing' },
          ownerType: 'job',
          productId: null,
          sourceProductId: context.catalog.product.id,
          storageKey: sourceDocuments[2]?.storageKey,
          uploaderUserId: actorUserId,
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
        expect.objectContaining({
          contentType: 'application/zip',
          filename: 'Fabrication Drawings.zip',
          metadata: { type: 'drawing' },
          ownerType: 'job',
          sourceProductId: context.catalog.product.id,
          sourceProductName: 'CFO Test Product',
          uploaderUserId: actorUserId,
        }),
      ]),
    );
    expect(jobStorage.objects.get(drawingStorageKey)).toEqual({
      body: drawingBytes,
      byteSize: drawingBytes.byteLength,
      contentType: 'application/zip',
    });
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
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
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
        type: 'sop',
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
        metadata: { type: 'sop' },
        ownerType: 'product',
        storageKey: 'documents/product/source/replacement-part-book.pdf',
      }),
    ]);
  });

  test('generates the Brochure from live config and saves it as a standalone Job Document', async ({ context }) => {
    const storage = new InMemoryStorageAdapter();
    await makeBrochureComplete(context.db, storage, context.catalog.product.id);
    const renderedBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x42]);
    let rendererCalls = 0;
    const renderer: BrochurePdfRenderer = async () => {
      rendererCalls += 1;

      return renderedBytes;
    };
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    const job = await createJob({
      actorUserId,
      brochureRenderer: renderer,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
      storage,
    });

    expect(rendererCalls).toBe(1);
    const brochureRows = await context.db
      .select()
      .from(documents)
      .where(eq(documents.jobId, job.id))
      .then((rows) => rows.filter((row) => 'type' in row.metadata && row.metadata.type === 'brochure'));
    expect(brochureRows).toHaveLength(1);
    const [brochureRow] = brochureRows;
    expect(brochureRow).toMatchObject({
      contentType: 'application/pdf',
      filename: 'CFO-001-brochure.pdf',
      jobId: job.id,
      metadata: { type: 'brochure' },
      ownerType: 'job',
      productId: null,
      sourceProductId: context.catalog.product.id,
      uploaderUserId: actorUserId,
    });
    // The generated bytes are persisted to storage under the job-owned key.
    const stored = storage.objects.get(brochureRow?.storageKey ?? '');
    expect(stored?.body).toEqual(renderedBytes);
    // Saving through the document service records the creation in the document audit trail.
    const documentAudit = await context.db.select().from(auditEvents).where(eq(auditEvents.entityType, 'document'));
    expect(documentAudit).toMatchObject([{ action: 'created', actorUserId, entityId: brochureRow?.id }]);
    expect(job.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: 'CFO-001-brochure.pdf',
          metadata: { type: 'brochure' },
          ownerType: 'job',
          sourceProductId: context.catalog.product.id,
          sourceProductName: 'CFO Test Product',
        }),
      ]),
    );
  });

  test('does not create a Brochure Job Document when the brochure config is incomplete', async ({ context }) => {
    const storage = new InMemoryStorageAdapter();
    let rendererCalls = 0;
    const renderer: BrochurePdfRenderer = async () => {
      rendererCalls += 1;

      return BROCHURE_PDF_BYTES;
    };
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    const job = await createJob({
      actorUserId,
      brochureRenderer: renderer,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
      storage,
    });

    expect(rendererCalls).toBe(0);
    const snapshotRows = await context.db.select().from(documents).where(eq(documents.jobId, job.id));
    expect(snapshotRows).toHaveLength(0);
    expect(storage.objects.size).toBe(0);
  });

  test('keeps the saved Brochure Job Document frozen when the product brochure config later changes', async ({
    context,
  }) => {
    const storage = new InMemoryStorageAdapter();
    await makeBrochureComplete(context.db, storage, context.catalog.product.id);
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    const job = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
      storage,
    });

    const before = await readJobBrochure(context.db, storage, job.id);

    // Edit the product's brochure config after the job is created.
    await context.db
      .update(products)
      .set({ category: 'A Completely Different Category', keyFeatures: ['New feature copy'] })
      .where(eq(products.id, context.catalog.product.id));

    const after = await readJobBrochure(context.db, storage, job.id);
    expect(after.storageKey).toBe(before.storageKey);
    expect(after.body).toEqual(before.body);
  });

  test('rejects a quote that has not been accepted', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'sent',
    });

    await expect(
      createJob({
        actorUserId,
        db: context.db,
        input: { baySeeds: [], quoteId: quote.id },
      }),
    ).rejects.toThrow('Only accepted quotes can start a Job.');
  });

  test('rejects a second job for the same quote', async ({ context }) => {
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });

    await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });

    await expect(
      createJob({
        actorUserId,
        db: context.db,
        input: { baySeeds: [], quoteId: quote.id },
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
        actorUserId,
        db: context.db,
        input: { baySeeds: [], quoteId: quote.id },
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
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: firstQuote.id },
    });
    const secondJob = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: secondQuote.id },
    });
    const otherProductJob = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: otherProductQuote.id },
    });

    expect(firstJob.productUnit?.productSerialNumber).toBe('CFO-001260001');
    expect(secondJob.productUnit?.productSerialNumber).toBe('CFO-001260002');
    expect(otherProductJob.productUnit?.productSerialNumber).toBe('ALT-001260001');
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

    vi.setSystemTime(new Date('2026-12-31T23:30:00.000+02:00'));
    const firstJob = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: firstQuote.id },
    });
    vi.setSystemTime(new Date('2027-01-01T00:30:00.000+02:00'));
    const secondJob = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: secondQuote.id },
    });

    expect(firstJob.productUnit?.productSerialNumber).toBe('CFO-001260009');
    expect(secondJob.productUnit?.productSerialNumber).toBe('CFO-001270010');
  });
});

describe('Job Bay management', () => {
  test('creates Bays with immutable Department facts and audit', async ({ context }) => {
    const result = await createJobBay({
      actorUserId,
      db: context.db,
      input: JobBayCreateInput.parse({ department: 'paint', name: '  Paint Bay 1  ' }),
    });

    const [bayRows, events] = await Promise.all([
      context.db.select().from(jobBays).where(eq(jobBays.id, result.bay.id)),
      context.db.select().from(auditEvents).where(eq(auditEvents.entityType, 'job_bay')),
    ]);

    expect(result.bay).toMatchObject({
      department: 'paint',
      disabledAt: null,
      name: 'Paint Bay 1',
    });
    expect(bayRows).toMatchObject([{ department: 'paint', name: 'Paint Bay 1' }]);
    expect(events).toMatchObject([
      {
        action: 'created',
        actorUserId,
        entityId: result.bay.id,
        entityType: 'job_bay',
        summary: 'Created Bay "Paint Bay 1"',
      },
    ]);
  });

  test('renames Bays without changing Department and audits the update', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'assembly' });

    const result = await renameJobBay({
      actorUserId,
      db: context.db,
      input: JobBayRenameInput.parse({ id: bay.id, name: '  Final Assembly Bay  ' }),
    });
    const events = await context.db.select().from(auditEvents).where(eq(auditEvents.entityType, 'job_bay'));

    expect(result.bay).toMatchObject({
      department: 'assembly',
      name: 'Final Assembly Bay',
    });
    expect(events).toMatchObject([
      {
        action: 'updated',
        entityId: bay.id,
        summary: 'Renamed Bay "assembly Test Bay" to "Final Assembly Bay"',
      },
    ]);
    expect(events[0]?.changes).toMatchObject({
      name: {
        from: 'assembly Test Bay',
        to: 'Final Assembly Bay',
      },
    });
  });

  test('disables, excludes from enabled reads, rejects new bookings, and preserves projection', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const quote = await createQuote(context.db, {
      productId: context.catalog.product.id,
      status: 'accepted',
    });
    const job = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], quoteId: quote.id },
    });

    await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 2, jobId: job.id },
    });
    const disabled = await setJobBayDisabled({
      actorUserId,
      db: context.db,
      input: { disabled: true, id: bay.id },
    });

    expect(disabled.bay.disabledAt).not.toBeNull();
    await expect(listJobBays({ db: context.db, input: { filters: {} } })).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ disabledAt: expect.any(String), id: bay.id })]),
    });
    const enabledBays = await listJobBays({ db: context.db, input: { filters: { isDisabled: false } } });
    expect(enabledBays.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: bay.id })]));
    await expect(
      bookJobSlot({
        db: context.db,
        input: { bayId: bay.id, durationDays: 1, jobId: job.id },
      }),
    ).rejects.toThrow('This Bay is disabled and cannot accept new bookings.');

    const schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, bay.id)).toMatchObject({
      disabledAt: expect.any(String),
      slots: [
        expect.objectContaining({
          jobId: job.id,
          kind: 'work',
        }),
      ],
    });
  });

  test('re-enables disabled Bays and returns them to enabled reads', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'supply' });

    await setJobBayDisabled({
      actorUserId,
      db: context.db,
      input: { disabled: true, id: bay.id },
    });
    const enabled = await setJobBayDisabled({
      actorUserId,
      db: context.db,
      input: { disabled: false, id: bay.id },
    });

    expect(enabled.bay.disabledAt).toBeNull();
    await expect(listJobBays({ db: context.db, input: { filters: { isDisabled: false } } })).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ disabledAt: null, id: bay.id })]),
    });
  });

  test('assigns and unassigns Bay Operators through open interval rows with audit', async ({ context }) => {
    const firstBay = await createBay(context.db, { department: 'fabrication' });
    const secondBay = await createBay(context.db, { department: 'paint' });
    const operator = await createTestUser(context.db, {
      email: 'operator@example.com',
      id: 'operator-user-id',
      name: 'Operator User',
      role: 'bay-operator',
    });

    await expect(listBayOperators({ db: context.db })).resolves.toEqual({
      operators: [
        {
          email: 'operator@example.com',
          id: operator.id,
          name: 'Operator User',
          thumbnailDataUrl: null,
        },
      ],
    });

    const assigned = await assignJobBayOperator({
      actorUserId,
      db: context.db,
      input: { bayId: firstBay.id, operatorUserId: operator.id },
    });
    await expect(
      assignJobBayOperator({
        actorUserId,
        db: context.db,
        input: { bayId: secondBay.id, operatorUserId: operator.id },
      }),
    ).resolves.toMatchObject({
      bay: {
        currentOperator: {
          id: operator.id,
        },
        id: secondBay.id,
      },
    });

    expect(assigned.bay.currentOperator).toMatchObject({
      email: 'operator@example.com',
      id: operator.id,
      name: 'Operator User',
    });
    await expect(listJobBays({ db: context.db, input: { filters: {} } })).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          currentOperator: expect.objectContaining({ id: operator.id }),
          id: firstBay.id,
        }),
      ]),
    });
    await expect(listBays({ db: context.db })).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          currentOperator: expect.objectContaining({ id: operator.id }),
          id: firstBay.id,
        }),
      ]),
    });

    await expect(
      assignJobBayOperator({
        actorUserId,
        db: context.db,
        input: { bayId: firstBay.id, operatorUserId: operator.id },
      }),
    ).rejects.toThrow('Bay already has a current operator.');

    const unassigned = await unassignJobBayOperator({
      actorUserId,
      db: context.db,
      input: { bayId: firstBay.id },
    });
    const events = await context.db.select().from(auditEvents).where(eq(auditEvents.entityType, 'job_bay'));

    expect(unassigned.bay.currentOperator).toBeNull();
    expect(events.filter((event) => event.entityId === firstBay.id)).toMatchObject([
      {
        action: 'updated',
        summary: `Updated Bay "${firstBay.name}"`,
      },
      {
        action: 'updated',
        summary: `Updated Bay "${firstBay.name}"`,
      },
    ]);
  });

  test('rejects non-Bay-Operator users and missing current assignments', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const salesUser = await createTestUser(context.db, {
      email: 'sales@example.com',
      id: 'sales-user-id',
      name: 'Sales User',
      role: 'sales',
    });

    await expect(
      assignJobBayOperator({
        actorUserId,
        db: context.db,
        input: { bayId: bay.id, operatorUserId: salesUser.id },
      }),
    ).rejects.toThrow('Only Bay Operator users can be assigned to Bays.');
    await expect(
      unassignJobBayOperator({
        actorUserId,
        db: context.db,
        input: { bayId: bay.id },
      }),
    ).rejects.toThrow(`Bay has no current operator assignment: ${bay.id}`);
  });

  test('rejects assigning Bay Operators to disabled Bays', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const operator = await createTestUser(context.db, {
      email: 'operator@example.com',
      id: 'operator-user-id',
      name: 'Operator User',
      role: 'bay-operator',
    });

    await setJobBayDisabled({
      actorUserId,
      db: context.db,
      input: { disabled: true, id: bay.id },
    });

    await expect(
      assignJobBayOperator({
        actorUserId,
        db: context.db,
        input: { bayId: bay.id, operatorUserId: operator.id },
      }),
    ).rejects.toThrow('This Bay is disabled and cannot accept new operator assignments.');
  });

  test('lists Bay Operator assignment history newest first for one Bay', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const otherBay = await createBay(context.db, { department: 'paint' });
    const firstOperator = await createTestUser(context.db, {
      email: 'first.operator@example.com',
      id: 'first-operator-user-id',
      name: 'First Operator',
      role: 'bay-operator',
    });
    const secondOperator = await createTestUser(context.db, {
      email: 'second.operator@example.com',
      id: 'second-operator-user-id',
      name: 'Second Operator',
      role: 'bay-operator',
    });
    const assignedAt = new Date('2026-06-05T07:00:00.000Z');

    await context.db.insert(jobBayOperatorAssignments).values([
      {
        assignedAt,
        bayId: bay.id,
        id: '00000000-0000-4000-8000-000000000101',
        operatorUserId: firstOperator.id,
        unassignedAt: new Date('2026-06-05T08:00:00.000Z'),
      },
      {
        assignedAt,
        bayId: bay.id,
        id: '00000000-0000-4000-8000-000000000102',
        operatorUserId: secondOperator.id,
        unassignedAt: new Date('2026-06-05T09:00:00.000Z'),
      },
      {
        assignedAt: new Date('2026-06-06T07:00:00.000Z'),
        bayId: otherBay.id,
        id: '00000000-0000-4000-8000-000000000103',
        operatorUserId: secondOperator.id,
        unassignedAt: null,
      },
    ]);

    await expect(
      listBayOperatorAssignmentHistory({
        db: context.db,
        input: { bayId: bay.id },
      }),
    ).resolves.toEqual({
      items: [
        {
          assignedAt: '2026-06-05T07:00:00.000Z',
          id: '00000000-0000-4000-8000-000000000102',
          operator: {
            email: 'second.operator@example.com',
            id: secondOperator.id,
            name: 'Second Operator',
            thumbnailDataUrl: null,
          },
          unassignedAt: '2026-06-05T09:00:00.000Z',
        },
        {
          assignedAt: '2026-06-05T07:00:00.000Z',
          id: '00000000-0000-4000-8000-000000000101',
          operator: {
            email: 'first.operator@example.com',
            id: firstOperator.id,
            name: 'First Operator',
            thumbnailDataUrl: null,
          },
          unassignedAt: '2026-06-05T08:00:00.000Z',
        },
      ],
    });
  });

  test('returns empty Bay Operator assignment history for an existing Bay', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });

    await expect(
      listBayOperatorAssignmentHistory({
        db: context.db,
        input: { bayId: bay.id },
      }),
    ).resolves.toEqual({ items: [] });
  });

  test('rejects Bay Operator assignment history reads for missing Bays', async ({ context }) => {
    await expect(
      listBayOperatorAssignmentHistory({
        db: context.db,
        input: { bayId: '00000000-0000-4000-8000-00000000dead' },
      }),
    ).rejects.toThrow('Job bay not found: 00000000-0000-4000-8000-00000000dead');
  });
});

describe('updateJob', () => {
  test('rejects field updates for cancelled Jobs', async ({ context }) => {
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, job.id));

    await expect(
      updateJob({
        actorUserId,
        db: context.db,
        input: { completedOn: null, description: 'Should not save', id: job.id },
      }),
    ).rejects.toMatchObject({ code: 'job.cancelled', metadata: { id: job.id } });
  });

  test('stores a manual completion date and clears it again', async ({ context }) => {
    const job = await createAcceptedJob(context.db, context.catalog.product.id);

    const completed = await updateJob({
      actorUserId,
      db: context.db,
      input: {
        completedOn: DateOnlyIso.parse('2026-05-04'),
        description: null,
        id: job.id,
      },
    });

    expect(completed.job.completedOn).toBe('2026-05-04');

    const reopened = await updateJob({
      actorUserId,
      db: context.db,
      input: { completedOn: null, description: null, id: job.id },
    });

    expect(reopened.job.completedOn).toBeNull();
  });

  test('answers an update with the machine identity the reads report', async ({ context }) => {
    const job = await createAcceptedJob(context.db, context.catalog.product.id);

    const updated = await updateJob({
      actorUserId,
      db: context.db,
      input: JobUpdateInput.parse({ id: job.id, description: 'Fit toolbox' }),
    });
    const read = await getJob({ db: context.db, id: job.id });

    // A response that null'd the machine would contradict the very next list or detail read.
    expect(updated.job.productUnit).toEqual(read.productUnit);
    expect(updated.job.productUnit).not.toBeNull();
  });

  test('answers a no-op update with the machine identity too', async ({ context }) => {
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const input = JobUpdateInput.parse({ id: job.id, description: null });

    // Same payload twice: the second changes nothing and takes the early return.
    await updateJob({ actorUserId, db: context.db, input });
    const unchanged = await updateJob({ actorUserId, db: context.db, input });

    expect(unchanged.job.productUnit?.productSerialNumber).toBe(job.productUnit?.productSerialNumber);
    expect(unchanged.job.productUnit?.productId).toBe(context.catalog.product.id);
  });

  test('preserves a stored completion date when the payload omits it', async ({ context }) => {
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    await context.db.update(jobs).set({ completedOn: '2026-05-04' }).where(eq(jobs.id, job.id));

    const result = await updateJob({
      actorUserId,
      db: context.db,
      input: JobUpdateInput.parse({ id: job.id, description: null }),
    });

    expect(result.job.completedOn).toBe('2026-05-04');
  });

  test('rejects a completion date after plant today', async ({ context }) => {
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const tomorrow = addDateOnlyDays(getPlantDateNow(), 1);

    await expect(
      updateJob({
        actorUserId,
        db: context.db,
        input: { completedOn: tomorrow, description: null, id: job.id },
      }),
    ).rejects.toMatchObject({ code: 'job.completed_on_in_future' });
  });
});

describe('sweepJobCompletions', () => {
  test('stamps a finished Job with its last work day and audits it as the system', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-05' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    // Spans 2026-06-05 and 2026-06-06; the half-open span ends 2026-06-07, so the last work day is the 6th.
    await bookJobSlot({ db: context.db, input: { bayId: bay.id, durationDays: 2, jobId: job.id } });

    // Plant today moves past the Slot, so every Work Slot projects as done.
    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));

    expect(await sweepJobCompletions({ db: context.db })).toEqual({ completed: 1, considered: 1 });

    const [row] = await context.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row?.completedOn).toBe('2026-06-06');

    const events = await context.db.select().from(auditEvents).where(eq(auditEvents.entityId, job.id));
    expect(events).toContainEqual(
      expect.objectContaining({
        action: 'updated',
        actorUserId: null,
        changes: expect.objectContaining({ completedOn: { from: null, to: '2026-06-06' } }),
        entityType: 'job',
      }),
    );
  });

  test('derives the date across every Bay the Job spans, under the Bay locks', async ({ context }) => {
    const firstBay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-05' });
    const secondBay = await createBay(context.db, { department: 'paint', scheduleOrigin: '2026-06-05' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    // [06-05, 06-07) in fabrication and [06-05, 06-09) in paint: the later Bay sets the date.
    await bookJobSlot({ db: context.db, input: { bayId: firstBay.id, durationDays: 2, jobId: job.id } });
    await bookJobSlot({ db: context.db, input: { bayId: secondBay.id, durationDays: 4, jobId: job.id } });

    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));

    expect(await sweepJobCompletions({ db: context.db })).toEqual({ completed: 1, considered: 1 });

    const [row] = await context.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row?.completedOn).toBe('2026-06-08');
  });

  test('leaves a Job whose other Bay is still unfinished alone', async ({ context }) => {
    const doneBay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-05' });
    const openBay = await createBay(context.db, { department: 'paint', scheduleOrigin: '2026-06-05' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    await bookJobSlot({ db: context.db, input: { bayId: doneBay.id, durationDays: 2, jobId: job.id } });
    await bookJobSlot({ db: context.db, input: { bayId: openBay.id, durationDays: 30, jobId: job.id } });

    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));

    expect(await sweepJobCompletions({ db: context.db })).toEqual({ completed: 0, considered: 1 });

    const [row] = await context.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row?.completedOn).toBeNull();
  });

  test('leaves a Job with an unfinished Slot alone', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-01' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    await bookJobSlot({ db: context.db, input: { bayId: bay.id, durationDays: 30, jobId: job.id } });

    expect(await sweepJobCompletions({ db: context.db })).toEqual({ completed: 0, considered: 1 });

    const [row] = await context.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row?.completedOn).toBeNull();
  });

  test('skips unscheduled and cancelled Jobs', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-01' });
    await createAcceptedJob(context.db, context.catalog.product.id);
    const cancelled = await createAcceptedJob(context.db, context.catalog.product.id);
    await bookJobSlot({ db: context.db, input: { bayId: bay.id, durationDays: 2, jobId: cancelled.id } });
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, cancelled.id));

    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));

    expect(await sweepJobCompletions({ db: context.db })).toEqual({ completed: 0, considered: 0 });
  });

  test('never overwrites an existing completion date', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-01' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    await bookJobSlot({ db: context.db, input: { bayId: bay.id, durationDays: 2, jobId: job.id } });
    await updateJob({
      actorUserId,
      db: context.db,
      input: {
        completedOn: DateOnlyIso.parse('2026-06-03'),
        description: null,
        id: job.id,
      },
    });

    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));

    expect(await sweepJobCompletions({ db: context.db })).toEqual({ completed: 0, considered: 0 });

    const [row] = await context.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row?.completedOn).toBe('2026-06-03');
  });
});

describe('bookJobSlot', () => {
  test('appends slots to the back of a bay queue and returns projected dates', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-05',
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);

    const firstSlot = await bookJobSlot({
      db: context.db,
      input: {
        bayId: bay.id,
        durationDays: 1,
        jobId: firstJob.id,
      },
    });
    const secondSlot = await bookJobSlot({
      db: context.db,
      input: {
        bayId: bay.id,
        durationDays: 2,
        jobId: secondJob.id,
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

    const schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, bay.id)).toEqual(
      expect.objectContaining({
        nextAvailableDate: '2026-06-08',
        slots: [
          expect.objectContaining({
            id: firstSlot.slot.id,
            jobCode: firstJob.code,
            sequence: 1,
            startDate: '2026-06-05',
            endDate: '2026-06-06',
          }),
          expect.objectContaining({
            id: secondSlot.slot.id,
            jobCode: secondJob.code,
            sequence: 2,
            startDate: '2026-06-06',
            endDate: '2026-06-08',
          }),
        ],
      }),
    );
  });

  test('allows the same Job to be booked more than once', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const jobId = job.id;

    await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId },
    });
    await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId },
    });

    const schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, bay.id).slots.map((slot) => slot.jobId)).toEqual([jobId, jobId]);
  });

  test('rejects bookings for cancelled jobs', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, job.id));

    await expect(
      bookJobSlot({
        db: context.db,
        input: { bayId: bay.id, durationDays: 1, jobId: job.id },
      }),
    ).rejects.toMatchObject({ code: 'job.cancelled', metadata: { id: job.id } });

    await expect(context.db.select().from(jobSlots).where(eq(jobSlots.jobId, job.id))).resolves.toEqual([]);
  });

  test('allows a job to be booked onto any bay department', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'paint' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);

    await expect(
      bookJobSlot({
        db: context.db,
        input: {
          bayId: bay.id,
          durationDays: 1,
          jobId: job.id,
        },
      }),
    ).resolves.toMatchObject({
      slot: {
        bayId: bay.id,
        jobId: job.id,
      },
    });
  });

  test('inserts an explicit idle slot before new work when the queue ended in the past', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-05',
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);

    const firstSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: firstJob.id },
    });
    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));
    const secondSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 2, jobId: secondJob.id },
    });

    const schedule = await listBays({ db: context.db, input: { from: DateOnlyIso.parse('2026-06-05') } });
    expect(getProjectedBayQueue(schedule, bay.id)).toEqual(
      expect.objectContaining({
        nextAvailableDate: '2026-06-12',
        slots: [
          expect.objectContaining({
            id: firstSlot.slot.id,
            kind: 'work',
            startDate: '2026-06-05',
            endDate: '2026-06-06',
          }),
          expect.objectContaining({
            durationDays: 4,
            jobId: null,
            kind: 'idle',
            label: null,
            sequence: 2,
            startDate: '2026-06-06',
            endDate: '2026-06-10',
          }),
          expect.objectContaining({
            id: secondSlot.slot.id,
            kind: 'work',
            sequence: 3,
            startDate: '2026-06-10',
            endDate: '2026-06-12',
          }),
        ],
      }),
    );
  });

  test('derives plant today from Africa/Johannesburg, not the server clock day', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-05',
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);

    await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: firstJob.id },
    });
    // 23:30 UTC on Jun 9 is already Jun 10 in Johannesburg, so the idle gap runs through Jun 9.
    vi.setSystemTime(new Date('2026-06-09T23:30:00.000Z'));
    const secondSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: secondJob.id },
    });

    const schedule = await listBays({ db: context.db, input: { from: DateOnlyIso.parse('2026-06-05') } });
    expect(getProjectedBayQueue(schedule, bay.id).slots).toEqual([
      expect.objectContaining({ kind: 'work', startDate: '2026-06-05', endDate: '2026-06-06' }),
      expect.objectContaining({ durationDays: 4, kind: 'idle', startDate: '2026-06-06', endDate: '2026-06-10' }),
      expect.objectContaining({
        id: secondSlot.slot.id,
        kind: 'work',
        startDate: '2026-06-10',
        endDate: '2026-06-11',
      }),
    ]);
  });

  test('counts auto-inserted idle gaps in working days from persisted Off-Days', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-05',
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    await toggleOffDay({
      db: context.db,
      input: offDayInput({ date: '2026-06-06', isOffDay: true, label: null }),
    });
    await toggleOffDay({
      db: context.db,
      input: offDayInput({ date: '2026-06-07', isOffDay: true, label: null }),
    });

    await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: firstJob.id },
    });
    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));
    await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: secondJob.id },
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
      scheduleOrigin: '2026-06-05',
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    await toggleOffDay({
      db: context.db,
      input: offDayInput({ date: '2026-06-06', isOffDay: true, label: null }),
    });
    await toggleOffDay({
      db: context.db,
      input: offDayInput({ date: '2026-06-07', isOffDay: true, label: null }),
    });

    await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: firstJob.id },
    });
    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));
    await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: secondJob.id },
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
      scheduleOrigin: '2026-06-05',
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    await addBayCalendarException({
      db: context.db,
      input: bayExceptionInput({ bayId: bay.id, date: '2026-06-06', direction: 'off', label: null }),
    });
    await addBayCalendarException({
      db: context.db,
      input: bayExceptionInput({ bayId: bay.id, date: '2026-06-07', direction: 'off', label: null }),
    });

    await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: firstJob.id },
    });
    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));
    await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: secondJob.id },
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
  test("rejects inserting idle time relative to a cancelled Job's slot", async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const workSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: job.id },
    });
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, job.id));

    await expect(
      addIdleJobSlot({
        db: context.db,
        input: { durationDays: 1, placement: 'after', targetSlotId: workSlot.slot.id },
      }),
    ).rejects.toMatchObject({ code: 'job.cancelled', metadata: { id: job.id } });
  });

  test('inserts one-day idle slots before and after target slots and keeps sequences contiguous', async ({
    context,
  }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const firstSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: firstJob.id },
    });
    const secondSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: secondJob.id },
    });

    const beforeIdle = await addIdleJobSlot({
      db: context.db,
      input: { durationDays: 1, label: null, placement: 'before', targetSlotId: secondSlot.slot.id },
    });
    const afterIdle = await addIdleJobSlot({
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
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: job.id },
    });

    const firstIdle = await addIdleJobSlot({
      db: context.db,
      input: { durationDays: 1, placement: 'after', targetSlotId: workSlot.slot.id },
    });
    const secondIdle = await addIdleJobSlot({
      db: context.db,
      input: { durationDays: 1, placement: 'after', targetSlotId: firstIdle.slot.id },
    });

    const schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, bay.id).slots).toEqual([
      expect.objectContaining({ id: workSlot.slot.id, kind: 'work', sequence: 1 }),
      expect.objectContaining({ id: firstIdle.slot.id, kind: 'idle', sequence: 2 }),
      expect.objectContaining({ id: secondIdle.slot.id, kind: 'idle', sequence: 3 }),
    ]);
  });
});

describe('resizeJobSlot', () => {
  test("rejects resizing a cancelled Job's slot", async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const slot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: job.id },
    });
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, job.id));

    await expect(
      resizeJobSlot({ db: context.db, input: { durationDays: 2, slotId: slot.slot.id } }),
    ).rejects.toMatchObject({ code: 'job.cancelled', metadata: { id: job.id } });
  });

  test('updates duration and reflows downstream projected dates only', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-05',
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const thirdJob = await createAcceptedJob(context.db, context.catalog.product.id);

    const firstSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: firstJob.id },
    });
    const secondSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: secondJob.id },
    });
    const thirdSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: thirdJob.id },
    });

    await expect(
      resizeJobSlot({
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

    const schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, bay.id)).toEqual(
      expect.objectContaining({
        id: bay.id,
        nextAvailableDate: '2026-06-09',
        slots: [
          expect.objectContaining({
            id: firstSlot.slot.id,
            durationDays: 1,
            startDate: '2026-06-05',
            endDate: '2026-06-06',
          }),
          expect.objectContaining({
            id: secondSlot.slot.id,
            durationDays: 2,
            startDate: '2026-06-06',
            endDate: '2026-06-08',
          }),
          expect.objectContaining({
            id: thirdSlot.slot.id,
            durationDays: 1,
            startDate: '2026-06-08',
            endDate: '2026-06-09',
          }),
        ],
      }),
    );
  });

  test('rejects missing slots', async ({ context }) => {
    await expect(
      resizeJobSlot({
        db: context.db,
        input: {
          durationDays: 2,
          slotId: '00000000-0000-4000-8000-000000000999',
        },
      }),
    ).rejects.toThrow('Job slot not found');
  });

  test('resizes existing slots in disabled Bays', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const slot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: job.id },
    });

    await setJobBayDisabled({
      actorUserId,
      db: context.db,
      input: { disabled: true, id: bay.id },
    });

    await expect(
      resizeJobSlot({
        db: context.db,
        input: { durationDays: 2, slotId: slot.slot.id },
      }),
    ).resolves.toMatchObject({ slot: { durationDays: 2, id: slot.slot.id } });

    const schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, bay.id)).toEqual(
      expect.objectContaining({
        disabledAt: expect.any(String),
        slots: [expect.objectContaining({ durationDays: 2, id: slot.slot.id })],
      }),
    );
  });

  test('resizes idle slots and reflows later work', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const workSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: job.id },
    });
    const idleSlot = await addIdleJobSlot({
      db: context.db,
      input: { durationDays: 1, placement: 'before', targetSlotId: workSlot.slot.id },
    });

    await expect(
      resizeJobSlot({
        db: context.db,
        input: { durationDays: 2, slotId: idleSlot.slot.id },
      }),
    ).resolves.toMatchObject({ slot: { durationDays: 2, kind: 'idle' } });

    const schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, bay.id).slots).toEqual([
      expect.objectContaining({
        id: idleSlot.slot.id,
        endDate: '2026-06-07',
        kind: 'idle',
        startDate: '2026-06-05',
      }),
      expect.objectContaining({
        id: workSlot.slot.id,
        endDate: '2026-06-08',
        kind: 'work',
        startDate: '2026-06-07',
      }),
    ]);
  });
});

describe('moveJobSlot', () => {
  test("rejects moving a cancelled Job's slot", async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const otherJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const slot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: job.id },
    });
    await bookJobSlot({ db: context.db, input: { bayId: bay.id, durationDays: 1, jobId: otherJob.id } });
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, job.id));

    await expect(
      moveJobSlot({ actorUserId, db: context.db, input: { direction: 'right', slotId: slot.slot.id } }),
    ).rejects.toMatchObject({ code: 'job.cancelled', metadata: { id: job.id } });
  });

  test("rejects moving a live slot across a cancelled Job's adjacent slot", async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const liveJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const cancelledJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const liveSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: liveJob.id },
    });
    await bookJobSlot({ db: context.db, input: { bayId: bay.id, durationDays: 1, jobId: cancelledJob.id } });
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, cancelledJob.id));

    await expect(
      moveJobSlot({ actorUserId, db: context.db, input: { direction: 'right', slotId: liveSlot.slot.id } }),
    ).rejects.toMatchObject({ code: 'job.cancelled', metadata: { id: cancelledJob.id } });
  });

  test('moves a middle slot left by swapping with the previous bay slot', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const thirdJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const firstSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: firstJob.id },
    });
    const secondSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: secondJob.id },
    });
    const thirdSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: thirdJob.id },
    });

    await expect(
      moveJobSlot({
        actorUserId,
        db: context.db,
        input: { direction: 'left', slotId: secondSlot.slot.id },
      }),
    ).resolves.toMatchObject({
      slot: {
        id: secondSlot.slot.id,
        sequence: 1,
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
      { id: secondSlot.slot.id, sequence: 1 },
      { id: firstSlot.slot.id, sequence: 2 },
      { id: thirdSlot.slot.id, sequence: 3 },
    ]);

    const [event] = await context.db.select().from(auditEvents).where(eq(auditEvents.entityType, 'job_bay'));
    expect(event).toMatchObject({
      action: 'updated',
      actorUserId,
      changes: {
        slotOrder: {
          from: [firstSlot.slot.id, secondSlot.slot.id],
          to: [secondSlot.slot.id, firstSlot.slot.id],
        },
      },
      entityId: bay.id,
      summary: `Updated Bay "${bay.name}"`,
    });
  });

  test('moves a middle slot right and reflows projected dates', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-05',
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const thirdJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const firstSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: firstJob.id },
    });
    const secondSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: secondJob.id },
    });
    const thirdSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 2, jobId: thirdJob.id },
    });

    await expect(
      moveJobSlot({
        actorUserId,
        db: context.db,
        input: { direction: 'right', slotId: secondSlot.slot.id },
      }),
    ).resolves.toMatchObject({
      slot: {
        id: secondSlot.slot.id,
        sequence: 3,
      },
    });

    const schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, bay.id)).toEqual(
      expect.objectContaining({
        slots: [
          expect.objectContaining({
            id: firstSlot.slot.id,
            sequence: 1,
            startDate: '2026-06-05',
            endDate: '2026-06-06',
          }),
          expect.objectContaining({
            id: thirdSlot.slot.id,
            sequence: 2,
            startDate: '2026-06-06',
            endDate: '2026-06-08',
          }),
          expect.objectContaining({
            id: secondSlot.slot.id,
            sequence: 3,
            startDate: '2026-06-08',
            endDate: '2026-06-09',
          }),
        ],
      }),
    );
  });

  test('returns the original slot when moving beyond queue boundaries', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const firstSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: firstJob.id },
    });
    const secondSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: secondJob.id },
    });

    await expect(
      moveJobSlot({
        actorUserId,
        db: context.db,
        input: { direction: 'left', slotId: firstSlot.slot.id },
      }),
    ).resolves.toMatchObject({ slot: { id: firstSlot.slot.id, sequence: 1 } });
    await expect(
      moveJobSlot({
        actorUserId,
        db: context.db,
        input: { direction: 'right', slotId: secondSlot.slot.id },
      }),
    ).resolves.toMatchObject({ slot: { id: secondSlot.slot.id, sequence: 2 } });
  });

  test('rejects missing slots', async ({ context }) => {
    await expect(
      moveJobSlot({
        actorUserId,
        db: context.db,
        input: {
          direction: 'left',
          slotId: '00000000-0000-4000-8000-000000000999',
        },
      }),
    ).rejects.toThrow('Job slot not found');
  });
});

describe('cancelJob', () => {
  test('cancels the Job with its reason, drops future Slots, and leaves the Quote alone', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-02' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const downstreamJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const [doneSlot, activeSlot, scheduledSlot, downstreamSlot] = await context.db
      .insert(jobSlots)
      .values([
        { bayId: bay.id, durationDays: 2, jobId: job.id, kind: 'work', sequence: 1 },
        { bayId: bay.id, durationDays: 3, jobId: job.id, kind: 'work', sequence: 2 },
        { bayId: bay.id, durationDays: 2, jobId: job.id, kind: 'work', sequence: 3 },
        { bayId: bay.id, durationDays: 1, jobId: downstreamJob.id, kind: 'work', sequence: 4 },
      ])
      .returning();
    if (!doneSlot || !activeSlot || !scheduledSlot || !downstreamSlot) {
      throw new Error('Slot insert did not return every row');
    }

    await cancelJob({
      actorUserId,
      db: context.db,
      input: JobCancelInput.parse({ cancellationReason: '  Raised against the wrong Customer  ', id: job.id }),
    });

    const [cancelled] = await context.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(cancelled).toMatchObject({
      cancellationReason: 'Raised against the wrong Customer',
      completedOn: null,
    });
    expect(cancelled?.cancelledAt).toBeInstanceOf(Date);

    // Work already under way stays on record; only the Slots that had not started are given back.
    const remaining = await context.db.select().from(jobSlots).orderBy(asc(jobSlots.sequence));
    expect(remaining).toEqual([
      expect.objectContaining({ id: doneSlot.id, sequence: 1 }),
      expect.objectContaining({ id: activeSlot.id, sequence: 2 }),
      expect.objectContaining({ id: downstreamSlot.id, sequence: 3 }),
    ]);

    const [quote] = await context.db
      .select()
      .from(quotes)
      .where(eq(quotes.id, job.quoteId ?? ''));
    expect(quote).toMatchObject({ cancellationReason: null, status: 'accepted' });

    // The audit trail is the only record of why, so it snapshots the cancelled row rather than the
    // live one it replaced.
    const events = await context.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, job.id), eq(auditEvents.entityType, 'job')));
    expect(events).toContainEqual(
      expect.objectContaining({
        action: 'deleted',
        actorUserId,
        changes: expect.objectContaining({
          cancellationReason: { from: 'Raised against the wrong Customer', to: null },
        }),
      }),
    );
  });

  test('refuses a Job that already carries a completion date', async ({ context }) => {
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    await context.db.update(jobs).set({ completedOn: '2026-06-04' }).where(eq(jobs.id, job.id));

    await expect(
      cancelJob({
        actorUserId,
        db: context.db,
        input: { cancellationReason: 'Too late', id: job.id, removeUnit: false },
      }),
    ).rejects.toMatchObject({ code: 'job.already_completed', metadata: { id: job.id } });
  });

  test('refuses an already-cancelled Job rather than passing silently', async ({ context }) => {
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, job.id));

    await expect(
      cancelJob({ actorUserId, db: context.db, input: { cancellationReason: 'Again', id: job.id, removeUnit: false } }),
    ).rejects.toMatchObject({ code: 'job.cancelled', metadata: { id: job.id } });
  });

  // A Stock Build has no sale behind it, so the machine it minted has nobody else to belong to. This
  // is the only cancellation that may take a Unit with it.
  test('removes the Stock Build Unit when asked, leaving the Job holding neither', async ({ context }) => {
    const stockBuild = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], buildSpecAssemblyIds: [], productId: context.catalog.product.id },
    });
    const unitId = stockBuild.productUnit?.id;
    if (!unitId) throw new Error('Stock Build did not mint a Product Unit');

    await cancelJob({
      actorUserId,
      db: context.db,
      input: JobCancelInput.parse({ cancellationReason: 'Never started', id: stockBuild.id, removeUnit: true }),
    });

    await expect(context.db.$count(productUnits, eq(productUnits.id, unitId))).resolves.toBe(0);
    const [cancelled] = await context.db.select().from(jobs).where(eq(jobs.id, stockBuild.id));
    expect(cancelled).toMatchObject({ productUnitId: null, quoteId: null });
    expect(cancelled?.cancelledAt).toBeInstanceOf(Date);
  });

  test('leaves the Stock Build Unit standing when removal is not asked for', async ({ context }) => {
    const stockBuild = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], buildSpecAssemblyIds: [], productId: context.catalog.product.id },
    });
    const unitId = stockBuild.productUnit?.id;
    if (!unitId) throw new Error('Stock Build did not mint a Product Unit');

    await cancelJob({
      actorUserId,
      db: context.db,
      input: JobCancelInput.parse({ cancellationReason: 'Deferred', id: stockBuild.id }),
    });

    await expect(context.db.$count(productUnits, eq(productUnits.id, unitId))).resolves.toBe(1);
  });

  test('plans a Stock Build cancellation with its machine already ticked', async ({ context }) => {
    const stockBuild = await createJob({
      actorUserId,
      db: context.db,
      input: { baySeeds: [], buildSpecAssemblyIds: [], productId: context.catalog.product.id },
    });

    await expect(getJobCancellationPlan({ db: context.db, id: stockBuild.id })).resolves.toMatchObject({
      unit: { canRemove: true, ownerName: null, removeByDefault: true },
    });
  });

  test('offers no machine when a Quote still stands behind the Job', async ({ context }) => {
    const job = await createAcceptedJob(context.db, context.catalog.product.id);

    await expect(getJobCancellationPlan({ db: context.db, id: job.id })).resolves.toMatchObject({ unit: null });
  });

  // The sale still stands, and the #1195 replacement Job reuses this very Unit. Removing it here would
  // leave the Quote pointing at a machine that no longer exists.
  test('refuses to remove the Unit of a Job whose Quote still stands', async ({ context }) => {
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const unitId = job.productUnit?.id;
    if (!unitId) throw new Error('Build-to-order Job did not mint a Product Unit');

    await expect(
      cancelJob({
        actorUserId,
        db: context.db,
        input: { cancellationReason: 'Wrong spec', id: job.id, removeUnit: true },
      }),
    ).rejects.toMatchObject({ code: 'job.unit_removal_denied', metadata: { id: job.id } });

    // Refused whole: the Job is still live and the machine is still there.
    const [untouched] = await context.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(untouched?.cancelledAt).toBeNull();
    await expect(context.db.$count(productUnits, eq(productUnits.id, unitId))).resolves.toBe(1);
  });
});

describe('removeJobSlot', () => {
  test("removes a cancelled Job's done and active slots and reflows both Bays", async ({ context }) => {
    const doneBay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-01' });
    const activeBay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-04' });
    const cancelledJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const downstreamJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const [doneSlot, doneDownstream, activeSlot, activeDownstream] = await context.db
      .insert(jobSlots)
      .values([
        { bayId: doneBay.id, durationDays: 2, jobId: cancelledJob.id, kind: 'work', sequence: 1 },
        { bayId: doneBay.id, durationDays: 2, jobId: downstreamJob.id, kind: 'work', sequence: 2 },
        { bayId: activeBay.id, durationDays: 3, jobId: cancelledJob.id, kind: 'work', sequence: 1 },
        { bayId: activeBay.id, durationDays: 2, jobId: downstreamJob.id, kind: 'work', sequence: 2 },
      ])
      .returning();
    if (!doneSlot || !doneDownstream || !activeSlot || !activeDownstream) {
      throw new Error('Slot insert did not return every row');
    }
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, cancelledJob.id));

    await expect(removeJobSlot({ db: context.db, input: { slotId: doneSlot.id } })).resolves.toMatchObject({
      slot: { id: doneSlot.id },
    });
    await expect(removeJobSlot({ db: context.db, input: { slotId: activeSlot.id } })).resolves.toMatchObject({
      slot: { id: activeSlot.id },
    });

    const schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, doneBay.id).slots).toEqual([
      expect.objectContaining({ id: doneDownstream.id, sequence: 1, startDate: '2026-06-01' }),
    ]);
    expect(getProjectedBayQueue(schedule, activeBay.id).slots).toEqual([
      expect.objectContaining({ id: activeDownstream.id, sequence: 1, startDate: '2026-06-04' }),
    ]);
  });

  test('removes a middle slot, closes the projected gap, and keeps stored sequences contiguous', async ({
    context,
  }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-05',
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const thirdJob = await createAcceptedJob(context.db, context.catalog.product.id);

    const firstSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: firstJob.id },
    });
    const secondSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: secondJob.id },
    });
    const thirdSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: thirdJob.id },
    });

    await expect(
      removeJobSlot({
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

    const schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, bay.id)).toEqual(
      expect.objectContaining({
        id: bay.id,
        nextAvailableDate: '2026-06-07',
        slots: [
          expect.objectContaining({
            id: firstSlot.slot.id,
            startDate: '2026-06-05',
            endDate: '2026-06-06',
          }),
          expect.objectContaining({
            id: thirdSlot.slot.id,
            sequence: 2,
            startDate: '2026-06-06',
            endDate: '2026-06-07',
          }),
        ],
      }),
    );
  });

  test('removing the last slot keeps upstream slots unchanged', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-05',
    });
    const firstJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const secondJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const firstSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: firstJob.id },
    });
    const secondSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 2, jobId: secondJob.id },
    });

    await removeJobSlot({
      db: context.db,
      input: { slotId: secondSlot.slot.id },
    });

    const schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, bay.id)).toEqual(
      expect.objectContaining({
        id: bay.id,
        nextAvailableDate: '2026-06-06',
        slots: [
          expect.objectContaining({
            id: firstSlot.slot.id,
            sequence: 1,
            startDate: '2026-06-05',
            endDate: '2026-06-06',
          }),
        ],
      }),
    );
  });

  test('rejects missing slots', async ({ context }) => {
    await expect(
      removeJobSlot({
        db: context.db,
        input: {
          slotId: '00000000-0000-4000-8000-000000000999',
        },
      }),
    ).rejects.toThrow('Job slot not found');
  });

  test('removes idle slots and closes the queue gap', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const workSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: job.id },
    });
    const idleSlot = await addIdleJobSlot({
      db: context.db,
      input: { durationDays: 1, placement: 'before', targetSlotId: workSlot.slot.id },
    });

    await expect(
      removeJobSlot({
        db: context.db,
        input: { slotId: idleSlot.slot.id },
      }),
    ).resolves.toMatchObject({ slot: { id: idleSlot.slot.id, kind: 'idle' } });

    const schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, bay.id).slots).toEqual([
      expect.objectContaining({
        id: workSlot.slot.id,
        kind: 'work',
        sequence: 1,
        startDate: '2026-06-05',
      }),
    ]);
  });
});

describe('listJobs scheduleState', () => {
  function listInput(overrides: Partial<Parameters<typeof listJobs>[0]['input']> = {}) {
    return {
      columnFilters: {},
      filters: {},
      include: {},
      cursor: 0,
      limit: 50,
      search: '',
      sortBy: 'createdAt' as const,
      sortDirection: 'asc' as const,
      ...overrides,
    };
  }

  test('omits schedule state (null) when the caller does not opt in', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-05' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    await bookJobSlot({ db: context.db, input: { bayId: bay.id, durationDays: 2, jobId: job.id } });

    const result = await listJobs({ db: context.db, input: listInput() });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.scheduleState).toBeNull();
  });

  test('excludes cancelled Jobs from list reads', async ({ context }) => {
    const liveJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const cancelledJob = await createAcceptedJob(context.db, context.catalog.product.id);
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, cancelledJob.id));

    const result = await listJobs({ db: context.db, input: listInput() });

    expect(result.items.map((item) => item.id)).toEqual([liveJob.id]);
    expect(result.total).toBe(1);
  });

  test('keeps cancelled Jobs readable through detail and Board history', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-04' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    await context.db.insert(jobSlots).values({
      bayId: bay.id,
      durationDays: 3,
      jobId: job.id,
      kind: 'work',
      sequence: 1,
    });
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, job.id));

    await expect(getJob({ db: context.db, id: job.id })).resolves.toMatchObject({
      cancelledAt: expect.any(String),
      id: job.id,
      schedule: expect.arrayContaining([
        expect.objectContaining({
          bays: expect.arrayContaining([
            expect.objectContaining({ slots: [expect.objectContaining({ jobId: job.id, state: 'active' })] }),
          ]),
        }),
      ]),
    });
    await expect(listBays({ db: context.db })).resolves.toMatchObject({
      jobs: [expect.objectContaining({ cancelledAt: expect.any(String), id: job.id })],
    });
  });

  test('excludes retained cancelled work from bay planning availability', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-04' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    await context.db.insert(jobSlots).values({
      bayId: bay.id,
      durationDays: 3,
      jobId: job.id,
      kind: 'work',
      sequence: 1,
    });
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, job.id));

    await expect(listBayQueueAvailability({ bayIds: [bay.id], db: context.db })).resolves.toEqual([
      expect.objectContaining({ bayId: bay.id, nextAvailableDate: '2026-06-04', waitWorkingDays: 0 }),
    ]);
  });

  test("buckets a Job's Work Slots across bays into done/active/scheduled", async ({ context }) => {
    const doneBay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-05' });
    const activeBay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-05' });
    const scheduledBay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-05' });

    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    const filler = await createAcceptedJob(context.db, context.catalog.product.id);

    // Done: [06-05, 06-07) ends before "today"; Active: [06-05, 06-15) covers it.
    await bookJobSlot({ db: context.db, input: { bayId: doneBay.id, durationDays: 2, jobId: job.id } });
    await bookJobSlot({ db: context.db, input: { bayId: activeBay.id, durationDays: 10, jobId: job.id } });
    // Scheduled: a filler holds [06-05, 06-15), pushing the Job's slot to [06-15, …), all ahead of "today".
    await bookJobSlot({ db: context.db, input: { bayId: scheduledBay.id, durationDays: 10, jobId: filler.id } });
    await bookJobSlot({ db: context.db, input: { bayId: scheduledBay.id, durationDays: 2, jobId: job.id } });

    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));

    const result = await listJobs({ db: context.db, input: listInput({ include: { scheduleState: true } }) });

    const jobItem = result.items.find((item) => item.id === job.id);
    // Window spans the earliest Slot start (06-05) to the latest Slot end (the scheduled [06-15, 06-17)).
    expect(jobItem?.scheduleState).toEqual({
      active: 1,
      done: 1,
      firstWorkDay: '2026-06-05',
      lastWorkDay: '2026-06-16',
      scheduled: 1,
      total: 3,
    });

    const fillerItem = result.items.find((item) => item.id === filler.id);
    expect(fillerItem?.scheduleState).toEqual({
      active: 1,
      done: 0,
      firstWorkDay: '2026-06-05',
      lastWorkDay: '2026-06-14',
      scheduled: 0,
      total: 1,
    });
  });

  test('reports an all-zero schedule state for a Job with no Work Slot', async ({ context }) => {
    const job = await createAcceptedJob(context.db, context.catalog.product.id);

    const result = await listJobs({ db: context.db, input: listInput({ include: { scheduleState: true } }) });

    expect(result.items.find((item) => item.id === job.id)?.scheduleState).toEqual({
      active: 0,
      done: 0,
      firstWorkDay: null,
      lastWorkDay: null,
      scheduled: 0,
      total: 0,
    });
  });

  test('reports a fully-done schedule window for a Job whose Slots have all ended', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-05' });
    const job = await createAcceptedJob(context.db, context.catalog.product.id);
    // [06-05, 06-07): both work days precede "today", so the Job is complete (done === total).
    await bookJobSlot({ db: context.db, input: { bayId: bay.id, durationDays: 2, jobId: job.id } });

    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));

    const result = await listJobs({ db: context.db, input: listInput({ include: { scheduleState: true } }) });

    expect(result.items.find((item) => item.id === job.id)?.scheduleState).toEqual({
      active: 0,
      done: 1,
      firstWorkDay: '2026-06-05',
      lastWorkDay: '2026-06-06',
      scheduled: 0,
      total: 1,
    });
  });

  test('filters Jobs by completion presence and completion-date range', async ({ context }) => {
    const early = await createAcceptedJob(context.db, context.catalog.product.id);
    const late = await createAcceptedJob(context.db, context.catalog.product.id);
    const open = await createAcceptedJob(context.db, context.catalog.product.id);
    await context.db.update(jobs).set({ completedOn: '2026-05-04' }).where(eq(jobs.id, early.id));
    await context.db.update(jobs).set({ completedOn: '2026-06-02' }).where(eq(jobs.id, late.id));

    const openResult = await listJobs({ db: context.db, input: listInput({ filters: { incompleteOnly: true } }) });
    const rangeResult = await listJobs({
      db: context.db,
      input: listInput({
        columnFilters: {
          completedOnEnd: DateOnlyIso.parse('2026-05-31'),
          completedOnStart: DateOnlyIso.parse('2026-05-01'),
        },
      }),
    });

    expect(openResult.items.map((item) => item.id)).toEqual([open.id]);
    expect(openResult.total).toBe(1);
    // A range only ever matches completed Jobs, so `open` drops out without an explicit exclusion.
    expect(rangeResult.items.map((item) => item.id)).toEqual([early.id]);
    expect(rangeResult.total).toBe(1);
  });

  test('sortBy completedOn keeps open Jobs last in both directions', async ({ context }) => {
    const early = await createAcceptedJob(context.db, context.catalog.product.id);
    const late = await createAcceptedJob(context.db, context.catalog.product.id);
    const open = await createAcceptedJob(context.db, context.catalog.product.id);
    await context.db.update(jobs).set({ completedOn: '2026-05-04' }).where(eq(jobs.id, early.id));
    await context.db.update(jobs).set({ completedOn: '2026-06-02' }).where(eq(jobs.id, late.id));

    const ascending = await listJobs({
      db: context.db,
      input: listInput({ sortBy: 'completedOn', sortDirection: 'asc' }),
    });
    const descending = await listJobs({
      db: context.db,
      input: listInput({ sortBy: 'completedOn', sortDirection: 'desc' }),
    });

    expect(ascending.items.map((item) => item.id)).toEqual([early.id, late.id, open.id]);
    expect(descending.items.map((item) => item.id)).toEqual([late.id, early.id, open.id]);
  });

  test('sortBy scheduledSlots ascending orders unscheduled Jobs first', async ({ context }) => {
    const firstBay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-05' });
    const secondBay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-05' });
    const unscheduled = await createAcceptedJob(context.db, context.catalog.product.id);
    const oneSlot = await createAcceptedJob(context.db, context.catalog.product.id);
    const twoSlots = await createAcceptedJob(context.db, context.catalog.product.id);
    await bookJobSlot({ db: context.db, input: { bayId: firstBay.id, durationDays: 1, jobId: oneSlot.id } });
    await bookJobSlot({ db: context.db, input: { bayId: firstBay.id, durationDays: 1, jobId: twoSlots.id } });
    await bookJobSlot({ db: context.db, input: { bayId: secondBay.id, durationDays: 1, jobId: twoSlots.id } });

    const result = await listJobs({ db: context.db, input: listInput({ sortBy: 'scheduledSlots' }) });

    expect(result.items.map((item) => item.id)).toEqual([unscheduled.id, oneSlot.id, twoSlots.id]);
  });
});

describe('listJobCustomerOptions', () => {
  test('excludes customers whose only Jobs are cancelled', async ({ context }) => {
    const liveJob = await createAcceptedJob(context.db, context.catalog.product.id);
    const cancelledJob = await createAcceptedJob(context.db, context.catalog.product.id);
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, cancelledJob.id));

    const result = await listJobCustomerOptions({
      db: context.db,
      input: { cursor: 0, limit: 0, search: '', sortBy: 'companyName', sortDirection: 'asc' },
    });

    expect(result.items.map((item) => item.id)).toEqual([liveJob.customerId]);
    expect(result.total).toBe(1);
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

async function createTestUser(
  db: Db,
  input: {
    email: string;
    id: string;
    name: string;
    role: 'bay-operator' | 'sales';
  },
) {
  const now = new Date();

  const [row] = await db
    .insert(user)
    .values({
      createdAt: now,
      email: input.email,
      emailVerified: true,
      id: input.id,
      name: input.name,
      role: input.role,
      updatedAt: now,
    })
    .returning({ id: user.id });

  if (!row) {
    throw new Error('User insert did not return a row');
  }

  return row;
}

async function createBay(
  db: Db,
  {
    department,
    scheduleOrigin = '2026-06-05',
  }: {
    department: Department;
    scheduleOrigin?: string;
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

function getProjectedBayQueue(schedule: Awaited<ReturnType<typeof listBays>>, bayId: string) {
  const bay = schedule.items.find((item) => item.id === bayId);

  if (!bay) {
    throw new Error(`Projected Bay Queue not found: ${bayId}`);
  }

  return bay;
}

function offDayInput(input: Parameters<typeof ToggleOffDayInput.parse>[0]) {
  return ToggleOffDayInput.parse(input);
}

function bayExceptionInput(input: Parameters<typeof AddBayCalendarExceptionInput.parse>[0]) {
  return AddBayCalendarExceptionInput.parse(input);
}

async function createAcceptedJob(db: Db, productId: string): Promise<JobDetail> {
  const quote = await createQuote(db, {
    productId,
    status: 'accepted',
  });

  return createJob({
    actorUserId,
    db,
    input: { baySeeds: [], quoteId: quote.id },
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
  const rangeId = await createProductRangeFixture(db);
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      description: null,
      modelCode,
      name,
      rangeId,
    })
    .returning();

  if (!product) throw new Error('Product insert did not return a row');

  return product;
}

// A tiny but valid 4x4 PNG so the brochure model assembly can read real image bytes from storage.
function brochurePngBytes(): Uint8Array {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGM4YaMBRwzEcQDxwxLBXOwG1wAAAABJRU5ErkJggg==',
    'base64',
  );
}

function drawingZipBytes(): Uint8Array {
  return Buffer.from(
    'UEsDBAoAAAAAAMlK9lxYkcrUFAAAABQAAAALABwAZHJhd2luZy50eHRVVAkAA6pvYGqqb2BqdXgLAAEE9QEAAAQUAAAAQ0FEIGRyYXdpbmcgcGFja2FnZQpQSwECHgMKAAAAAADJSvZcWJHK1BQAAAAUAAAACwAYAAAAAAABAAAApIEAAAAAZHJhd2luZy50eHRVVAUAA6pvYGp1eAsAAQT1AQAABBQAAABQSwUGAAAAAAEAAQBRAAAAWQAAAAAA',
    'base64',
  );
}

async function makeBrochureComplete(db: Db, storage: InMemoryStorageAdapter, productId: string) {
  const slots = ['primary', 'technicalDrawing', 'banner'] as const;
  const images: Record<string, { byteSize: number; contentType: string; storageKey: string; updatedAt: string }> = {};

  for (const slot of slots) {
    const storageKey = `product-images/product/${productId}/${slot}/image.png`;
    const bytes = brochurePngBytes();
    await storage.put({ body: bytes, byteSize: bytes.byteLength, contentType: 'image/png', key: storageKey });
    images[slot] = {
      byteSize: bytes.byteLength,
      contentType: 'image/png',
      storageKey,
      updatedAt: '2026-06-05T00:00:00.000Z',
    };
  }

  await db
    .update(products)
    .set({
      images,
      keyFeatures: ['Heavy-duty steel construction'],
      category: 'Silage & Grain',
      description: 'A rugged feed mixer built for daily use.',
    })
    .where(eq(products.id, productId));
}

async function readJobBrochure(db: Db, storage: InMemoryStorageAdapter, jobId: string) {
  const rows = await db.select().from(documents).where(eq(documents.jobId, jobId));
  const brochure = rows.find((row) => 'type' in row.metadata && row.metadata.type === 'brochure');

  if (!brochure) {
    throw new Error('Brochure Job Document not found');
  }

  return { body: storage.objects.get(brochure.storageKey)?.body, storageKey: brochure.storageKey };
}

async function createProductDocuments(
  db: Db,
  productId: string,
  inputs: { contentType?: string; filename: string; storageKey: string; type?: ProductDocumentType }[],
) {
  return db
    .insert(documents)
    .values(
      inputs.map((input) => ({
        byteSize: 8,
        contentType: input.contentType ?? 'application/pdf',
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
  unitOfMeasure: PartUnitOfMeasure = 'piece',
): typeof parts.$inferInsert {
  return {
    category: 'Fabrication',
    code,
    description: name,
    finish: 'Raw',
    name,
    standardPurchaseLengthMm: unitOfMeasure === 'mm' ? 6000 : null,
    supplierCode: code,
    supplierId,
    unitOfMeasure,
  };
}

async function createQuote(
  db: Db,
  {
    productId,
    productUnitId,
    selectedAssemblyId,
    status,
  }: {
    productId: string;
    productUnitId?: string;
    selectedAssemblyId?: string;
    status: QuoteStatus;
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
      cancellationReason: status === 'cancelled' ? 'Test cancellation reason' : null,
      customerId: customer.id,
      productId,
      productUnitId,
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

async function createCustomQuote(
  db: Db,
  {
    status,
    workTitle,
  }: {
    status: QuoteStatus;
    workTitle: string;
  },
) {
  const [customer] = await db
    .insert(customers)
    .values({
      companyName: 'Custom Job Customer',
      email: null,
    })
    .returning();
  if (!customer) throw new Error('Customer insert did not return a row');

  const [quote] = await db
    .insert(quotes)
    .values({
      cancellationReason: status === 'cancelled' ? 'Test cancellation reason' : null,
      customerId: customer.id,
      kind: 'custom',
      productId: null,
      quotedBasePrice: 0,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: actorUserId,
      status,
      workTitle,
    })
    .returning();
  if (!quote) throw new Error('Quote insert did not return a row');

  return quote;
}

function quoteUpdateInput(quote: typeof quotes.$inferSelect) {
  return {
    depositPercent: quote.depositPercent,
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    discountPercent: quote.discountPercent,
    id: quote.id,
    notes: quote.notes,
    documentNotes: quote.documentNotes,
    offering: quote.kind === 'custom' ? { kind: quote.kind, workTitle: quote.workTitle ?? '' } : { kind: quote.kind },
    plannedDeliveryDate: quote.plannedDeliveryDate,
    preferredDeliveryDate: quote.preferredDeliveryDate,
    salesPersonId: quote.salesPersonId,
    selectedAssemblies: [],
    status: quote.status,
    validUntil: quote.validUntil,
  };
}
