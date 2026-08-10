import {
  createEscapedContainsSearchCondition,
  currentOwnerCustomerId,
  customers,
  type DatabaseTransaction,
  type Db,
  documents,
  getPaginationQueryOptions,
  jobBays,
  jobCfoAssemblies,
  jobCfoParts,
  jobSlots,
  jobs,
  parts,
  products,
  productUnits,
  purchaseOrderJobLinks,
  quotes,
  quoteWorkItems,
  user,
} from '@pkg/db';
import {
  countWorkingDaysBetween,
  departmentLabels,
  foldJobScheduleStates,
  getBoardJobIds,
  getPlantDateNow,
  parseJobCodeSearch,
  resolveBoardWindowFrom,
  resolveJobCustomer,
  resolveNewestOwnershipTransfer,
  sliceJobSchedule,
  summarizeSlotCalendarDays,
  windowActiveBoard,
} from '@pkg/domain';
import {
  type BoardListInput,
  type BoardListResult,
  type DateOnlyIso,
  getNextCursor,
  type JobCustomerOptionListInput,
  type JobCustomerOptionListResult,
  type JobDetail,
  type JobDetailDepartmentSchedule,
  type JobListInput,
  type JobListResult,
  type JobScheduleState,
  type JobSortBy,
  type JobSummary,
  JobVisibleDocument,
  type ProjectedBayQueue,
  type ProjectedWorkJobSlot,
  QuoteCode,
  type SortDirection,
  UUID,
} from '@pkg/schema';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { DocumentNotFoundError } from '../documents/document-errors.js';
import {
  type DocumentSummaryRow,
  documentBaseSelect,
  mapDocumentSummary,
  type ReadDocumentResult,
} from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { isPurchaseOrderPdf } from '../purchase-orders/purchase-order-service.js';
import {
  findBoardBayRows,
  findBoardBayRowsForJobs,
  type ProjectedBoardQueues,
  toProjectedBoard,
  withoutCancelledJobSlots,
} from './board-read.js';
import { JobNotFoundError } from './job-errors.js';
import { type JobProductUnitRow, type JobRow, mapJob } from './job-mappers.js';
import { listWorkingCalendarOffDays } from './working-calendar-service.js';

type ProductRow = Pick<typeof products.$inferSelect, 'buildTimeDays' | 'modelCode' | 'name' | 'thumbnailDataUrl'>;
type CustomerRow = Pick<typeof customers.$inferSelect, 'companyName' | 'id' | 'thumbnailDataUrl'>;

// The machine a Job is bound to, and the log that says who owns it now. Every Job read pulls this,
// because the serial, VIN, Product, and Customer are all facts about the machine, not about the Job.
const productUnitWith = {
  columns: {
    productSerialNumber: true,
    vinNumber: true,
  },
  with: {
    ownershipTransfers: {
      columns: { createdAt: true, id: true, occurredOn: true, toCustomerId: true },
      with: { toCustomer: { columns: { companyName: true, id: true, thumbnailDataUrl: true } } },
    },
    product: {
      columns: { buildTimeDays: true, id: true, modelCode: true, name: true, thumbnailDataUrl: true },
    },
  },
} as const;

// The sale behind a Job, and the Customer that bought it. Null on a Stock Build, which has no sale.
const jobQuoteWith = {
  columns: {
    code: true,
    kind: true,
    workTitle: true,
  },
  with: {
    customer: {
      columns: { companyName: true, id: true, thumbnailDataUrl: true },
    },
  },
} as const;
type CustomQuoteWorkRow = Pick<
  typeof quoteWorkItems.$inferSelect,
  'department' | 'description' | 'hours' | 'id' | 'name'
>;
type QuoteRow = Pick<typeof quotes.$inferSelect, 'code' | 'kind' | 'workTitle'> & {
  customer: CustomerRow;
};
type JobDetailQuoteRow = QuoteRow & {
  workItems: CustomQuoteWorkRow[];
};

type JobProductUnitWithOwnershipRow = JobProductUnitRow & {
  ownershipTransfers: {
    createdAt: Date;
    id: string;
    occurredOn: string;
    toCustomerId: string | null;
    toCustomer: CustomerRow | null;
  }[];
  product: (ProductRow & { id: string }) | null;
};

