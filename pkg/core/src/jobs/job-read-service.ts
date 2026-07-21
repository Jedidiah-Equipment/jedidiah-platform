import {
  createEscapedContainsSearchCondition,
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
  quotes,
  quoteWorkItems,
  user,
} from '@pkg/db';
import {
  countWorkingDaysBetween,
  foldJobScheduleStates,
  getBoardJobIds,
  getPlantDateNow,
  parseJobCodeSearch,
  resolveBoardWindowFrom,
  sliceJobSchedule,
  summarizeSlotCalendarDays,
  windowActiveBoard,
} from '@pkg/domain';
import {
  type BoardListInput,
  type BoardListResult,
  type DateOnlyIso,
  type JobCustomerOptionListInput,
  type JobCustomerOptionListResult,
  type JobDetail,
  type JobDetailDepartmentSchedule,
  JobDocument,
  type JobListInput,
  type JobListResult,
  type JobScheduleState,
  type JobSortBy,
  type JobSummary,
  type ProjectedBayQueue,
  type ProjectedWorkJobSlot,
  QuoteCode,
  type SortDirection,
  UUID,
} from '@pkg/schema';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';
import { DocumentNotFoundError } from '../documents/document-errors.js';
import {
  type DocumentSummaryRow,
  documentBaseSelect,
  mapDocumentSummary,
  type ReadDocumentResult,
} from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import {
  findBoardBayRows,
  findBoardBayRowsForJobs,
  type ProjectedBoardQueues,
  toProjectedBoard,
  withoutCancelledJobSlots,
} from './board-read.js';
import { JobNotFoundError } from './job-errors.js';
import { type JobRow, mapJob } from './job-mappers.js';
import { listWorkingCalendarOffDays } from './working-calendar-service.js';

type ProductRow = Pick<typeof products.$inferSelect, 'buildTimeDays' | 'modelCode' | 'name' | 'thumbnailDataUrl'>;
type CustomerRow = Pick<typeof customers.$inferSelect, 'companyName' | 'id' | 'thumbnailDataUrl'>;
type CustomQuoteWorkRow = Pick<typeof quoteWorkItems.$inferSelect, 'id' | 'name'>;
type QuoteRow = Pick<typeof quotes.$inferSelect, 'code' | 'kind' | 'workTitle'> & {
  customer: CustomerRow;
};
type JobDetailQuoteRow = QuoteRow & {
  workItems: CustomQuoteWorkRow[];
};

