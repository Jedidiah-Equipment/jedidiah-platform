import {
  type customers,
  type DatabaseTransaction,
  type Db,
  jobEvents,
  jobStages,
  jobs,
  type products,
  type quotes,
} from '@pkg/db';
import { canViewStage, getStageTransitionAvailability } from '@pkg/domain';
import {
  type JobDetail,
  type JobSortBy,
  type JobStageRollup,
  JobStageSummary,
  type JobSummary,
  QuoteCode,
  type UserAccessSummary,
  type UUID,
} from '@pkg/schema';
import { asc, desc, eq, type SQL, sql } from 'drizzle-orm';

import { JobNotFoundError } from './job-errors.js';
import {
  type JobEventWithActorRow,
  type JobRow,
  type JobStageRow,
  type JobStageStationWithStationRow,
  mapJob,
  mapJobEventWithActor,
  mapJobStage,
  mapStationBooking,
} from './job-mappers.js';

type ProductRow = Pick<typeof products.$inferSelect, 'modelCode' | 'name'>;
type CustomerRow = Pick<typeof customers.$inferSelect, 'companyName'>;
type QuoteRow = Pick<typeof quotes.$inferSelect, 'code'> & {
  customer: CustomerRow;
};
type JobWithProductRow = JobRow & {
  product: ProductRow;
  quote: QuoteRow | null;
  stages: (JobStageRow & { stations: JobStageStationWithStationRow[] })[];
};

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
      actualEnd: true,
      actualEndSetManually: true,
      actualStart: true,
      actualStartSetManually: true,
      id: true,
      dueEnd: true,
      dueEndSetManually: true,
      dueStart: true,
      dueStartSetManually: true,
      isCancelled: true,
      isPaused: true,
      productId: true,
      quoteId: true,
      updatedAt: true,
    },
    where: eq(jobs.id, id),
    with: {
      events: {
        orderBy: [desc(jobEvents.occurredAt), desc(jobEvents.id)],
        with: {
          actor: {
            columns: {
              name: true,
            },
          },
        },
      },
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
        with: {
          stations: {
            with: {
              station: true,
            },
          },
        },
      },
    },
  });

  if (!row) {
    throw new JobNotFoundError(id);
  }

  return {
    ...mapJobSummary(row),
    stages: mapJobDetailStages({ access, job: row, stageRows: row.stages }),
    workflowEvents: mapJobWorkflowEvents({ access, eventRows: row.events, stageRows: row.stages }),
  };
}

export function getJobSortColumn(sortBy: JobSortBy): SQL {
  const columns = {
    code: sql`${jobs.code}`,
    createdAt: sql`${jobs.createdAt}`,
    id: sql`${jobs.id}`,
    lifecycleStatus: sql`case when ${jobs.isCancelled} then 5 when ${jobs.isPaused} then 4 when ${jobs.actualEnd} is not null then 3 when ${jobs.actualStart} is not null then 2 else 1 end`,
  } as const satisfies Record<JobSortBy, SQL>;

  return columns[sortBy];
}

export function mapJobSummary(row: JobWithProductRow): JobSummary {
  return {
    ...mapJob(row),
    customerCompanyName: row.quote?.customer.companyName ?? null,
    productModelCode: row.product.modelCode,
    productName: row.product.name,
    quoteCode: row.quote ? QuoteCode.parse(row.quote.code) : null,
    stages: row.stages.map(mapJobStageSummary),
  };
}

function mapJobStageSummary(row: JobStageRow & { stations?: JobStageStationWithStationRow[] }): JobStageSummary {
  return JobStageSummary.parse({
    ...mapJobStage(row),
    department: row.stage,
    stations: row.stations?.map(mapStationBooking) ?? [],
  });
}

function mapStageAccess({
  access,
  job,
  previousStage,
  stage,
}: {
  access: UserAccessSummary;
  job: JobRow;
  previousStage: JobStageRow | null;
  stage: JobStageRow;
}): JobStageRollup {
  if (canViewStage(access, stage)) {
    return {
      ...mapJobStageSummary(stage),
      access: 'visible',
      transitionAvailability: getStageTransitionAvailability({
        access,
        job,
        previousStage,
        stage,
      }),
    };
  }

  return {
    ...mapJobStageSummary(stage),
    access: 'summary',
  };
}

function mapJobDetailStages({
  access,
  job,
  stageRows,
}: {
  access: UserAccessSummary;
  job: JobRow;
  stageRows: JobStageRow[];
}): JobStageRollup[] {
  return stageRows.map((stageRow, index) =>
    mapStageAccess({
      access,
      job,
      previousStage: index === 0 ? null : (stageRows[index - 1] ?? null),
      stage: stageRow,
    }),
  );
}

function mapJobWorkflowEvents({
  access,
  eventRows,
  stageRows,
}: {
  access: UserAccessSummary;
  eventRows: JobEventWithActorRow[];
  stageRows: JobStageRow[];
}) {
  const stageRowsById = new Map(stageRows.map((stage) => [stage.id, stage]));

  return eventRows
    .filter((event) => {
      if (!event.stageId) return true;

      const stage = stageRowsById.get(event.stageId);
      return stage ? canViewStage(access, stage) : false;
    })
    .map(mapJobEventWithActor)
    .sort(compareJobEventsNewestFirst);
}

function compareJobEventsNewestFirst(
  left: ReturnType<typeof mapJobEventWithActor>,
  right: ReturnType<typeof mapJobEventWithActor>,
): number {
  const occurredAtOrder = right.occurredAt.localeCompare(left.occurredAt);
  return occurredAtOrder === 0 ? right.id.localeCompare(left.id) : occurredAtOrder;
}