type JobWithProductRow = JobRow & {
  productUnit: JobProductUnitWithOwnershipRow | null;
  // Null on a Stock Build: no sale, so no Quote code, kind, work title, or Customer to read.
  quote: QuoteRow | null;
};

type JobDocumentRow = DocumentSummaryRow & {
  sourceProductName: string | null;
};

export type BayQueueAvailability = {
  bayId: UUID;
  department: ProjectedBayQueue['department'];
  name: ProjectedBayQueue['name'];
  nextAvailableDate: ProjectedBayQueue['nextAvailableDate'];
  waitWorkingDays: number;
};

export async function listJobCustomerOptions({
  db,
  input,
}: {
  db: Db;
  input: JobCustomerOptionListInput;
}): Promise<JobCustomerOptionListResult> {
  // The options a Job filter offers must be the Customers that filter would actually match, so they
  // come from the same rule the list displays: the machine's Owner, or the Quote for a Custom Job.
  const jobCustomerIds = db
    .selectDistinct({ customerId: jobCustomerIdExpression(quotes.customerId) })
    .from(jobs)
    // Left, not inner: a Stock Build has a Unit and no Quote, and must still contribute its Owner.
    .leftJoin(quotes, eq(jobs.quoteId, quotes.id))
    .where(isNull(jobs.cancelledAt));
  const conditions: SQL[] = [inArray(customers.id, jobCustomerIds)];

  if (input.search) {
    conditions.push(createEscapedContainsSearchCondition(sql`${customers.companyName}`, input.search));
  }

  const where = and(...conditions) as SQL;
  const sortColumn = input.sortBy === 'id' ? customers.id : customers.companyName;
  const orderBy = input.sortDirection === 'desc' ? desc(sortColumn) : asc(sortColumn);
  const rows = await db.query.customers.findMany({
    columns: {
      companyName: true,
      id: true,
    },
    orderBy: [orderBy, asc(customers.id)],
    where,
    ...getPaginationQueryOptions(input),
  });
  const total = await db.$count(customers, where);

  return {
    items: rows,
    nextCursor: getNextCursor({ count: rows.length, cursor: input.cursor, total }),
    total,
  };
}

export async function listBays({
  db,
  input,
}: {
  db: Db | DatabaseTransaction;
  input?: BoardListInput | undefined;
}): Promise<BoardListResult> {
  const [offDays, rows] = await Promise.all([listWorkingCalendarOffDays(db), findBoardBayRows(db)]);
  const today = getPlantDateNow();
  const items = windowActiveBoard(toProjectedBoard(rows, { offDays, today }).queues, {
    from: resolveBoardWindowFrom(input, today),
    today,
  });

  // Resolve product/customer detail only for the Jobs actually on the board (one summary per Job, even
  // when it spans several Bays), so clients label Slots without an unpaged full-Jobs read.
  const scheduledJobIds = getBoardJobIds(items);

  return {
    items,
    jobs: await listJobSummariesByIds({ db, jobIds: scheduledJobIds }),
    offDays,
    // Plant "today" enters here, at the server boundary — the client never derives it.
    today,
  };
}

// Cap the IN list per query so a long-lived board with many historical slotted Jobs never binds past
// PostgreSQL's parameter limit (~65k) — which would fail the whole `listBays` read, not just enlarge it.
const JOB_SUMMARY_LOOKUP_BATCH_SIZE = 1000;

async function listJobSummariesByIds({
  db,
  jobIds,
}: {
  db: Db | DatabaseTransaction;
  jobIds: readonly UUID[];
}): Promise<JobSummary[]> {
  const summaries: JobSummary[] = [];

  for (let start = 0; start < jobIds.length; start += JOB_SUMMARY_LOOKUP_BATCH_SIZE) {
    const batch = jobIds.slice(start, start + JOB_SUMMARY_LOOKUP_BATCH_SIZE);
    const rows = await db.query.jobs.findMany({
      columns: {
        cancelledAt: true,
        createdAt: true,
        completedOn: true,
        id: true,
        code: true,
        productUnitId: true,
        quoteId: true,
        updatedAt: true,
        description: true,
      },
      where: inArray(jobs.id, batch),
      with: {
        productUnit: productUnitWith,
        quote: jobQuoteWith,
      },
    });

    for (const row of rows) {
      summaries.push(mapJobSummary(row));
    }
  }

  return summaries;
}

