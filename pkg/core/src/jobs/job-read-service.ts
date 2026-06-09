import {
  createEscapedContainsSearchCondition,
  type customers,
  type DatabaseTransaction,
  type Db,
  documents,
  getPaginationQueryOptions,
  jobBayCalendarExceptions,
  jobBays,
  jobCfoAssemblies,
  jobCfoParts,
  jobSlots,
  jobs,
  parts,
  products,
  type quotes,
  user,
  workingCalendarOffDays,
} from '@pkg/db';
import { JOB_DEPARTMENT_PIPELINE, parseJobCodeSearch, projectJobSlots, type WorkingCalendar } from '@pkg/domain';
import {
  Bay,
  BayCalendarException,
  type BayListResult,
  BaySchedule,
  type JobDepartmentSchedule,
  type JobDetail,
  JobDocument,
  type JobListInput,
  type JobListResult,
  type JobSortBy,
  type JobSummary,
  OffDay,
  ProjectedJobSlot,
  QuoteCode,
  type SortDirection,
  type UserAccessSummary,
  type UUID,
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
import { JobNotFoundError } from './job-errors.js';
import { type JobRow, mapJob } from './job-mappers.js';

type ProductRow = Pick<typeof products.$inferSelect, 'modelCode' | 'name' | 'thumbnailDataUrl'>;
type CustomerRow = Pick<typeof customers.$inferSelect, 'companyName' | 'thumbnailDataUrl'>;
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
type BayCalendarExceptionRow = Pick<
  typeof jobBayCalendarExceptions.$inferSelect,
  'bayId' | 'date' | 'direction' | 'label'
>;
type BayScheduleRow = typeof jobBays.$inferSelect & {
  calendarExceptions: BayCalendarExceptionRow[];
  slots: (typeof jobSlots.$inferSelect & {
    job: Pick<typeof jobs.$inferSelect, 'code' | 'id'> | null;
  })[];
};

// Any `job:read` user sees the full cross-department schedule, so bay reads are not department-scoped.
function findBayScheduleRows(db: Db | DatabaseTransaction, where?: SQL) {
  return db.query.jobBays.findMany({
    where,
    orderBy: [asc(jobBays.department), asc(jobBays.name), asc(jobBays.id)],
    with: {
      calendarExceptions: {
        columns: {
          bayId: true,
          date: true,
          direction: true,
          label: true,
        },
        orderBy: [asc(jobBayCalendarExceptions.date)],
      },
      slots: {
        orderBy: [asc(jobSlots.sequence), asc(jobSlots.id)],
        with: {
          job: {
            columns: {
              code: true,
              id: true,
            },
          },
        },
      },
    },
  });
}

function toBaySchedules(rows: BayScheduleRow[], offDays: readonly OffDay[]): BaySchedule[] {
  const orgWorkingCalendar = createOrgWorkingCalendar(offDays);

  return rows.map((row) => mapBaySchedule(row, createBayWorkingCalendar(orgWorkingCalendar, row.calendarExceptions)));
}

export async function listBays({ db }: { db: Db | DatabaseTransaction }): Promise<BayListResult> {
  const offDays = await listWorkingCalendarOffDays(db);
  const rows = await findBayScheduleRows(db);

  return {
    items: toBaySchedules(rows, offDays),
    offDays,
  };
}

// A Job's schedule only needs the bays that actually hold one of its Work Slots. We resolve those
// bay ids first, then project only their full queues — rather than projecting the whole shop floor.
async function getJobSchedule({
  db,
  jobId,
}: {
  db: Db | DatabaseTransaction;
  jobId: UUID;
}): Promise<JobDepartmentSchedule[]> {
  const bayIdRows = await db.selectDistinct({ bayId: jobSlots.bayId }).from(jobSlots).where(eq(jobSlots.jobId, jobId));
  const bayIds = bayIdRows.map((row) => row.bayId);

  if (bayIds.length === 0) {
    return mapJobSchedule({ bays: [], jobId });
  }

  const offDays = await listWorkingCalendarOffDays(db);
  const rows = await findBayScheduleRows(db, inArray(jobBays.id, bayIds));

  return mapJobSchedule({ bays: toBaySchedules(rows, offDays), jobId });
}

export async function listWorkingCalendarOffDays(db: Db | DatabaseTransaction) {
  const rows = await db
    .select({
      date: workingCalendarOffDays.date,
      label: workingCalendarOffDays.label,
    })
    .from(workingCalendarOffDays)
    .orderBy(asc(workingCalendarOffDays.date));

  return rows.map((row) => OffDay.parse(row));
}

export function createOrgWorkingCalendar(offDays: readonly OffDay[]): WorkingCalendar {
  return {
    orgOffDays: new Set(offDays.map((offDay) => offDay.date)),
  };
}

export function createBayWorkingCalendar(
  orgWorkingCalendar: WorkingCalendar,
  exceptions: readonly { date: string; direction: 'work' | 'off' }[],
): WorkingCalendar {
  return {
    ...orgWorkingCalendar,
    bayExceptions: new Map(exceptions.map((exception) => [exception.date, exception.direction])),
  };
}

export async function listBayCalendarExceptions(db: Db | DatabaseTransaction, bayId: UUID) {
  const rows = await db
    .select({
      bayId: jobBayCalendarExceptions.bayId,
      date: jobBayCalendarExceptions.date,
      direction: jobBayCalendarExceptions.direction,
      label: jobBayCalendarExceptions.label,
    })
    .from(jobBayCalendarExceptions)
    .where(eq(jobBayCalendarExceptions.bayId, bayId))
    .orderBy(asc(jobBayCalendarExceptions.date));

  return rows.map((row) => BayCalendarException.parse(row));
}

export async function listJobs({
  db,
  input,
}: {
  db: Db;
  access: UserAccessSummary;
  input: JobListInput;
}): Promise<JobListResult> {
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
              thumbnailDataUrl: true,
            },
          },
        },
      },
    },
  });

  const total = await db.$count(jobs, where);

  return {
    items: rows.map(mapJobSummary),
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
    total,
  };
}

