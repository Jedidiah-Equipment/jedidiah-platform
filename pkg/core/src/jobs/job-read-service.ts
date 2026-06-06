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
  jobStages,
  jobs,
  parts,
  products,
  type quotes,
  user,
  workingCalendarOffDays,
} from '@pkg/db';
import { canViewStage, parseJobCodeSearch, projectJobSlots, type WorkingCalendar } from '@pkg/domain';
import {
  Bay,
  BayCalendarException,
  type BayListResult,
  BaySchedule,
  type Department,
  type JobDetail,
  JobDocument,
  type JobListInput,
  type JobListResult,
  type JobSortBy,
  type JobStageRollup,
  JobStageSummary,
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
import { type JobRow, type JobStageRow, mapJob, mapJobStage } from './job-mappers.js';

type ProductRow = Pick<typeof products.$inferSelect, 'modelCode' | 'name'>;
type CustomerRow = Pick<typeof customers.$inferSelect, 'companyName'>;
type QuoteRow = Pick<typeof quotes.$inferSelect, 'code'> & {
  customer: CustomerRow;
};
type JobWithProductRow = JobRow & {
  product: ProductRow;
  quote: QuoteRow;
  stages: JobStageRow[];
};
type JobDocumentRow = DocumentSummaryRow & {
  sourceProductName: string | null;
};
type BayScheduleRow = typeof jobBays.$inferSelect & {
  calendarExceptions: (typeof jobBayCalendarExceptions.$inferSelect)[];
  slots: (typeof jobSlots.$inferSelect & {
    stage:
      | (Pick<typeof jobStages.$inferSelect, 'id' | 'jobId' | 'stage'> & {
          job: Pick<typeof jobs.$inferSelect, 'code' | 'id'>;
        })
      | null;
  })[];
};

export async function listBays({
  db,
  access,
}: {
  db: Db | DatabaseTransaction;
  access: UserAccessSummary;
}): Promise<BayListResult> {
  const offDays = await listWorkingCalendarOffDays(db);
  const visibleDepartments = getVisibleBayDepartments(access);

  if (visibleDepartments !== 'all' && visibleDepartments.length === 0) {
    return { items: [], offDays };
  }

  const rows = await db.query.jobBays.findMany({
    orderBy: [asc(jobBays.department), asc(jobBays.name), asc(jobBays.id)],
    where: visibleDepartments === 'all' ? undefined : inArray(jobBays.department, visibleDepartments),
    with: {
      calendarExceptions: {
        orderBy: [asc(jobBayCalendarExceptions.date)],
      },
      slots: {
        orderBy: [asc(jobSlots.sequence), asc(jobSlots.id)],
        with: {
          stage: {
            columns: {
              id: true,
              jobId: true,
              stage: true,
            },
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
      },
    },
  });

  const orgWorkingCalendar = createOrgWorkingCalendar(offDays);

  return {
    items: rows.map((row) => mapBaySchedule(row, createBayWorkingCalendar(orgWorkingCalendar, row.calendarExceptions))),
    offDays,
  };
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
            },
          },
        },
      },
      stages: {
        columns: {
          id: true,
          jobId: true,
          sequence: true,
          stage: true,
        },
        orderBy: [asc(jobStages.sequence)],
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

function getVisibleBayDepartments(access: UserAccessSummary): 'all' | Department[] {
  if (access.role === 'admin' || access.role === 'job-supervisor') {
    return 'all';
  }

  if (access.role === 'job-department-manager') {
    if (access.departments.length === 0) {
      return 'all';
    }

    return [...access.departments];
  }

  return [];
}

function mapBaySchedule(row: BayScheduleRow, workingCalendar: WorkingCalendar) {
  const projection = projectJobSlots({
    scheduleOrigin: row.scheduleOrigin,
    slots: row.slots,
    workingCalendar,
  });

  return BaySchedule.parse({
    ...Bay.parse(row),
    calendarExceptions: row.calendarExceptions.map((exception) =>
      BayCalendarException.parse({
        bayId: exception.bayId,
        date: exception.date,
        direction: exception.direction,
        label: exception.label,
      }),
    ),
    nextAvailableAt: projection.nextAvailableAt,
    slots: projection.slots.map((slot) => {
      if (slot.kind === 'idle') {
        return ProjectedJobSlot.parse({
          ...slot,
          startAt: slot.startAt,
          endAt: slot.endAt,
        });
      }

      if (!slot.stage) {
        throw new Error('Work Job slot was missing its Job stage relation');
      }

      return ProjectedJobSlot.parse({
        ...slot,
        jobCode: slot.stage.job.code,
        jobId: slot.stage.job.id,
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

export async function getJob({
  db,
  id,
  access,
}: {
  db: Db | DatabaseTransaction;
  id: UUID;
  access: UserAccessSummary;
}): Promise<JobDetail> {
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
            },
          },
        },
      },
      stages: {
        orderBy: [asc(jobStages.sequence)],
      },
    },
  });

  if (!row) {
    throw new JobNotFoundError(id);
  }

  return {
    ...mapJobSummary(row),
    cfo: await listJobCfo({ db, jobId: row.id }),
    documents: await getJobDocuments({ db, jobId: row.id }),
    stages: mapJobDetailStages({ access, stageRows: row.stages }),
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
    productModelCode: row.product.modelCode,
    productName: row.product.name,
    quoteCode: QuoteCode.parse(row.quote.code),
    stages: row.stages.map(mapJobStageSummary),
  };
}

function mapJobStageSummary(row: JobStageRow): JobStageSummary {
  const mappedStage = mapJobStage(row);

  return JobStageSummary.parse({
    ...mappedStage,
    department: row.stage,
  });
}

function mapStageAccess({ access, stage }: { access: UserAccessSummary; stage: JobStageRow }): JobStageRollup {
  if (canViewStage(access, stage)) {
    return {
      ...mapJobStageSummary(stage),
      access: 'visible',
    };
  }

  return {
    ...mapJobStageSummary(stage),
    access: 'summary',
  };
}

function mapJobDetailStages({
  access,
  stageRows,
}: {
  access: UserAccessSummary;
  stageRows: JobStageRow[];
}): JobStageRollup[] {
  return stageRows.map((stageRow) =>
    mapStageAccess({
      access,
      stage: stageRow,
    }),
  );
}