export async function listBayQueueAvailability({
  bayIds,
  db,
}: {
  bayIds: readonly UUID[];
  db: Db | DatabaseTransaction;
}): Promise<BayQueueAvailability[]> {
  if (bayIds.length === 0) {
    return [];
  }

  const [offDays, rows] = await Promise.all([
    listWorkingCalendarOffDays(db),
    findBoardBayRows(db, inArray(jobBays.id, bayIds)),
  ]);
  const today = getPlantDateNow();
  const { queues, workingCalendarsByBayId } = toProjectedBoard(withoutCancelledJobSlots(rows), { offDays, today });

  return queues.map((schedule) => {
    const workingCalendar = workingCalendarsByBayId.get(schedule.id) ?? {};

    return {
      bayId: schedule.id,
      department: schedule.department,
      name: schedule.name,
      nextAvailableDate: schedule.nextAvailableDate,
      waitWorkingDays: countWorkingDaysBetween(today, schedule.nextAvailableDate, workingCalendar),
    };
  });
}

// Projecting a Job's schedule only needs the bays that actually hold one of its Work Slots — the only
// queues whose reflow can move that Job's Slot dates. An inline subquery restricts the projection to
// those bays rather than a separate round trip or the whole shop floor; Idle Slots carry a null jobId,
// so matching on jobId already scopes to Work Slots. Off-Days load in parallel since they don't depend
// on which bays match.
async function findProjectedBaysForJobs({
  db,
  jobIds,
  today,
}: {
  db: Db | DatabaseTransaction;
  jobIds: readonly UUID[];
  today: DateOnlyIso;
}): Promise<ProjectedBayQueue[]> {
  return (await findProjectedBoardForJobs({ db, jobIds, today })).queues;
}

async function findProjectedBoardForJobs({
  db,
  jobIds,
  today,
}: {
  db: Db | DatabaseTransaction;
  jobIds: readonly UUID[];
  today: DateOnlyIso;
}): Promise<ProjectedBoardQueues> {
  const [offDays, rows] = await Promise.all([listWorkingCalendarOffDays(db), findBoardBayRowsForJobs({ db, jobIds })]);

  return toProjectedBoard(rows, { offDays, today });
}

async function getJobSchedule({
  db,
  jobId,
}: {
  db: Db | DatabaseTransaction;
  jobId: UUID;
}): Promise<JobDetailDepartmentSchedule[]> {
  const projectedBoard = await findProjectedBoardForJobs({ db, jobIds: [jobId], today: getPlantDateNow() });

  return sliceJobSchedule(projectedBoard.queues, jobId).map((department) => ({
    ...department,
    bays: department.bays.map((bay) => {
      const workingCalendar = projectedBoard.workingCalendarsByBayId.get(bay.id) ?? {};

      return {
        ...bay,
        slots: bay.slots.filter(isProjectedWorkJobSlot).map((slot) => ({
          ...slot,
          dayBreakdown: summarizeSlotCalendarDays(slot.startDate, slot.endDate, workingCalendar),
          operator: bay.currentOperator,
        })),
      };
    }),
  }));
}

function isProjectedWorkJobSlot(slot: ProjectedBayQueue['slots'][number]): slot is ProjectedWorkJobSlot {
  return slot.kind === 'work';
}

export async function listJobs({ db, input }: { db: Db; input: JobListInput }): Promise<JobListResult> {
  const where = buildJobListWhere(input);
  const orderBy = getJobSortOrder(input.sortBy, input.sortDirection);

  const rows = await db.query.jobs.findMany({
    columns: {
      cancelledAt: true,
      createdAt: true,
      completedOn: true,
      id: true,
      code: true,
      productUnitId: true,
      quoteId: true,
      updatedAt: true,
      description: true,
    },
    where,
    orderBy: [orderBy, asc(jobs.id)],
    ...getPaginationQueryOptions(input),
    with: {
      productUnit: productUnitWith,
      quote: jobQuoteWith,
    },
  });

  const total = await db.$count(jobs, where);

  // Schedule state is a Slot projection, so resolve it only for the returned page. Most callers omit
  // the include; the booking dialog opts in because its Job picker filters on projected state.
  const scheduleStates = input.include?.scheduleState
    ? await computeJobScheduleStates({ db, jobIds: rows.map((row) => UUID.parse(row.id)) })
    : null;
  const items = rows.map((row) => mapJobSummary(row, scheduleStates?.get(UUID.parse(row.id)) ?? null));

  return {
    items,
    nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }),
    total,
  };
}