type JobWithProductRow = JobRow & {
  product: ProductRow | null;
  quote: QuoteRow;
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
  const jobCustomerIds = db
    .selectDistinct({ customerId: quotes.customerId })
    .from(quotes)
    .innerJoin(jobs, eq(jobs.quoteId, quotes.id))
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

  return {
    items: rows,
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
    total: await db.$count(customers, where),
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
        id: true,
        code: true,
        invoiceNumber: true,
        productId: true,
        productSerialNumber: true,
        productSerialPrefix: true,
        productSerialSequence: true,
        productSerialYear: true,
        quoteId: true,
        updatedAt: true,
        vinNumber: true,
        description: true,
      },
      where: inArray(jobs.id, batch),
      with: {
        product: {
          columns: {
            buildTimeDays: true,
            modelCode: true,
            name: true,
            thumbnailDataUrl: true,
          },
        },
        quote: {
          columns: {
            code: true,
            kind: true,
            workTitle: true,
          },
          with: {
            customer: {
              columns: {
                companyName: true,
                id: true,
                thumbnailDataUrl: true,
              },
            },
          },
        },
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
      id: true,
      code: true,
      invoiceNumber: true,
      productId: true,
      productSerialNumber: true,
      productSerialPrefix: true,
      productSerialSequence: true,
      productSerialYear: true,
      quoteId: true,
      updatedAt: true,
      vinNumber: true,
      description: true,
    },
    where,
    orderBy: [orderBy, asc(jobs.id)],
    ...getPaginationQueryOptions(input),
    with: {
      product: {
        columns: {
          buildTimeDays: true,
          modelCode: true,
          name: true,
          thumbnailDataUrl: true,
        },
      },
      quote: {
        columns: {
          code: true,
          kind: true,
          workTitle: true,
        },
        with: {
          customer: {
            columns: {
              companyName: true,
              id: true,
              thumbnailDataUrl: true,
            },
          },
        },
      },
    },
  });

  const total = await db.$count(jobs, where);

  // Schedule state is a Slot projection, so resolve it only for the returned page. Most callers omit
  // the include; the booking dialog opts in because its Job picker filters on projected state.
  const scheduleStates = input.include?.scheduleState
    ? await computeJobScheduleStates({ db, jobIds: rows.map((row) => UUID.parse(row.id)) })
    : null;

  return {
    items: rows.map((row) => mapJobSummary(row, scheduleStates?.get(UUID.parse(row.id)) ?? null)),
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
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

function jobCustomerFilterCondition(alias: 'filter_customer_quote', customerId: UUID): SQL {
  const quote = sql.raw(`"${alias}"`);

  return sql`exists (
    select 1
    from ${quotes} ${quote}
    where ${quote}."id" = ${jobs.quoteId}
      and ${quote}."customer_id" = ${customerId}
  )`;
}

function buildJobListWhere(input: JobListInput): SQL | undefined {
  const conditions: SQL[] = [isNull(jobs.cancelledAt)];

  if (input.filters.jobId) {
    conditions.push(eq(jobs.id, input.filters.jobId));
  }

  if (input.filters.createdAtStart) {
    conditions.push(gte(jobs.createdAt, new Date(input.filters.createdAtStart)));
  }

  if (input.filters.invoicedOnly) {
    conditions.push(isNotNull(jobs.invoiceNumber));
  }

  if (input.columnFilters.customerId) {
    conditions.push(jobCustomerFilterCondition('filter_customer_quote', input.columnFilters.customerId));
  }

  if (input.columnFilters.productSerialNumber) {
    conditions.push(
      createEscapedContainsSearchCondition(sql`${jobs.productSerialNumber}`, input.columnFilters.productSerialNumber),
    );
  }

  if (input.columnFilters.invoiceNumber) {
    conditions.push(
      createEscapedContainsSearchCondition(sql`${jobs.invoiceNumber}`, input.columnFilters.invoiceNumber),
    );
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
      createEscapedContainsSearchCondition(sql`${jobs.productSerialNumber}`, input.search),
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
      code: true,
      id: true,
      invoiceNumber: true,
      productId: true,
      productSerialNumber: true,
      productSerialPrefix: true,
      productSerialSequence: true,
      productSerialYear: true,
      quoteId: true,
      updatedAt: true,
      vinNumber: true,
      description: true,
    },
    where: eq(jobs.id, id),
    with: {
      product: {
        columns: {
          buildTimeDays: true,
          modelCode: true,
          name: true,
          thumbnailDataUrl: true,
        },
      },
      quote: {
        columns: {
          code: true,
          kind: true,
          workTitle: true,
        },
        with: {
          customer: {
            columns: {
              companyName: true,
              id: true,
              thumbnailDataUrl: true,
            },
          },
          workItems: {
            columns: {
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

function listJobWorkRows(quote: Pick<JobDetailQuoteRow, 'kind' | 'workItems'>): JobDetail['workRows'] {
  return quote.kind === 'custom' ? quote.workItems : [];
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
  const rows = await selectJobDocuments(db).where(eq(documents.jobId, jobId)).orderBy(asc(documents.filename));

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
    .where(and(eq(documents.jobId, jobId), eq(documents.id, documentId)))
    .limit(1);

  return row ?? null;
}

function mapJobDocument(row: JobDocumentRow): JobDetail['documents'][number] {
  return JobDocument.parse({
    byteSize: row.byteSize,
    contentType: row.contentType,
    createdAt: row.createdAt.toISOString(),
    filename: row.filename,
    id: row.id,
    jobId: row.jobId,
    metadata: row.metadata,
    ownerType: row.ownerType,
    productId: row.productId,
    quoteId: row.quoteId,
    sourceProductId: row.sourceProductId,
    sourceProductName: row.sourceProductName,
    uploaderEmail: row.uploaderEmail,
    uploaderName: row.uploaderName,
    uploaderUserId: row.uploaderUserId,
  });
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
    createdAt: sql`${jobs.createdAt}`,
    id: sql`${jobs.id}`,
    productSerialNumber: sql`${jobs.productSerialNumber}`,
    // Total Work Slots per Job; ascending puts the unscheduled (count 0) Jobs first.
    scheduledSlots: sql`(${jobWorkSlotCountSubquery()})`,
  } as const satisfies Record<JobSortBy, SQL>;

  return columns[sortBy];
}

export function getJobSortOrder(sortBy: JobSortBy, sortDirection: SortDirection): SQL {
  return sortDirection === 'desc' ? desc(getJobSortColumn(sortBy)) : asc(getJobSortColumn(sortBy));
}

export function mapJobSummary(row: JobWithProductRow, scheduleState: JobScheduleState | null = null): JobSummary {
  const mappedJob = mapJob(row);

  return {
    ...mappedJob,
    customerCompanyName: row.quote.customer.companyName,
    customerId: UUID.parse(row.quote.customer.id),
    customerThumbnailDataUrl: row.quote.customer.thumbnailDataUrl,
    productBuildTimeDays: row.product?.buildTimeDays ?? null,
    productModelCode: row.product?.modelCode ?? null,
    productName: row.product?.name ?? null,
    productThumbnailDataUrl: row.product?.thumbnailDataUrl ?? null,
    quoteCode: QuoteCode.parse(row.quote.code),
    quoteKind: row.quote.kind,
    scheduleState,
    workTitle: row.quote.workTitle,
  };
}
