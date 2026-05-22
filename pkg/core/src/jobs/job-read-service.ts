import {
  customers,
  type DatabaseTransaction,
  type Db,
  jobEvents,
  jobStageStations,
  jobStages,
  jobs,
  products,
  quotes,
  stations,
} from '@pkg/db';
import {
  canViewStage,
  rollupJobSchedule,
  rollupStageSchedule,
  type ScheduleRollupBooking,
  type ScheduleRollupWindow,
} from '@pkg/domain';
import {
  JobCode,
  type JobDetail,
  JobSharedStationBookingsResult,
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
import { and, asc, desc, eq, inArray, ne, type SQL, type SQLWrapper, sql } from 'drizzle-orm';

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
  type StationRow,
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
type JobHeaderWithProductRow = JobRow & {
  product: ProductRow;
  quote: QuoteRow | null;
};
type SharedStationBookingRow = JobStageStationWithStationRow & {
  jobStage: JobStageRow & {
    job: JobHeaderWithProductRow;
  };
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

export async function listSharedStationBookings({
  db,
  jobId,
}: {
  db: Db | DatabaseTransaction;
  jobId: UUID;
}): Promise<JobSharedStationBookingsResult> {
  const currentJob = await db.query.jobs.findFirst({
    columns: {
      id: true,
    },
    where: eq(jobs.id, jobId),
  });

  if (!currentJob) {
    throw new JobNotFoundError(jobId);
  }

  const currentBookings = await db
    .select({
      actualEnd: jobStageStations.actualEnd,
      actualStart: jobStageStations.actualStart,
      plannedEnd: jobStageStations.plannedEnd,
      plannedStart: jobStageStations.plannedStart,
      stationId: jobStageStations.stationId,
    })
    .from(jobStageStations)
    .innerJoin(jobStages, eq(jobStages.id, jobStageStations.jobStageId))
    .where(eq(jobStages.jobId, jobId));
  const sharedStationIds = [...new Set(currentBookings.map((booking) => booking.stationId))];

  if (sharedStationIds.length === 0) {
    return { jobs: [] };
  }

  const scheduleWindow = getStationContentionScheduleWindow(currentBookings);

  if (!scheduleWindow) {
    return { jobs: [] };
  }

  const rows = await db
    .select({
      booking: jobStageStations,
      customer: customers,
      job: jobs,
      product: products,
      quote: quotes,
      stage: jobStages,
      station: stations,
    })
    .from(jobStageStations)
    .innerJoin(jobStages, eq(jobStages.id, jobStageStations.jobStageId))
    .innerJoin(jobs, eq(jobs.id, jobStages.jobId))
    .innerJoin(stations, eq(stations.id, jobStageStations.stationId))
    .innerJoin(products, eq(products.id, jobs.productId))
    .leftJoin(quotes, eq(quotes.id, jobs.quoteId))
    .leftJoin(customers, eq(customers.id, quotes.customerId))
    .where(
      and(
        inArray(jobStageStations.stationId, sharedStationIds),
        ne(jobStages.jobId, jobId),
        ne(jobs.status, 'cancelled'),
        sql`exists (
          select 1
          from ${jobStageStations} completion_booking
          inner join ${jobStages} completion_stage
            on completion_stage.id = completion_booking.job_stage_id
          where completion_stage.job_id = ${jobs.id}
            and completion_booking.actual_end is null
        )`,
        getStationBookingOverlapsWindowCondition(scheduleWindow),
      ),
    )
    .orderBy(asc(jobStageStations.stationId), asc(jobStageStations.plannedStart), asc(jobStageStations.id));

  return JobSharedStationBookingsResult.parse({
    jobs: mapSharedStationBookingJobs(rows.map(mapSharedStationBookingRow)),
  });
}

function getStationContentionScheduleWindow(
  bookings: readonly Pick<JobStageStationRow, 'actualEnd' | 'actualStart' | 'plannedEnd' | 'plannedStart'>[],
): { end: string; start: string } | null {
  const dateKeys = [
    ...bookings.flatMap((booking) => [
      booking.plannedStart,
      booking.plannedEnd,
      booking.actualStart?.toISOString().slice(0, 10) ?? null,
      booking.actualEnd?.toISOString().slice(0, 10) ?? null,
    ]),
  ].filter((value): value is string => value !== null);

  if (dateKeys.length === 0) {
    return null;
  }

  dateKeys.sort();
  const start = dateKeys[0];
  const end = dateKeys[dateKeys.length - 1];

  if (!start || !end) {
    return null;
  }

  return {
    end,
    start,
  };
}

function getStationBookingOverlapsWindowCondition(window: { end: string; start: string }): SQL {
  return sql`(
    (
      ${jobStageStations.actualStart} is not null
      and ${jobStageStations.actualStart}::date <= cast(${window.end} as date)
      and coalesce(${jobStageStations.actualEnd}::date, ${jobStageStations.actualStart}::date) >= cast(${window.start} as date)
    )
    or (
      ${jobStageStations.actualStart} is null
      and ${jobStageStations.plannedStart} is not null
      and ${jobStageStations.plannedStart} <= cast(${window.end} as date)
      and coalesce(${jobStageStations.plannedEnd}, ${jobStageStations.plannedStart}) >= cast(${window.start} as date)
    )
    or (
      ${jobStageStations.actualStart} is null
      and ${jobStageStations.plannedStart} is null
      and ${jobStageStations.plannedEnd} is not null
      and ${jobStageStations.plannedEnd} >= cast(${window.start} as date)
      and ${jobStageStations.plannedEnd} <= cast(${window.end} as date)
    )
  )`;
}

function mapSharedStationBookingRow(row: {
  booking: JobStageStationRow;
  customer: CustomerRow | null;
  job: JobRow;
  product: ProductRow;
  quote: typeof quotes.$inferSelect | null;
  stage: JobStageRow;
  station: StationRow;
}): SharedStationBookingRow {
  let quote: QuoteRow | null = null;
  if (row.quote) {
    if (!row.customer) {
      throw new Error(`Missing customer row for quote ${row.quote.id}.`);
    }
    quote = { code: row.quote.code, customer: row.customer };
  }

  return {
    ...row.booking,
    jobStage: {
      ...row.stage,
      job: {
        ...row.job,
        product: row.product,
        quote,
      },
    },
    station: row.station,
  };
}

function mapSharedStationBookingJobs(rows: SharedStationBookingRow[]) {
  const jobsById = new Map<UUID, ReturnType<typeof mapSharedStationBookingJobSummary>>();

  for (const row of rows) {
    const jobId = row.jobStage.jobId;
    const existing = jobsById.get(jobId);
    if (existing) {
      existing.bookings.push(row);
      continue;
    }

    jobsById.set(jobId, {
      ...mapSharedStationBookingJobHeader(row.jobStage.job),
      bookings: [row],
    });
  }

  return [...jobsById.values()]
    .sort((left, right) => left.code.localeCompare(right.code))
    .map((job) => ({
      bookings: job.bookings.sort(compareSharedStationBookings).map((booking) => ({
        actualEnd: booking.actualEnd?.toISOString() ?? null,
        actualStart: booking.actualStart?.toISOString() ?? null,
        plannedEnd: booking.plannedEnd,
        plannedStart: booking.plannedStart,
        id: booking.id,
        jobStageId: booking.jobStageId,
        stage: booking.jobStage.stage,
        stationId: booking.stationId,
        stationName: booking.station.name,
      })),
      customerCompanyName: job.customerCompanyName,
      jobCode: job.code,
      jobId: job.id,
      status: job.status,
      productModelCode: job.productModelCode,
      productName: job.productName,
      quoteCode: job.quoteCode,
    }));
}

function mapSharedStationBookingJobHeader(row: JobHeaderWithProductRow) {
  return {
    customerCompanyName: row.quote?.customer.companyName ?? null,
    code: JobCode.parse(row.code),
    id: row.id,
    productModelCode: row.product.modelCode,
    productName: row.product.name,
    quoteCode: row.quote ? QuoteCode.parse(row.quote.code) : null,
    status: row.status,
  };
}

function mapSharedStationBookingJobSummary(row: JobHeaderWithProductRow) {
  return {
    ...mapSharedStationBookingJobHeader(row),
    bookings: [] as SharedStationBookingRow[],
  };
}

function compareSharedStationBookings(left: SharedStationBookingRow, right: SharedStationBookingRow): number {
  const stationOrder = left.station.displayOrder - right.station.displayOrder;
  if (stationOrder !== 0) return stationOrder;

  const leftStart = left.actualStart?.toISOString() ?? left.plannedStart ?? '';
  const rightStart = right.actualStart?.toISOString() ?? right.plannedStart ?? '';
  const startOrder = leftStart.localeCompare(rightStart);
  return startOrder === 0 ? left.id.localeCompare(right.id) : startOrder;
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