function mapBaySchedule(row: BayScheduleRow, workingCalendar: WorkingCalendar) {
  const projection = projectJobSlots({
    scheduleOrigin: row.scheduleOrigin,
    slots: row.slots,
    workingCalendar,
  });

  return BaySchedule.parse({
    ...Bay.parse(row),
    calendarExceptions: row.calendarExceptions,
    nextAvailableAt: projection.nextAvailableAt,
    slots: projection.slots.map((slot) => {
      if (slot.kind === 'idle') {
        return ProjectedJobSlot.parse({
          ...slot,
          startAt: slot.startAt,
          endAt: slot.endAt,
        });
      }

      if (!slot.job) {
        throw new Error('Work Job slot was missing its Job relation');
      }

      return ProjectedJobSlot.parse({
        ...slot,
        jobCode: slot.job.code,
        jobId: slot.job.id,
        startAt: slot.startAt,
        endAt: slot.endAt,
      });
    }),
  });
}

function buildJobListWhere(input: JobListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.filters.jobId) {
    conditions.push(eq(jobs.id, input.filters.jobId));
  }

  if (input.filters.createdAtStart) {
    conditions.push(gte(jobs.createdAt, new Date(input.filters.createdAtStart)));
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
  await assertJobExists({ db, jobId });
  const document = await getJobDocumentSummaryRow({ db, documentId, jobId });

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

async function getJobDocumentSummaryRow({
  db,
  documentId,
  jobId,
}: {
  db: Db;
  documentId: UUID;
  jobId: UUID;
}): Promise<DocumentSummaryRow> {
  const [row] = await selectJobDocuments(db)
    .where(and(eq(documents.jobId, jobId), eq(documents.id, documentId)))
    .limit(1);

  if (!row) {
    throw new DocumentNotFoundError(documentId);
  }

  return row;
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
  } as const satisfies Record<JobSortBy, SQL>;

  return columns[sortBy];
}

export function getJobSortOrder(sortBy: JobSortBy, sortDirection: SortDirection): SQL {
  return sortDirection === 'desc' ? desc(getJobSortColumn(sortBy)) : asc(getJobSortColumn(sortBy));
}

export function mapJobSummary(row: JobWithProductRow): JobSummary {
  const mappedJob = mapJob(row);

  return {
    ...mappedJob,
    customerCompanyName: row.quote.customer.companyName,
    customerThumbnailDataUrl: row.quote.customer.thumbnailDataUrl,
    productModelCode: row.product.modelCode,
    productName: row.product.name,
    productThumbnailDataUrl: row.product.thumbnailDataUrl,
    quoteCode: QuoteCode.parse(row.quote.code),
  };
}

function mapJobSchedule({ bays, jobId }: { bays: BaySchedule[]; jobId: UUID }): JobDepartmentSchedule[] {
  return JOB_DEPARTMENT_PIPELINE.map(({ department }) => ({
    department,
    bays: bays
      .filter((bay) => bay.department === department)
      .map((bay) =>
        BaySchedule.parse({
          ...bay,
          slots: bay.slots.filter((slot) => slot.kind === 'work' && slot.jobId === jobId),
        }),
      )
      .filter((bay) => bay.slots.length > 0),
  }));
}
