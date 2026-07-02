import {
  createEscapedContainsSearchCondition,
  type customers,
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
  type quotes,
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
  windowActiveBoard,
} from '@pkg/domain';
import {
  type BoardListInput,
  type BoardListResult,
  type DateOnlyIso,
  type JobDepartmentSchedule,
  type JobDetail,
  JobDocument,
  type JobListInput,
  type JobListResult,
  type JobScheduleState,
  type JobSortBy,
  type JobSummary,
  type ProjectedBayQueue,
  QuoteCode,
  type SortDirection,
  UUID,
} from '@pkg/schema';
import { and, asc, desc, eq, gte, inArray, or, type SQL, sql } from 'drizzle-orm';
import { DocumentNotFoundError } from '../documents/document-errors.js';
import {
  type DocumentSummaryRow,
  documentBaseSelect,
  mapDocumentSummary,
  type ReadDocumentResult,
} from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { findBoardBayRows, findBoardBayRowsForJobs, toProjectedBoard } from './board-read.js';
import { JobNotFoundError } from './job-errors.js';
import { type JobRow, mapJob } from './job-mappers.js';
import { listWorkingCalendarOffDays } from './working-calendar-service.js';

type ProductRow = Pick<typeof products.$inferSelect, 'modelCode' | 'name' | 'thumbnailDataUrl'>;
type CustomerRow = Pick<typeof customers.$inferSelect, 'companyName' | 'id' | 'thumbnailDataUrl'>;
type QuoteRow = Pick<typeof quotes.$inferSelect, 'code'> & {
  customer: CustomerRow;
};

type JobWithProductRow = JobRow & {
  product: ProductRow;
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
        createdAt: true,
        id: true,
        code: true,
        productId: true,
        productSerialNumber: true,
        productSerialPrefix: true,
        productSerialSequence: true,
        productSerialYear: true,
        quoteId: true,
        updatedAt: true,
        vinNumber: true,
      },
      where: inArray(jobs.id, batch),
      with: {
        product: {
          columns: {
            modelCode: true,
            name: true,
            thumbnailDataUrl: true,
          },
        },
        quote: {
          columns: {
            code: true,
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
  const { queues, workingCalendarsByBayId } = toProjectedBoard(rows, { offDays, today });

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
  const [offDays, rows] = await Promise.all([listWorkingCalendarOffDays(db), findBoardBayRowsForJobs({ db, jobIds })]);

  return toProjectedBoard(rows, { offDays, today }).queues;
}

async function getJobSchedule({
  db,
  jobId,
}: {
  db: Db | DatabaseTransaction;
  jobId: UUID;
}): Promise<JobDepartmentSchedule[]> {
  return sliceJobSchedule(await findProjectedBaysForJobs({ db, jobIds: [jobId], today: getPlantDateNow() }), jobId);
}

export async function listJobs({ db, input }: { db: Db; input: JobListInput }): Promise<JobListResult> {
  const where = buildJobListWhere(input);
  const orderBy = getJobSortOrder(input.sortBy, input.sortDirection);

  const rows = await db.query.jobs.findMany({
    columns: {
      createdAt: true,
      id: true,
      code: true,
      productId: true,
      productSerialNumber: true,
      productSerialPrefix: true,
      productSerialSequence: true,
      productSerialYear: true,
      quoteId: true,
      updatedAt: true,
      vinNumber: true,
    },
    where,
    orderBy: [orderBy, asc(jobs.id)],
    ...getPaginationQueryOptions(input),
    with: {
      product: {
        columns: {
          modelCode: true,
          name: true,
          thumbnailDataUrl: true,
        },
      },
      quote: {
        columns: {
          code: true,
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

  // Schedule-state is a Slot projection, so it is computed only when a caller opts in and only for
  // the returned page — the Gantt and BookSlotDialog share this read and must stay projection-free.
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
 * carry a null jobId, so `kind = 'work'` is the Work-Slot filter. `projection` is the inner select list
 * (`count(*)` for sorting, `1` for an existence check). This is the single definition of "a Job's
 * Work Slots" shared by the `scheduledSlots` sort and the `unscheduledOnly` filter.
 */
function jobWorkSlotsSubquery(alias: 'sort_slot' | 'filter_slot', projection: SQL): SQL {
  const slot = sql.raw(`"${alias}"`);
  return sql`select ${projection} from ${jobSlots} ${slot} where ${slot}."job_id" = ${jobs.id} and ${slot}."kind" = 'work'`;
}

function buildJobListWhere(input: JobListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.filters.jobId) {
    conditions.push(eq(jobs.id, input.filters.jobId));
  }

  if (input.filters.createdAtStart) {
    conditions.push(gte(jobs.createdAt, new Date(input.filters.createdAtStart)));
  }

  if (input.filters.unscheduledOnly) {
    // Existence check, not `count(*) = 0`: `not exists` stops at the first Work Slot instead of
    // scanning them all — cheaper on the unindexed `job_slot.job_id` as Jobs accumulate bay slots.
    conditions.push(sql`not exists (${jobWorkSlotsSubquery('filter_slot', sql`1`)})`);
  }

  if (input.search) {
    const codeSearch = parseJobCodeSearch(input.search);
    const searchWhere = or(
      createEscapedContainsSearchCondition(sql`${jobs.id}::text`, input.search),
      createEscapedContainsSearchCondition(sql`${jobs.code}::text`, input.search),
      createEscapedContainsSearchCondition(sql`${jobs.productSerialNumber}`, input.search),
      codeSearch === undefined ? undefined : eq(jobs.code, codeSearch),
    );

    if (searchWhere) {
      conditions.push(searchWhere);
    }
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getJob({ db, id }: { db: Db | DatabaseTransaction; id: UUID }): Promise<JobDetail> {
  const row = await db.query.jobs.findFirst({
    columns: {
      createdAt: true,
      code: true,
      id: true,
      productId: true,
      productSerialNumber: true,
      productSerialPrefix: true,
      productSerialSequence: true,
      productSerialYear: true,
      quoteId: true,
      updatedAt: true,
      vinNumber: true,
    },
    where: eq(jobs.id, id),
    with: {
      product: {
        columns: {
          modelCode: true,
          name: true,
          thumbnailDataUrl: true,
        },
      },
      quote: {
        columns: {
          code: true,
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

  if (!row) {
    throw new JobNotFoundError(id);
  }

  const [cfo, documents, schedule] = await Promise.all([
    listJobCfo({ db, jobId: row.id }),
    listJobDocumentRows({ db, jobId: row.id }),
    getJobSchedule({ db, jobId: row.id }),
  ]);

  return {
    ...mapJobSummary(row),
    cfo,
    documents,
    schedule,
  };
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
    // Total Work Slots per Job; ascending puts the unscheduled (count 0) Jobs first.
    scheduledSlots: sql`(${jobWorkSlotsSubquery('sort_slot', sql`count(*)`)})`,
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
    productModelCode: row.product.modelCode,
    productName: row.product.name,
    productThumbnailDataUrl: row.product.thumbnailDataUrl,
    quoteCode: QuoteCode.parse(row.quote.code),
    scheduleState,
  };
}
