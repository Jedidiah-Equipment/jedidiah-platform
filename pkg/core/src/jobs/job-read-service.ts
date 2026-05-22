import {
  type customers,
  type DatabaseTransaction,
  type Db,
  jobEvents,
  jobStageStations,
  jobStages,
  jobs,
  type products,
  type quotes,
} from '@pkg/db';
import { canViewStage, getStageTransitionAvailability } from '@pkg/domain';
import {
  JobCode,
  type JobDetail,
  JobSharedStationBookingsResult,
  type JobSortBy,
  type JobStageRollup,
  JobStageSummary,
  type JobSummary,
  QuoteCode,
  type UserAccessSummary,
  type UUID,
} from '@pkg/schema';
import { asc, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';

import { JobNotFoundError } from './job-errors.js';
import {
  deriveJobLifecycleStatus,
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
      stationId: jobStageStations.stationId,
    })
    .from(jobStageStations)
    .innerJoin(jobStages, eq(jobStages.id, jobStageStations.jobStageId))
    .where(eq(jobStages.jobId, jobId));
  const sharedStationIds = [...new Set(currentBookings.map((booking) => booking.stationId))];

  if (sharedStationIds.length === 0) {
    return { jobs: [] };
  }

  const rows = await db.query.jobStageStations.findMany({
    orderBy: [asc(jobStageStations.stationId), asc(jobStageStations.dueStart), asc(jobStageStations.id)],
    where: (booking) => inArray(booking.stationId, sharedStationIds),
    with: {
      jobStage: {
        with: {
          job: {
            columns: {
              actualEnd: true,
              actualEndSetManually: true,
              actualStart: true,
              actualStartSetManually: true,
              code: true,
              createdAt: true,
              dueEnd: true,
              dueEndSetManually: true,
              dueStart: true,
              dueStartSetManually: true,
              id: true,
              isCancelled: true,
              isPaused: true,
              productId: true,
              quoteId: true,
              updatedAt: true,
            },
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
            },
          },
        },
      },
      station: true,
    },
  });

  const otherRows = rows.filter((row) => row.jobStage.jobId !== jobId) as SharedStationBookingRow[];

  return JobSharedStationBookingsResult.parse({
    jobs: mapSharedStationBookingJobs(otherRows),
  });
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
        dueEnd: booking.dueEnd,
        dueStart: booking.dueStart,
        id: booking.id,
        jobStageId: booking.jobStageId,
        stage: booking.jobStage.stage,
        stationId: booking.stationId,
        stationName: booking.station.name,
      })),
      customerCompanyName: job.customerCompanyName,
      jobCode: job.code,
      jobId: job.id,
      lifecycleStatus: job.lifecycleStatus,
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
    lifecycleStatus: deriveJobLifecycleStatus(row),
    productModelCode: row.product.modelCode,
    productName: row.product.name,
    quoteCode: row.quote ? QuoteCode.parse(row.quote.code) : null,
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

  const leftStart = left.actualStart?.toISOString() ?? left.dueStart ?? '';
  const rightStart = right.actualStart?.toISOString() ?? right.dueStart ?? '';
  const startOrder = leftStart.localeCompare(rightStart);
  return startOrder === 0 ? left.id.localeCompare(right.id) : startOrder;
}

export function getJobSortColumn(sortBy: JobSortBy): SQL {
  const columns = {
    actualEnd: sql`${jobs.actualEnd}`,
    code: sql`${jobs.code}`,
    createdAt: sql`${jobs.createdAt}`,
    dueEnd: sql`${jobs.dueEnd}`,
    id: sql`${jobs.id}`,
    // Derived lifecycle sorting is a UI contract: not-started, active, complete, paused, cancelled.
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