async function computeJobScheduleStates({
  db,
  jobIds,
}: {
  db: Db;
  jobIds: readonly UUID[];
}): Promise<Map<UUID, JobScheduleState>> {
  if (jobIds.length === 0) {
    return foldJobScheduleStates([], jobIds);
  }

  return foldJobScheduleStates(await findProjectedBaysForJobs({ db, jobIds, today: getPlantDateNow() }), jobIds);
}

/**
 * Body of a correlated subquery over a Job's Work Slots, for use inside a `db.query.jobs` (RQB) read.
 * The inner table gets a caller-supplied raw alias because the RQB rewrites drizzle column refs inside
 * a raw `sql` fragment to the outer Job alias — only `${jobs.id}` should correlate outward. Idle Slots
 * carry a null jobId, so `kind = 'work'` is the Work-Slot filter.
 */
function jobWorkSlotCountSubquery(): SQL {
  const slot = sql.raw('"sort_slot"');
  return sql`select count(*) from ${jobSlots} ${slot} where ${slot}."job_id" = ${jobs.id} and ${slot}."kind" = 'work'`;
}

function jobQuoteWorkTitleSearchCondition(alias: 'search_quote', search: string): SQL {
  const quote = sql.raw(`"${alias}"`);

  return sql`exists (
    select 1
    from ${quotes} ${quote}
    where ${quote}."id" = ${jobs.quoteId}
      and ${createEscapedContainsSearchCondition(sql`${quote}."work_title"`, search)}
  )`;
}

/**
 * Filtering has to agree with what the list shows, so it follows the same rule the display does: a
 * Unit-bound Job matches on the machine's newest Ownership Transfer, and a Custom Job on its Quote.
 * Matching the Quote for a Unit-bound Job would surface machines their first buyer no longer owns.
 */
function jobCustomerFilterCondition(alias: 'filter_customer_quote', customerId: UUID): SQL {
  const quote = sql.raw(`"${alias}"`);
  const quoteCustomerId = sql`(select ${quote}."customer_id" from ${quotes} ${quote} where ${quote}."id" = ${jobs.quoteId})`;

  return sql`${jobCustomerIdExpression(quoteCustomerId)} = ${customerId}`;
}

/**
 * Which Customer a Job counts as, in SQL — the same rule `resolveJobCustomer` applies in TypeScript.
 * A Unit-bound Job resolves to its machine's Owner and to `NULL` when we hold it, which is how Stock
 * drops out of both the filter and the options it offers; only a Custom Job falls back to its Quote.
 */
function jobCustomerIdExpression(quoteCustomerId: SQL | SQLWrapper): SQL<string | null> {
  return sql`case when ${jobs.productUnitId} is null then ${quoteCustomerId} else ${currentJobOwnerId} end`;
}

/**
 * The inner table's columns are written against an explicit alias rather than through its Drizzle
 * columns. The relational query API rewrites every Drizzle column reference in a `where` to the outer
 * Job alias, which would silently turn `unit.product_serial_number` into `jobs.product_serial_number` —
 * the same reason the Quote conditions nearby take an alias.
 */
const sortSerialUnitAlias = sql.raw('"sort_unit"');

/** The Customer holding this Job's machine now, or `NULL` when we hold it. */
const currentJobOwnerId = currentOwnerCustomerId(jobs.productUnitId);

/** The serial the list displays: the machine's, not the Job's own stale column. */
const jobProductSerialExpression = sql<string | null>`(
  select ${sortSerialUnitAlias}."product_serial_number"
  from ${productUnits} ${sortSerialUnitAlias}
  where ${sortSerialUnitAlias}."id" = ${jobs.productUnitId}
)`;

/** Serial lives on the machine now, so serial search and filtering read it there. */
function jobProductSerialCondition(search: string): SQL {
  const unit = sql.raw('"search_unit"');

  return sql`exists (
    select 1
    from ${productUnits} ${unit}
    where ${unit}."id" = ${jobs.productUnitId}
      and ${createEscapedContainsSearchCondition(sql`${unit}."product_serial_number"`, search)}
  )`;
}

/**
 * The Job List's filter, exported because the sales export answers for the rows the list is
 * showing: two where-builders would drift, and a CSV that disagrees with the table above it is
 * worse than no CSV. Takes only the filtering half of the input so a caller that has no pagination
 * or sort to offer can still ask the question.
 */
