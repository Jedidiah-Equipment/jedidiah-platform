import { auditEvents, type Db, user } from '@pkg/db';
import {
  customers,
  documents,
  feedback,
  jobs,
  products,
  productUnitOwnershipTransfers,
  productUnits,
  quotes,
} from '@pkg/db/equipment';
import { DateIso, DateOnlyIso } from '@pkg/schema';
import { formatJobCode, type JobActivityItem, type JobDocumentType } from '@pkg/schema/equipment';
import { desc, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { recordAuditCreate, recordAuditDelete } from '../audit/audit-service.js';
import { documentAuditDescriptor } from '../documents/document-service.js';
import { jobAuditDescriptor } from '../jobs/job-audit.js';
import {
  completeDepartmentTiming,
  startDepartmentTiming,
  updateDepartmentTiming,
} from '../jobs/job-department-timing-service.js';
import { updateJob } from '../jobs/job-service.js';
import { createTester } from '../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { listJobActivity } from './job-activity-service.js';

const SUBMITTER_THUMBNAIL_DATA_URL = 'data:image/webp;base64,YWN0b3I=';
const PRODUCT_THUMBNAIL_DATA_URL = 'data:image/webp;base64,cHJvZHVjdA==';

const test = createTester(async ({ db }) => {
  await createSubmitter(db);
  const product = await createProduct(db);
  const quote = await createQuote(db, product.id);
  const job = await createJob(db, { customerId: quote.customerId, productId: product.id, quoteId: quote.id });

  return { db, job, product, quote };
});

describe('listJobActivity', () => {
  test('returns a Job general feedback row as a general-feedback activity item', async ({ context }) => {
    await insertFeedback(context.db, {
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Paint bay handover was missed on this job.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      type: 'general-feedback',
      job: { id: context.job.id },
      feedback: {
        submitter: {
          id: 'test-user-id',
          name: 'Test User',
          thumbnailDataUrl: SUBMITTER_THUMBNAIL_DATA_URL,
        },
        text: 'Paint bay handover was missed on this job.',
      },
    });
  });

  test('places the item by Job code, offering, Product, and the Customer who bought it', async ({ context }) => {
    await insertFeedback(context.db, {
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Placed item.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items[0]?.job).toMatchObject({
      code: formatJobCode(context.job.code),
      customerCompanyName: 'Activity Customer',
      displayName: 'Job Activity Test Product',
      offeringKind: 'product',
      thumbnailDataUrl: PRODUCT_THUMBNAIL_DATA_URL,
    });
  });

  test('reads a Job whose Unit nobody owns as Stock, carrying no Customer', async ({ context }) => {
    const stockJob = await createStockJob(context.db, context.product.id);

    await insertFeedback(context.db, {
      jobId: stockJob.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Stock build note.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items[0]?.job).toMatchObject({
      customerCompanyName: null,
      displayName: 'Job Activity Test Product',
      offeringKind: 'product',
      thumbnailDataUrl: PRODUCT_THUMBNAIL_DATA_URL,
    });
  });

  test('never returns Quote general feedback, which stays private to the inbox (ADR 0010)', async ({ context }) => {
    await insertFeedback(context.db, {
      quoteId: context.quote.id,
      kind: 'general',
      subjectType: 'quote',
      text: 'The discount on this quote looks too high.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  test('never returns corrective feedback about a Job', async ({ context }) => {
    await insertFeedback(context.db, {
      jobId: context.job.id,
      kind: 'corrective-feedback-department',
      subjectType: 'job',
      text: 'Paint department keeps missing handovers.',
    });
    await insertFeedback(context.db, {
      jobId: context.job.id,
      kind: 'corrective-feedback-user',
      subjectType: 'job',
      text: 'This fitter keeps missing handovers.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  test('orders newest first, breaking ties on id so a cursor never repeats a row', async ({ context }) => {
    const sharedInstant = new Date('2026-08-01T09:00:00.000Z');

    await insertFeedback(context.db, {
      createdAt: new Date('2026-08-02T09:00:00.000Z'),
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Newest.',
    });
    await insertFeedback(context.db, {
      createdAt: sharedInstant,
      id: '00000000-0000-4000-8000-000000000002',
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Tied, higher id.',
    });
    await insertFeedback(context.db, {
      createdAt: sharedInstant,
      id: '00000000-0000-4000-8000-000000000001',
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Tied, lower id.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    // Newest first, and the tie broken by descending id so the sort matches the index's own order.
    expect(feedbackTexts(result.items)).toEqual(['Newest.', 'Tied, higher id.', 'Tied, lower id.']);
  });

  test('pages with a server-computed cursor that terminates on the last page', async ({ context }) => {
    for (let index = 0; index < 3; index += 1) {
      await insertFeedback(context.db, {
        createdAt: new Date(`2026-08-0${index + 1}T09:00:00.000Z`),
        jobId: context.job.id,
        kind: 'general',
        subjectType: 'job',
        text: `Item ${index}`,
      });
    }

    const firstPage = await listJobActivity({ db: context.db, input: listInput({ limit: 2 }) });

    expect(firstPage.total).toBe(3);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBe(2);

    const secondPage = await listJobActivity({
      db: context.db,
      input: listInput({ cursor: firstPage.nextCursor ?? 0, limit: 2 }),
    });

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
  });

  test('terminates rather than looping when the cursor sits past the end', async ({ context }) => {
    await insertFeedback(context.db, {
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Only item.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput({ cursor: 50, limit: 25 }) });

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  test('returns every row unpaged for the limit 0 sentinel', async ({ context }) => {
    for (let index = 0; index < 3; index += 1) {
      await insertFeedback(context.db, {
        createdAt: new Date(`2026-08-0${index + 1}T09:00:00.000Z`),
        jobId: context.job.id,
        kind: 'general',
        subjectType: 'job',
        text: `Item ${index}`,
      });
    }

    const result = await listJobActivity({ db: context.db, input: listInput({ limit: 0 }) });

    expect(result.items).toHaveLength(3);
    expect(result.nextCursor).toBeNull();
  });

  test('orders oldest first when the caller asks for ascending', async ({ context }) => {
    await insertFeedback(context.db, {
      createdAt: new Date('2026-08-02T09:00:00.000Z'),
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Newer.',
    });
    await insertFeedback(context.db, {
      createdAt: new Date('2026-08-01T09:00:00.000Z'),
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Older.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput({ sortDirection: 'asc' }) });

    expect(feedbackTexts(result.items)).toEqual(['Older.', 'Newer.']);
  });
});

describe('listJobActivity search', () => {
  test('matches visible feedback, person, Job, Product, and Customer text case-insensitively', async ({ context }) => {
    await insertFeedback(context.db, {
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Hydraulic hoses need rerouting.',
    });
    await recordJobCreated(context.db, context.job);

    for (const [search, expectedTypes] of [
      ['HYDRAULIC', ['general-feedback']],
      ['test user', ['job-created', 'general-feedback']],
      [formatJobCode(context.job.code), ['job-created', 'general-feedback']],
      ['activity test product', ['job-created', 'general-feedback']],
      ['activity customer', ['job-created', 'general-feedback']],
    ] as const) {
      const result = await listJobActivity({ db: context.db, input: listInput({ search }) });

      expect(result.total).toBe(expectedTypes.length);
      expect(result.items.map((item) => item.type).sort()).toEqual([...expectedTypes].sort());
    }
  });

  test('matches the visible description and document filename carried by Job Events', async ({ context }) => {
    await updateJob({
      actorUserId: 'test-user-id',
      db: context.db,
      input: { id: context.job.id, description: 'Fit the heavy-duty boom.' },
    });
    await recordDocumentCreated(context.db, { jobId: context.job.id });

    const description = await listJobActivity({ db: context.db, input: listInput({ search: 'HEAVY-DUTY' }) });
    const document = await listJobActivity({ db: context.db, input: listInput({ search: 'HANDOVER.PDF' }) });

    expect(description.items).toEqual([expect.objectContaining({ type: 'job-description-updated' })]);
    expect(document.items).toEqual([expect.objectContaining({ type: 'job-document-added' })]);
  });

  test('does not match description snapshots on events that render no description', async ({ context }) => {
    await recordJobCreated(context.db, { ...context.job, description: 'Hidden creation wording.' });
    await updateJob({
      actorUserId: 'test-user-id',
      db: context.db,
      input: {
        id: context.job.id,
        completedOn: DateOnlyIso.parse('2026-08-10'),
        description: 'Hidden completion wording.',
      },
    });

    const created = await listJobActivity({ db: context.db, input: listInput({ search: 'creation wording' }) });
    const completed = await listJobActivity({ db: context.db, input: listInput({ search: 'completion wording' }) });

    expect(created.items).toEqual([]);
    expect(completed.items).toEqual([]);
  });

  test('matches every generated Job Event sentence', async ({ context }) => {
    await recordJobCreated(context.db, context.job);
    await updateJob({
      actorUserId: 'test-user-id',
      db: context.db,
      input: { id: context.job.id, description: 'Fit the boom.' },
    });
    await updateJob({ actorUserId: 'test-user-id', db: context.db, input: { id: context.job.id, description: null } });
    await updateJob({
      actorUserId: 'test-user-id',
      db: context.db,
      input: { id: context.job.id, completedOn: DateOnlyIso.parse('2026-08-10'), description: null },
    });
    await recordDocumentCreated(context.db, { jobId: context.job.id });

    for (const [search, type] of [
      ['created', 'job-created'],
      ['changed', 'job-description-updated'],
      ['cleared', 'job-description-updated'],
      ['completed', 'job-completed'],
      ['document', 'job-document-added'],
    ] as const) {
      const result = await listJobActivity({ db: context.db, input: listInput({ search }) });

      expect(result.items).toEqual([expect.objectContaining({ type })]);
    }
  });

  test('matches the displayed System and Stock labels', async ({ context }) => {
    const stockJob = await createStockJob(context.db, context.product.id);

    await insertFeedback(context.db, {
      jobId: stockJob.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Inventory note.',
    });
    await context.db.insert(auditEvents).values({
      action: 'created',
      actorUserId: null,
      changes: { completedOn: { from: null, to: null }, description: { from: null, to: null } },
      entityId: stockJob.id,
      entityType: 'job',
      summary: 'Created a stock Job',
    });

    const system = await listJobActivity({ db: context.db, input: listInput({ search: 'sys' }) });
    const stock = await listJobActivity({ db: context.db, input: listInput({ search: 'stock' }) });

    expect(system.items).toEqual([expect.objectContaining({ type: 'job-created', actor: null })]);
    expect(stock.items.map((item) => item.type).sort()).toEqual(['general-feedback', 'job-created']);
  });

  test('matches the displayed work title of a Custom Job', async ({ context }) => {
    const [customQuote] = await context.db
      .insert(quotes)
      .values({
        customerId: context.quote.customerId,
        kind: 'custom',
        productId: null,
        quotedBasePrice: 0,
        quotedCurrencyCode: 'ZAR',
        salesPersonId: 'test-user-id',
        workTitle: 'Emergency auger rebuild',
      })
      .returning();

    if (!customQuote) throw new Error('Custom Quote insert did not return a row');

    const [customJob] = await context.db.insert(jobs).values({ quoteId: customQuote.id }).returning();

    if (!customJob) throw new Error('Custom Job insert did not return a row');

    await insertFeedback(context.db, {
      jobId: customJob.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Work can start.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput({ search: 'AUGER' }) });

    expect(result.items).toEqual([
      expect.objectContaining({ type: 'general-feedback', job: expect.objectContaining({ id: customJob.id }) }),
    ]);
  });

  test('keeps filtered totals and cursors aligned with search matches', async ({ context }) => {
    await insertFeedback(context.db, {
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'A user note.',
    });
    await recordJobCreated(context.db, context.job);
    await updateJob({
      actorUserId: 'test-user-id',
      db: context.db,
      input: { id: context.job.id, description: 'Fit the boom.' },
    });

    const firstPage = await listJobActivity({
      db: context.db,
      input: listInput({ filter: 'job-events', limit: 1, search: 'activity test product' }),
    });
    const secondPage = await listJobActivity({
      db: context.db,
      input: listInput({
        cursor: firstPage.nextCursor ?? 0,
        filter: 'job-events',
        limit: 1,
        search: 'activity test product',
      }),
    });

    expect(firstPage.total).toBe(2);
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBe(1);
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
  });
});

describe('listJobActivity change events', () => {
  test('reads a Job creation audit row as a job-created item placed on its Job', async ({ context }) => {
    await recordJobCreated(context.db, context.job);

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      type: 'job-created',
      job: { code: formatJobCode(context.job.code), customerCompanyName: 'Activity Customer' },
      actor: { id: 'test-user-id', name: 'Test User', thumbnailDataUrl: SUBMITTER_THUMBNAIL_DATA_URL },
    });
  });

  test('reads a description edit as a job-description-updated item carrying the new text', async ({ context }) => {
    await updateJob({
      actorUserId: 'test-user-id',
      db: context.db,
      input: { id: context.job.id, description: 'Fit the heavy-duty boom.' },
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items).toEqual([
      expect.objectContaining({ type: 'job-description-updated', description: 'Fit the heavy-duty boom.' }),
    ]);
  });

  test('projects each work-time change and isolates it behind the Work Times filter', async ({ context }) => {
    await createUser(context.db, { id: 'fabricator-id', name: 'Fiona Fabricator', role: 'bay-operator' });
    await startDepartmentTiming({
      actorUserId: 'test-user-id',
      db: context.db,
      input: { department: 'fabrication', id: context.job.id },
    });
    await updateDepartmentTiming({
      actorUserId: 'test-user-id',
      db: context.db,
      input: {
        completedAt: null,
        crewUserIds: [],
        department: 'fabrication',
        id: context.job.id,
        startedAt: DateIso.parse('2026-08-01T09:00:00.000Z'),
      },
    });
    await completeDepartmentTiming({
      actorUserId: 'test-user-id',
      db: context.db,
      input: { crewUserIds: ['fabricator-id'], department: 'fabrication', id: context.job.id },
    });
    await updateDepartmentTiming({
      actorUserId: 'test-user-id',
      db: context.db,
      input: {
        completedAt: null,
        crewUserIds: [],
        department: 'fabrication',
        id: context.job.id,
        startedAt: null,
      },
    });

    const all = await listJobActivity({ db: context.db, input: listInput() });
    const workTimes = await listJobActivity({ db: context.db, input: listInput({ filter: 'work-times' }) });
    const jobEvents = await listJobActivity({ db: context.db, input: listInput({ filter: 'job-events' }) });

    expect(all.total).toBe(4);
    expect(workTimes.total).toBe(4);
    expect(workTimes.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'started',
          department: 'fabrication',
          timing: expect.objectContaining({ completedAt: null, crew: [] }),
          type: 'job-work-time-updated',
        }),
        expect.objectContaining({
          action: 'corrected',
          department: 'fabrication',
          timing: expect.objectContaining({ startedAt: '2026-08-01T09:00:00.000Z' }),
          type: 'job-work-time-updated',
        }),
        expect.objectContaining({
          action: 'completed',
          department: 'fabrication',
          timing: expect.objectContaining({ crew: ['Fiona Fabricator'] }),
          type: 'job-work-time-updated',
        }),
        expect.objectContaining({
          action: 'cleared',
          department: 'fabrication',
          timing: null,
          type: 'job-work-time-updated',
        }),
      ]),
    );
    expect(jobEvents.items).toEqual([]);
  });

  test('searches the Work Time wording, department, and snapshotted crew names', async ({ context }) => {
    await createUser(context.db, { id: 'fabricator-id', name: 'Fiona Fabricator', role: 'bay-operator' });
    await startDepartmentTiming({
      actorUserId: 'test-user-id',
      db: context.db,
      input: { department: 'fabrication', id: context.job.id },
    });
    await completeDepartmentTiming({
      actorUserId: 'test-user-id',
      db: context.db,
      input: { crewUserIds: ['fabricator-id'], department: 'fabrication', id: context.job.id },
    });
    await updateDepartmentTiming({
      actorUserId: 'test-user-id',
      db: context.db,
      input: {
        completedAt: DateIso.parse('2026-08-04T15:00:00.000Z'),
        crewUserIds: ['fabricator-id'],
        department: 'fabrication',
        id: context.job.id,
        startedAt: DateIso.parse('2026-08-01T09:00:00.000Z'),
      },
    });
    await updateDepartmentTiming({
      actorUserId: 'test-user-id',
      db: context.db,
      input: {
        completedAt: null,
        crewUserIds: [],
        department: 'fabrication',
        id: context.job.id,
        startedAt: null,
      },
    });

    for (const [search, expectedActions] of [
      ['FABRICATION', ['cleared', 'completed', 'corrected', 'started']],
      ['completed fabrication work', ['completed']],
      ['corrected fabrication work times', ['corrected']],
      ['cleared fabrication work times', ['cleared']],
      ['fiona fabricator', ['completed', 'corrected']],
      ['[', []],
    ] as const) {
      const result = await listJobActivity({
        db: context.db,
        input: listInput({ filter: 'work-times', search }),
      });

      expect(
        result.items.map((item) => (item.type === 'job-work-time-updated' ? item.action : item.type)).sort(),
      ).toEqual([...expectedActions].sort());
    }
  });

  test('carries a cleared description as null rather than dropping the edit', async ({ context }) => {
    await updateJob({
      actorUserId: 'test-user-id',
      db: context.db,
      input: { id: context.job.id, description: 'Fit the heavy-duty boom.' },
    });
    await updateJob({ actorUserId: 'test-user-id', db: context.db, input: { id: context.job.id, description: null } });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items[0]).toMatchObject({ type: 'job-description-updated', description: null });
  });

  test('renders one patch that both completed and reworded a Job once, as the completion', async ({ context }) => {
    await updateJob({
      actorUserId: 'test-user-id',
      db: context.db,
      input: {
        id: context.job.id,
        completedOn: DateOnlyIso.parse('2026-08-10'),
        description: 'Signed off by the foreman.',
      },
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.total).toBe(1);
    expect(result.items).toEqual([expect.objectContaining({ type: 'job-completed', completedOn: '2026-08-10' })]);
  });

  test('shows nothing for un-completing a Job, and a fresh item for re-completing it', async ({ context }) => {
    await updateJob({
      actorUserId: 'test-user-id',
      db: context.db,
      input: { id: context.job.id, completedOn: DateOnlyIso.parse('2026-08-10'), description: null },
    });
    await updateJob({
      actorUserId: 'test-user-id',
      db: context.db,
      input: { id: context.job.id, completedOn: null, description: null },
    });
    await updateJob({
      actorUserId: 'test-user-id',
      db: context.db,
      input: { id: context.job.id, completedOn: DateOnlyIso.parse('2026-08-12'), description: null },
    });

    const result = await listJobActivity({ db: context.db, input: listInput({ sortDirection: 'asc' }) });

    expect(result.items).toEqual([
      expect.objectContaining({ type: 'job-completed', completedOn: '2026-08-10' }),
      expect.objectContaining({ type: 'job-completed', completedOn: '2026-08-12' }),
    ]);
  });

  test('reads a document added to a Job as a job-document-added item naming the file', async ({ context }) => {
    await recordDocumentCreated(context.db, { jobId: context.job.id });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items[0]).toMatchObject({
      type: 'job-document-added',
      job: { id: context.job.id },
      document: { contentType: 'application/pdf', filename: 'handover.pdf' },
    });
  });

  test('keeps a document entry after the document itself is deleted', async ({ context }) => {
    const document = await recordDocumentCreated(context.db, { jobId: context.job.id });

    await context.db.delete(documents).where(eq(documents.id, document.id));

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items[0]).toMatchObject({ type: 'job-document-added', document: { filename: 'handover.pdf' } });
  });

  test('never shows a document that belongs to no Job', async ({ context }) => {
    await recordDocumentCreated(context.db, { jobId: null, productId: context.product.id });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  // Creating a Job snapshots its Brochure through the audited document path, so without this the
  // feed would report a file nobody added beside every single job-created entry.
  test('never shows the Brochure a Job generates for itself at creation', async ({ context }) => {
    await recordDocumentCreated(context.db, { jobId: context.job.id, type: 'brochure' });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  test('never shows a Job cancellation or an edit to a field the feed does not curate', async ({ context }) => {
    await context.db.transaction(async (tx) => {
      await recordAuditDelete({
        db: tx,
        descriptor: jobAuditDescriptor,
        actorUserId: 'test-user-id',
        input: context.job,
      });
    });
    await context.db.insert(auditEvents).values({
      action: 'updated',
      actorUserId: 'test-user-id',
      changes: { productUnitId: { from: null, to: '00000000-0000-4000-8000-00000000000a' } },
      entityId: context.job.id,
      entityType: 'job',
      summary: 'Updated job "JOB-00001"',
    });

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  test('leaves the actor null once the acting user is deleted', async ({ context }) => {
    await createUser(context.db, { id: 'departed-user-id', name: 'Departed User' });
    await recordJobCreated(context.db, context.job, { actorUserId: 'departed-user-id' });
    await context.db.delete(user).where(eq(user.id, 'departed-user-id'));

    const result = await listJobActivity({ db: context.db, input: listInput() });

    expect(result.items[0]).toMatchObject({ type: 'job-created', actor: null });
  });

  test('merges both sources into one stream ordered by when each happened', async ({ context }) => {
    await insertFeedback(context.db, {
      createdAt: new Date('2026-08-01T09:00:00.000Z'),
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Oldest.',
    });
    await recordJobCreated(context.db, context.job, { occurredAt: new Date('2026-08-02T09:00:00.000Z') });
    await insertFeedback(context.db, {
      createdAt: new Date('2026-08-03T09:00:00.000Z'),
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'Newest.',
    });

    const result = await listJobActivity({ db: context.db, input: listInput({ sortDirection: 'asc' }) });

    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.type)).toEqual(['general-feedback', 'job-created', 'general-feedback']);
  });

  test('filters User Feedback from every non-feedback Job Event type', async ({ context }) => {
    await insertFeedback(context.db, {
      jobId: context.job.id,
      kind: 'general',
      subjectType: 'job',
      text: 'A user note.',
    });
    await recordJobCreated(context.db, context.job);
    await updateJob({
      actorUserId: 'test-user-id',
      db: context.db,
      input: { id: context.job.id, description: 'Fit the heavy-duty boom.' },
    });
    await updateJob({
      actorUserId: 'test-user-id',
      db: context.db,
      input: {
        id: context.job.id,
        completedOn: DateOnlyIso.parse('2026-08-10'),
        description: 'Fit the heavy-duty boom.',
      },
    });
    await recordDocumentCreated(context.db, { jobId: context.job.id });

    const feedbackResult = await listJobActivity({
      db: context.db,
      input: listInput({ filter: 'user-feedback' }),
    });
    const eventResult = await listJobActivity({ db: context.db, input: listInput({ filter: 'job-events' }) });

    expect(feedbackResult.total).toBe(1);
    expect(feedbackResult.items.map((item) => item.type)).toEqual(['general-feedback']);
    expect(eventResult.total).toBe(4);
    expect(eventResult.items.map((item) => item.type).sort()).toEqual(
      ['job-completed', 'job-created', 'job-description-updated', 'job-document-added'].sort(),
    );
  });

  test('filters feedback and every Job Event source to one Job', async ({ context }) => {
    const otherJob = await createStockJob(context.db, context.product.id);

    for (const job of [context.job, otherJob]) {
      await insertFeedback(context.db, {
        jobId: job.id,
        kind: 'general',
        subjectType: 'job',
        text: `Feedback for ${job.id}`,
      });
      await recordJobCreated(context.db, job);
      await recordDocumentCreated(context.db, { jobId: job.id });
    }

    const result = await listJobActivity({
      db: context.db,
      input: listInput({ jobId: context.job.id }),
    });

    expect(result.total).toBe(3);
    expect(result.items.every((item) => item.job.id === context.job.id)).toBe(true);
    expect(result.items.map((item) => item.type).sort()).toEqual(
      ['general-feedback', 'job-created', 'job-document-added'].sort(),
    );
  });

  // Both directions, because the union orders on its own aliased columns rather than on a table's:
  // a direction applied to only one of the two order keys would still page, just wrongly.
  test.for([
    {
      expected: ['general-feedback', 'job-created', 'general-feedback'],
      sortDirection: 'asc' as const,
      tail: 'job-created',
    },
    {
      expected: ['job-created', 'general-feedback', 'job-created'],
      sortDirection: 'desc' as const,
      tail: 'general-feedback',
    },
  ])(
    'pages $sortDirection across the two sources without repeating or dropping an entry',
    async ({ expected, sortDirection, tail }, { context }) => {
      for (let index = 0; index < 2; index += 1) {
        await insertFeedback(context.db, {
          createdAt: new Date(`2026-08-0${index * 2 + 1}T09:00:00.000Z`),
          jobId: context.job.id,
          kind: 'general',
          subjectType: 'job',
          text: `Said ${index}`,
        });
        await recordJobCreated(context.db, context.job, {
          occurredAt: new Date(`2026-08-0${index * 2 + 2}T09:00:00.000Z`),
        });
      }

      const firstPage = await listJobActivity({ db: context.db, input: listInput({ limit: 3, sortDirection }) });
      const secondPage = await listJobActivity({
        db: context.db,
        input: listInput({ cursor: firstPage.nextCursor ?? 0, limit: 3, sortDirection }),
      });

      expect(firstPage.total).toBe(4);
      expect(firstPage.items.map((item) => item.type)).toEqual(expected);
      expect(secondPage.items.map((item) => item.type)).toEqual([tail]);
      expect(secondPage.nextCursor).toBeNull();
    },
  );
});

function listInput(overrides: Partial<Parameters<typeof listJobActivity>[0]['input']> = {}) {
  return {
    cursor: 0,
    filter: 'all' as const,
    limit: 25,
    search: '',
    sortBy: 'occurredAt' as const,
    sortDirection: 'desc' as const,
    ...overrides,
  };
}

/** Names a leaked change item by its type rather than throwing, so a wrong item reads in the diff. */
function feedbackTexts(items: JobActivityItem[]): string[] {
  return items.map((item) => (item.type === 'general-feedback' ? item.feedback.text : item.type));
}

async function insertFeedback(db: Db, values: Omit<typeof feedback.$inferInsert, 'submitterId'>) {
  await db.insert(feedback).values({ ...values, submitterId: 'test-user-id' });
}

/** The real descriptor, so the feed's predicate is pinned against the shape the Job service writes. */
async function recordJobCreated(
  db: Db,
  job: typeof jobs.$inferSelect,
  { actorUserId = 'test-user-id', occurredAt }: { actorUserId?: string; occurredAt?: Date } = {},
) {
  await db.transaction(async (tx) => {
    await recordAuditCreate({ db: tx, descriptor: jobAuditDescriptor, actorUserId, input: job });
  });

  if (!occurredAt) {
    return;
  }

  // The row just written is the newest, because every stamp this file sets is a date in the past.
  const [written] = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(eq(auditEvents.entityId, job.id))
    .orderBy(desc(auditEvents.occurredAt))
    .limit(1);

  if (!written) {
    throw new Error('Job created audit event was not written');
  }

  await db.update(auditEvents).set({ occurredAt }).where(eq(auditEvents.id, written.id));
}

async function recordDocumentCreated(
  db: Db,
  owner: { jobId?: string | null; productId?: string | null; type?: JobDocumentType },
) {
  const [document] = await db
    .insert(documents)
    .values({
      byteSize: 1024,
      contentType: 'application/pdf',
      filename: 'handover.pdf',
      jobId: owner.jobId ?? null,
      metadata: { type: owner.type ?? 'general' },
      ownerType: owner.jobId ? 'job' : 'product',
      productId: owner.productId ?? null,
      storageKey: `documents/${owner.jobId ?? owner.productId}/handover.pdf`,
      uploaderUserId: 'test-user-id',
    })
    .returning();

  if (!document) {
    throw new Error('Document insert did not return a row');
  }

  await db.transaction(async (tx) => {
    await recordAuditCreate({
      db: tx,
      descriptor: documentAuditDescriptor,
      actorUserId: 'test-user-id',
      input: document,
    });
  });

  return document;
}

async function createSubmitter(db: Db) {
  await createUser(db, { id: 'test-user-id', name: 'Test User' });
}

async function createUser(
  db: Db,
  { id, name, role = 'admin' }: { id: string; name: string; role?: typeof user.$inferInsert.role },
) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: `${id}@example.com`,
    emailVerified: true,
    id,
    image: SUBMITTER_THUMBNAIL_DATA_URL,
    name,
    role,
    updatedAt: now,
  });
}

async function createProduct(db: Db) {
  const rangeId = await createProductRangeFixture(db);
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      modelCode: 'ACTIVITY-001',
      name: 'Job Activity Test Product',
      rangeId,
      thumbnailDataUrl: PRODUCT_THUMBNAIL_DATA_URL,
    })
    .returning();

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}

async function createQuote(db: Db, productId: string) {
  const [customer] = await db.insert(customers).values({ companyName: 'Activity Customer', email: null }).returning();

  if (!customer) {
    throw new Error('Customer insert did not return a row');
  }

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      productId,
      quotedBasePrice: 1000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
    })
    .returning();

  if (!quote) {
    throw new Error('Quote insert did not return a row');
  }

  return quote;
}

/** A Stock Build: its own Unit, no Quote, so no Customer bought it. */
async function createStockJob(db: Db, productId: string) {
  const [unit] = await db
    .insert(productUnits)
    .values({
      productId,
      productSerialNumber: 'FB-26-0002',
      productSerialPrefix: 'FB',
      productSerialSequence: 2,
      productSerialYear: 26,
    })
    .returning({ id: productUnits.id });

  if (!unit) {
    throw new Error('Product unit insert did not return a row');
  }

  const [job] = await db.insert(jobs).values({ productUnitId: unit.id, quoteId: null }).returning();

  if (!job) {
    throw new Error('Job insert did not return a row');
  }

  return job;
}

async function createJob(
  db: Db,
  { customerId, productId, quoteId }: { customerId: string; productId: string; quoteId: string },
) {
  const [unit] = await db
    .insert(productUnits)
    .values({
      productId,
      productSerialNumber: 'FB-26-0001',
      productSerialPrefix: 'FB',
      productSerialSequence: 1,
      productSerialYear: 26,
    })
    .returning({ id: productUnits.id });

  if (!unit) {
    throw new Error('Product unit insert did not return a row');
  }

  // A sold machine leaves Stock through the ownership log, which is where its Customer is read from.
  await db.insert(productUnitOwnershipTransfers).values({
    occurredOn: '2026-08-01',
    productUnitId: unit.id,
    sourceQuoteId: quoteId,
    toCustomerId: customerId,
  });

  const [job] = await db.insert(jobs).values({ productUnitId: unit.id, quoteId }).returning();

  if (!job) {
    throw new Error('Job insert did not return a row');
  }

  return job;
}
