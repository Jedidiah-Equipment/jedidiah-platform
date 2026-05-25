import {
  createEscapedContainsSearchCondition,
  type customers,
  type DatabaseTransaction,
  type Db,
  getPaginationQueryOptions,
  jobStages,
  jobs,
  type products,
  type quotes,
} from '@pkg/db';
import { canViewStage, parseJobCodeSearch } from '@pkg/domain';
import {
  type JobDetail,
  type JobListInput,
  type JobListResult,
  type JobSortBy,
  type JobStageRollup,
  JobStageSummary,
  type JobSummary,
  QuoteCode,
  type SortDirection,
  type UserAccessSummary,
  type UUID,
} from '@pkg/schema';
import { and, asc, desc, eq, gte, inArray, or, type SQL, sql } from 'drizzle-orm';

import { JobNotFoundError } from './job-errors.js';
import { type JobRow, type JobStageRow, mapJob, mapJobStage } from './job-mappers.js';

type ProductRow = Pick<typeof products.$inferSelect, 'modelCode' | 'name'>;
type CustomerRow = Pick<typeof customers.$inferSelect, 'companyName'>;
type QuoteRow = Pick<typeof quotes.$inferSelect, 'code'> & {
  customer: CustomerRow;
};
type JobWithProductRow = JobRow & {
  product: ProductRow;
  quote: QuoteRow | null;
  stages: JobStageRow[];
};

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
      dueDate: true,
      productId: true,
      quoteId: true,
      status: true,
      updatedAt: true,
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

function buildJobListWhere(input: JobListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.filters.jobId) {
    conditions.push(eq(jobs.id, input.filters.jobId));
  }

  const statuses = input.filters.statuses ?? [];

  if (statuses.length > 0) {
    conditions.push(inArray(jobs.status, statuses));
  }

  if (input.filters.createdAtStart) {
    conditions.push(gte(jobs.createdAt, new Date(input.filters.createdAtStart)));
  }

  if (input.search) {
    const codeSearch = parseJobCodeSearch(input.search);
    const searchWhere = or(
      createEscapedContainsSearchCondition(sql`${jobs.id}::text`, input.search),
      createEscapedContainsSearchCondition(sql`${jobs.code}::text`, input.search),
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
      dueDate: true,
      id: true,
      productId: true,
      quoteId: true,
      status: true,
      updatedAt: true,
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
    stages: mapJobDetailStages({ access, stageRows: row.stages }),
  };
}

export function getJobSortColumn(sortBy: JobSortBy): SQL {
  const columns = {
    code: sql`${jobs.code}`,
    createdAt: sql`${jobs.createdAt}`,
    dueDate: sql`${jobs.dueDate}`,
    id: sql`${jobs.id}`,
    status: sql`case ${jobs.status}
      when 'pending' then 1
      when 'active' then 2
      when 'paused' then 3
      when 'complete' then 4
      when 'cancelled' then 5
      else 6
    end`,
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
    customerCompanyName: row.quote?.customer.companyName ?? null,
    productModelCode: row.product.modelCode,
    productName: row.product.name,
    quoteCode: row.quote ? QuoteCode.parse(row.quote.code) : null,
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