export function buildJobListWhere(input: Pick<JobListInput, 'columnFilters' | 'filters' | 'search'>): SQL | undefined {
  const conditions: SQL[] = [isNull(jobs.cancelledAt)];

  if (input.filters.jobId) {
    conditions.push(eq(jobs.id, input.filters.jobId));
  }

  if (input.filters.createdAtStart) {
    conditions.push(gte(jobs.createdAt, new Date(input.filters.createdAtStart)));
  }

  if (input.filters.incompleteOnly) {
    conditions.push(isNull(jobs.completedOn));
  }

  if (input.columnFilters.completedOnStart) {
    conditions.push(gte(jobs.completedOn, input.columnFilters.completedOnStart));
  }

  if (input.columnFilters.completedOnEnd) {
    conditions.push(lte(jobs.completedOn, input.columnFilters.completedOnEnd));
  }

  if (input.columnFilters.customerId) {
    conditions.push(jobCustomerFilterCondition('filter_customer_quote', input.columnFilters.customerId));
  }

  if (input.columnFilters.productSerialNumber) {
    conditions.push(jobProductSerialCondition(input.columnFilters.productSerialNumber));
  }

  if (input.columnFilters.code) {
    const codeFilter = parseJobCodeSearch(input.columnFilters.code);

    conditions.push(
      codeFilter === undefined
        ? createEscapedContainsSearchCondition(sql`${jobs.code}::text`, input.columnFilters.code)
        : eq(jobs.code, codeFilter),
    );
  }

  if (input.search) {
    const codeSearch = parseJobCodeSearch(input.search);
    const searchWhere = or(
      createEscapedContainsSearchCondition(sql`${jobs.id}::text`, input.search),
      createEscapedContainsSearchCondition(sql`${jobs.code}::text`, input.search),
      jobProductSerialCondition(input.search),
      jobQuoteWorkTitleSearchCondition('search_quote', input.search),
      codeSearch === undefined ? undefined : eq(jobs.code, codeSearch),
    );

    if (searchWhere) {
      conditions.push(searchWhere);
    }
  }

  return and(...conditions);
}

export async function getJob({ db, id }: { db: Db | DatabaseTransaction; id: UUID }): Promise<JobDetail> {
  const row = await db.query.jobs.findFirst({
    columns: {
      cancelledAt: true,
      createdAt: true,
      completedOn: true,
      code: true,
      id: true,
      productUnitId: true,
      quoteId: true,
      updatedAt: true,
      description: true,
    },
    where: eq(jobs.id, id),
    with: {
      productUnit: productUnitWith,
      // The Job sheet also lists the Custom Quote's Work Items, which no list read needs.
      quote: {
        ...jobQuoteWith,
        with: {
          ...jobQuoteWith.with,
          workItems: {
            columns: {
              department: true,
              description: true,
              hours: true,
              id: true,
              name: true,
            },
            orderBy: [asc(quoteWorkItems.position), asc(quoteWorkItems.createdAt), asc(quoteWorkItems.id)],
          },
        },
      },
    },
  });

  if (!row) {
    throw new JobNotFoundError(id);
  }

  const [cfo, documents, workRows, schedule] = await Promise.all([
    listJobCfo({ db, jobId: row.id }),
    listJobDocumentRows({ db, jobId: row.id }),
    listJobWorkRows(row.quote),
    getJobSchedule({ db, jobId: row.id }),
  ]);

  return {
    ...mapJobSummary(row),
    cfo,
    documents,
    schedule,
    workRows,
  };
}

/**
 * The one place a read turns stored rows into "who does this Job belong to". A Unit-bound Job follows
 * its machine's current Owner — `null` means Stock — and a Custom Job follows its Quote.
 */
function resolveJobCustomerForRow(row: {
  productUnit: JobProductUnitWithOwnershipRow | null;
  quote: { customer: CustomerRow | null } | null;
}): CustomerRow | null {
  return resolveJobCustomer({
    productUnit: row.productUnit
      ? { owner: resolveNewestOwnershipTransfer(row.productUnit.ownershipTransfers)?.toCustomer ?? null }
      : null,
    quoteCustomer: row.quote?.customer ?? null,
  });
}

