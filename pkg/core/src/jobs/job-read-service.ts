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
import {
  canViewStage,
  rollupJobSchedule,
  rollupStageSchedule,
  type ScheduleRollupBooking,
  type ScheduleRollupWindow,
} from '@pkg/domain';
import {
  type JobDetail,
  type JobSortBy,
  type JobStageRollup,
  JobStageSummary,
  type JobSummary,
  QuoteCode,
  type ScheduleWindow,
  type SortDirection,
  type UserAccessSummary,
  type UUID,
} from '@pkg/schema';
import { asc, desc, eq, type SQL, type SQLWrapper, sql } from 'drizzle-orm';

import { JobNotFoundError } from './job-errors.js';
import {
  deriveWorkState,
  type JobEventWithActorRow,
  type JobRow,
  type JobStageRow,
  type JobStageStationRow,
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
      dueDate: true,
      id: true,
      productId: true,
      quoteId: true,
      status: true,
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
    stages: mapJobDetailStages({ access, stageRows: row.stages }),
    workflowEvents: mapJobWorkflowEvents({ eventRows: row.events }),
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
  if (sortBy === 'dueDate') {
    return sortDirection === 'desc' ? sql`${jobs.dueDate} desc nulls last` : sql`${jobs.dueDate} asc nulls last`;
  }

  return sortDirection === 'desc'
    ? desc(getJobSortColumn(sortBy) as SQLWrapper)
    : asc(getJobSortColumn(sortBy) as SQLWrapper);
}

export function mapJobSummary(row: JobWithProductRow): JobSummary {
  const mappedJob = mapJob(row);
  const stageSchedules = row.stages.map(mapStageSchedule);
  const jobSchedule = rollupJobSchedule(stageSchedules.map(({ bookings }) => ({ bookings })));

  return {
    ...mappedJob,
    actualWindow: mapScheduleWindow(jobSchedule.actualWindow),
    customerCompanyName: row.quote?.customer.companyName ?? null,
    plannedWindow: mapScheduleWindow(jobSchedule.plannedWindow),
    productModelCode: row.product.modelCode,
    productName: row.product.name,
    quoteCode: row.quote ? QuoteCode.parse(row.quote.code) : null,
    stages: row.stages.map((stage, index) =>
      mapJobStageSummary(stage, stageSchedules[index] ?? mapStageSchedule(stage)),
    ),
  };
}

function mapJobStageSummary(
  row: JobStageRow & { stations?: JobStageStationWithStationRow[] },
  stageSchedule = mapStageSchedule(row),
): JobStageSummary {
  const mappedStage = mapJobStage(row);
  const hasRollupBookings = hasScheduleRollupBookings(row);

  return JobStageSummary.parse({
    ...mappedStage,
    actualWindow: mapScheduleWindow(stageSchedule.actualWindow),
    department: row.stage,
    plannedWindow: mapScheduleWindow(stageSchedule.plannedWindow),
    state: hasRollupBookings
      ? deriveWorkState({
          actualEnd: stageSchedule.actualWindow.end,
          actualStart: stageSchedule.actualWindow.start,
        })
      : mappedStage.state,
    stations: row.stations?.map(mapStationBooking) ?? [],
  });
}

function mapStageAccess({
  access,
  stage,
  stageSchedule,
}: {
  access: UserAccessSummary;
  stage: JobStageRow & { stations?: JobStageStationWithStationRow[] };
  stageSchedule: StageScheduleProjection;
}): JobStageRollup {
  if (canViewStage(access, stage)) {
    return {
      ...mapJobStageSummary(stage, stageSchedule),
      access: 'visible',
    };
  }

  return {
    ...mapJobStageSummary(stage, stageSchedule),
    access: 'summary',
  };
}

function mapJobDetailStages({
  access,
  stageRows,
}: {
  access: UserAccessSummary;
  stageRows: (JobStageRow & { stations?: JobStageStationWithStationRow[] })[];
}): JobStageRollup[] {
  const stageSchedules = stageRows.map(mapStageSchedule);

  return stageRows.map((stageRow, index) =>
    mapStageAccess({
      access,
      stage: stageRow,
      stageSchedule: stageSchedules[index] ?? mapStageSchedule(stageRow),
    }),
  );
}

type StageScheduleProjection = ReturnType<typeof rollupStageSchedule> & {
  bookings: ScheduleRollupBooking[];
};

function mapStageSchedule(row: {
  stations?: readonly Pick<JobStageStationRow, 'actualEnd' | 'actualStart' | 'plannedEnd' | 'plannedStart'>[];
}): StageScheduleProjection {
  const bookings = mapScheduleRollupBookings(row);

  return {
    ...rollupStageSchedule(bookings),
    bookings,
  };
}

function mapScheduleRollupBookings(row: {
  stations?: readonly Pick<JobStageStationRow, 'actualEnd' | 'actualStart' | 'plannedEnd' | 'plannedStart'>[];
}): ScheduleRollupBooking[] {
  return (
    row.stations?.map((station) => ({
      actualEnd: station.actualEnd,
      actualStart: station.actualStart,
      plannedEnd: parseDateOnlyAsUtc(station.plannedEnd),
      plannedStart: parseDateOnlyAsUtc(station.plannedStart),
    })) ?? []
  );
}

function hasScheduleRollupBookings(row: { stations?: readonly unknown[] }): boolean {
  return (row.stations?.length ?? 0) > 0;
}

function mapScheduleWindow(window: ScheduleRollupWindow): ScheduleWindow {
  return {
    end: window.end?.toISOString() ?? null,
    start: window.start?.toISOString() ?? null,
  };
}

function parseDateOnlyAsUtc(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function mapJobWorkflowEvents({ eventRows }: { eventRows: JobEventWithActorRow[] }) {
  return eventRows.map(mapJobEventWithActor).sort(compareJobEventsNewestFirst);
}

function compareJobEventsNewestFirst(
  left: ReturnType<typeof mapJobEventWithActor>,
  right: ReturnType<typeof mapJobEventWithActor>,
): number {
  const occurredAtOrder = right.occurredAt.localeCompare(left.occurredAt);
  return occurredAtOrder === 0 ? right.id.localeCompare(left.id) : occurredAtOrder;
}