function listJobWorkRows(quote: Pick<JobDetailQuoteRow, 'kind' | 'workItems'> | null): JobDetail['workRows'] {
  if (quote?.kind !== 'custom') return [];

  // The floor reads the internal Department label, not the quote-facing one, so a row points at the
  // department that actually owns the bay and the people.
  return quote.workItems.map((workItem) => ({
    department: workItem.department,
    description: workItem.description,
    hours: workItem.hours,
    id: workItem.id,
    name: workItem.department ? departmentLabels[workItem.department] : (workItem.name ?? ''),
  }));
}

export async function getJobDocuments({
  db,
  jobId,
}: {
  db: Db | DatabaseTransaction;
  jobId: UUID;
}): Promise<JobDetail['documents']> {
  await assertJobExists({ db, jobId });

  return listJobDocumentRows({ db, jobId });
}

async function listJobDocumentRows({
  db,
  jobId,
}: {
  db: Db | DatabaseTransaction;
  jobId: UUID;
}): Promise<JobDetail['documents']> {
  const rows = await selectJobDocuments(db).where(jobVisibleDocumentWhere(db, jobId)).orderBy(asc(documents.filename));

  return rows.map(mapJobDocument);
}

export async function readJobDocument({
  db,
  documentId,
  jobId,
  storage,
}: {
  db: Db;
  documentId: UUID;
  jobId: UUID;
  storage: StorageAdapter;
}): Promise<ReadDocumentResult> {
  // Finding the document proves the Job exists (the document is scoped to its jobId), so only fall
  // back to the existence check on a miss to distinguish a missing Job from a missing document.
  const document = await findJobDocumentSummaryRow({ db, documentId, jobId });

  if (!document) {
    await assertJobExists({ db, jobId });
    throw new DocumentNotFoundError(documentId);
  }

  return {
    document: mapDocumentSummary(document),
    object: await storage.get(document.storageKey),
  };
}

function selectJobDocuments(db: Db | DatabaseTransaction) {
  return db
    .select({
      ...documentBaseSelect,
      sourceProductName: products.name,
      uploaderEmail: user.email,
      uploaderName: user.name,
    })
    .from(documents)
    .leftJoin(products, eq(documents.sourceProductId, products.id))
    .leftJoin(user, eq(documents.uploaderUserId, user.id))
    .$dynamic();
}

async function findJobDocumentSummaryRow({
  db,
  documentId,
  jobId,
}: {
  db: Db;
  documentId: UUID;
  jobId: UUID;
}): Promise<DocumentSummaryRow | null> {
  const [row] = await selectJobDocuments(db)
    .where(and(jobVisibleDocumentWhere(db, jobId), eq(documents.id, documentId)))
    .limit(1);

  return row ?? null;
}

function mapJobDocument(row: JobDocumentRow): JobDetail['documents'][number] {
  return JobVisibleDocument.parse({
    byteSize: row.byteSize,
    contentType: row.contentType,
    createdAt: row.createdAt.toISOString(),
    filename: row.filename,
    id: row.id,
    jobId: row.jobId,
    metadata: row.metadata,
    ownerType: row.ownerType,
    productId: row.productId,
    purchaseOrderId: row.purchaseOrderId,
    quoteId: row.quoteId,
    sourceProductId: row.sourceProductId,
    sourceProductName: row.sourceProductName,
    uploaderEmail: row.uploaderEmail,
    uploaderName: row.uploaderName,
    uploaderUserId: row.uploaderUserId,
  });
}

/**
 * A Job sees its own documents plus the *order PDFs* of every Purchase Order raised for it (spec
 * §4). Deliberately not the credit notes filed in the same collection: those answer a return to the
 * Supplier and are procurement's commercial paper, with nothing to say about the work on this Job.
 */
function jobVisibleDocumentWhere(db: Db | DatabaseTransaction, jobId: UUID): SQL {
  const linkedPurchaseOrders = db
    .select({ purchaseOrderId: purchaseOrderJobLinks.purchaseOrderId })
    .from(purchaseOrderJobLinks)
    .where(eq(purchaseOrderJobLinks.jobId, jobId));
  return or(
    eq(documents.jobId, jobId),
    and(inArray(documents.purchaseOrderId, linkedPurchaseOrders), isPurchaseOrderPdf),
  ) as SQL;
}

async function assertJobExists({ db, jobId }: { db: Db | DatabaseTransaction; jobId: UUID }): Promise<void> {
  const row = await db.query.jobs.findFirst({
    columns: {
      id: true,
    },
    where: eq(jobs.id, jobId),
  });

  if (!row) {
    throw new JobNotFoundError(jobId);
  }
}

async function listJobCfo({ db, jobId }: { db: Db | DatabaseTransaction; jobId: UUID }): Promise<JobDetail['cfo']> {
  const rows = await db
    .select({
      assemblyId: jobCfoAssemblies.id,
      assemblyName: jobCfoAssemblies.assemblyName,
      kind: jobCfoAssemblies.kind,
      partCode: parts.code,
      partId: jobCfoParts.partId,
      partName: parts.name,
      quantity: jobCfoParts.quantity,
      unitOfMeasure: parts.unitOfMeasure,
    })
    .from(jobCfoAssemblies)
    .leftJoin(jobCfoParts, eq(jobCfoParts.cfoAssemblyId, jobCfoAssemblies.id))
    .leftJoin(parts, eq(parts.id, jobCfoParts.partId))
    .where(eq(jobCfoAssemblies.jobId, jobId))
    .orderBy(
      sql`case ${jobCfoAssemblies.kind} when 'standard' then 0 else 1 end`,
      asc(jobCfoAssemblies.sequence),
      asc(parts.code),
      asc(jobCfoParts.partId),
    );

  const assemblies: JobDetail['cfo'] = [];
  const assemblyIndexesById = new Map<UUID, number>();

  for (const row of rows) {
    let assemblyIndex = assemblyIndexesById.get(row.assemblyId);

    if (assemblyIndex === undefined) {
      assemblyIndex = assemblies.length;
      assemblyIndexesById.set(row.assemblyId, assemblyIndex);
      assemblies.push({
        assemblyName: row.assemblyName,
        kind: row.kind,
        parts: [],
      });
    }

    if (row.partId && row.partCode && row.partName && row.quantity !== null && row.unitOfMeasure) {
      assemblies[assemblyIndex]?.parts.push({
        partCode: row.partCode,
        partId: row.partId,
        partName: row.partName,
        quantity: row.quantity,
        unitOfMeasure: row.unitOfMeasure,
      });
    }
  }

  return assemblies;
}

export function getJobSortColumn(sortBy: JobSortBy): SQL {
  const columns = {
    code: sql`${jobs.code}`,
    completedOn: sql`${jobs.completedOn}`,
    createdAt: sql`${jobs.createdAt}`,
    id: sql`${jobs.id}`,
    productSerialNumber: jobProductSerialExpression,
    // Total Work Slots per Job; ascending puts the unscheduled (count 0) Jobs first.
    scheduledSlots: sql`(${jobWorkSlotCountSubquery()})`,
  } as const satisfies Record<JobSortBy, SQL>;

  return columns[sortBy];
}

/**
 * Sorting by completion date is a question about completed Jobs, so open Jobs sink to the bottom in
 * both directions. Postgres would otherwise lead the descending sort — the useful one — with every
 * row that has no date at all.
 */
const jobSortByNullsLast = new Set<JobSortBy>(['completedOn']);

export function getJobSortOrder(sortBy: JobSortBy, sortDirection: SortDirection): SQL {
  const column = getJobSortColumn(sortBy);
  const ordered = sortDirection === 'desc' ? desc(column) : asc(column);

  return jobSortByNullsLast.has(sortBy) ? sql`${ordered} nulls last` : ordered;
}

export function mapJobSummary(row: JobWithProductRow, scheduleState: JobScheduleState | null = null): JobSummary {
  const mappedJob = mapJob(row, row.productUnit);
  const customer = resolveJobCustomerForRow(row);
  const product = row.productUnit?.product ?? null;

  return {
    ...mappedJob,
    customerCompanyName: customer?.companyName ?? null,
    customerId: customer ? UUID.parse(customer.id) : null,
    customerThumbnailDataUrl: customer?.thumbnailDataUrl ?? null,
    productBuildTimeDays: product?.buildTimeDays ?? null,
    productModelCode: product?.modelCode ?? null,
    productName: product?.name ?? null,
    productThumbnailDataUrl: product?.thumbnailDataUrl ?? null,
    quoteCode: row.quote ? QuoteCode.parse(row.quote.code) : null,
    quoteKind: row.quote?.kind ?? null,
    scheduleState,
    workTitle: row.quote?.workTitle ?? null,
  };
}
