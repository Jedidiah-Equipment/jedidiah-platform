import { type DatabaseTransaction, type Db, jobEvents, jobStageStations, jobStages, jobs, stations } from '@pkg/db';
import {
  canEditStationBooking,
  deriveJobStatus,
  deriveMilestoneEvents,
  evaluateActualWriteGuard,
  rollupJobSchedule,
  rollupStageSchedule,
} from '@pkg/domain';
import type { AuthId, JobDetail, JobEvent, UserAccessSummary, UUID } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { createAuditChanges, insertAuditEvent, jobStageStationAuditDescriptor } from '../audit/audit-service.js';
import { JobStationBookingNotFoundError, JobStationBookingTransitionDeniedError } from './job-errors.js';
import type { JobAuditRecord, JobStageRow, JobStageStationRow } from './job-mappers.js';
import { getJob } from './job-read-service.js';

type StationBookingTransition = 'start' | 'stop';

type StationBookingTarget = {
  booking: JobStageStationRow;
  job: JobAuditRecord;
  jobId: UUID;
  stage: JobStageRow;
  stages: StageWithBookings[];
  station: typeof stations.$inferSelect;
};

type StageWithBookings = JobStageRow & { stations: JobStageStationRow[] };

export async function startStationBooking({
  access,
  actorUserId,
  db,
  id,
}: {
  access: UserAccessSummary;
  actorUserId: AuthId;
  db: Db;
  id: UUID;
}): Promise<JobDetail> {
  return transitionStationBooking({ access, actorUserId, db, id, transition: 'start' });
}

export async function stopStationBooking({
  access,
  actorUserId,
  db,
  id,
}: {
  access: UserAccessSummary;
  actorUserId: AuthId;
  db: Db;
  id: UUID;
}): Promise<JobDetail> {
  return transitionStationBooking({ access, actorUserId, db, id, transition: 'stop' });
}

async function transitionStationBooking({
  access,
  actorUserId,
  db,
  id,
  transition,
}: {
  access: UserAccessSummary;
  actorUserId: AuthId;
  db: Db;
  id: UUID;
  transition: StationBookingTransition;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const target = await readStationBookingTarget({ id, tx });

    assertStationBookingTransitionAllowed({ access, target, transition });

    const now = new Date();
    const updatedBooking = assertReturnedRow(
      await tx
        .update(jobStageStations)
        .set(transition === 'start' ? { actualStart: now, updatedAt: now } : { actualEnd: now, updatedAt: now })
        .where(eq(jobStageStations.id, id))
        .returning(),
      'Station booking update did not return a row.',
    );

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'updated',
        actorUserId,
        after: updatedBooking,
        before: target.booking,
        changes: createAuditChanges(target.booking, updatedBooking, jobStageStationAuditDescriptor.fields),
        entityId: updatedBooking.id,
        entityType: jobStageStationAuditDescriptor.entityType,
      },
    });

    await insertStationTransitionEvent({
      actorUserId,
      booking: updatedBooking,
      jobId: target.jobId,
      stage: target.stage,
      station: target.station,
      transition,
      tx,
    });

    const afterStages = await readStagesWithBookingsForUpdate(target.jobId, tx);
    await insertDerivedMilestoneEvents({
      actorUserId,
      afterStages,
      beforeJob: target.job,
      beforeStages: target.stages,
      editedStageId: target.stage.id,
      jobId: target.jobId,
      tx,
    });

    return getJob({ access, db: tx, id: target.jobId });
  });
}

function assertStationBookingTransitionAllowed({
  access,
  target,
  transition,
}: {
  access: UserAccessSummary;
  target: StationBookingTarget;
  transition: StationBookingTransition;
}): void {
  const actualWriteGuard = evaluateActualWriteGuard(target.job);
  if (!actualWriteGuard.allowed) {
    throw new JobStationBookingTransitionDeniedError(actualWriteGuard.reason);
  }

  if (!canEditStationBooking(access, target.station)) {
    throw new JobStationBookingTransitionDeniedError('You do not have access to update this station booking.');
  }

  if (transition === 'start') {
    if (target.booking.actualEnd) {
      throw new JobStationBookingTransitionDeniedError('Station booking has already ended.');
    }

    const jobSchedule = rollupJobSchedule(
      target.stages.map((stage) => ({ bookings: mapScheduleRollupBookings(stage.stations) })),
    );
    const stageSchedule = rollupStageSchedule(
      mapScheduleRollupBookings(target.stages.find((stage) => stage.id === target.stage.id)?.stations ?? []),
    );

    if (jobSchedule.actualWindow.end) {
      throw new JobStationBookingTransitionDeniedError('Job is already complete.');
    }

    if (stageSchedule.actualWindow.end) {
      throw new JobStationBookingTransitionDeniedError('Stage is already complete.');
    }

    if (target.booking.actualStart) {
      throw new JobStationBookingTransitionDeniedError('Station booking has already started.');
    }

    return;
  }

  if (!target.booking.actualStart) {
    throw new JobStationBookingTransitionDeniedError('Station booking has not started.');
  }

  if (target.booking.actualEnd) {
    throw new JobStationBookingTransitionDeniedError('Station booking has already ended.');
  }
}

async function readStationBookingTarget({
  id,
  tx,
}: {
  id: UUID;
  tx: DatabaseTransaction;
}): Promise<StationBookingTarget> {
  const [row] = await tx
    .select({
      booking: jobStageStations,
      job: jobs,
      stage: jobStages,
      station: stations,
    })
    .from(jobStageStations)
    .innerJoin(jobStages, eq(jobStages.id, jobStageStations.jobStageId))
    .innerJoin(jobs, eq(jobs.id, jobStages.jobId))
    .innerJoin(stations, eq(stations.id, jobStageStations.stationId))
    .where(eq(jobStageStations.id, id))
    .for('update');

  if (!row) {
    throw new JobStationBookingNotFoundError(id);
  }
  const stages = await readStagesWithBookingsForUpdate(row.job.id, tx);

  return {
    booking: row.booking,
    job: {
      actualEnd: row.job.actualEnd,
      actualEndSetManually: row.job.actualEndSetManually,
      actualStart: row.job.actualStart,
      actualStartSetManually: row.job.actualStartSetManually,
      code: row.job.code,
      dueDate: row.job.dueDate,
      dueEnd: row.job.dueEnd,
      dueEndSetManually: row.job.dueEndSetManually,
      dueStart: row.job.dueStart,
      dueStartSetManually: row.job.dueStartSetManually,
      isCancelled: row.job.isCancelled,
      isPaused: row.job.isPaused,
      productId: row.job.productId,
      quoteId: row.job.quoteId,
    },
    jobId: row.job.id,
    stage: row.stage,
    stages,
    station: row.station,
  };
}

async function readStagesWithBookingsForUpdate(jobId: UUID, tx: DatabaseTransaction): Promise<StageWithBookings[]> {
  const stageRows = await tx.select().from(jobStages).where(eq(jobStages.jobId, jobId)).for('update');
  const bookingRows = await tx
    .select()
    .from(jobStageStations)
    .innerJoin(jobStages, eq(jobStages.id, jobStageStations.jobStageId))
    .where(eq(jobStages.jobId, jobId))
    .for('update');
  const bookingsByStageId = new Map<UUID, JobStageStationRow[]>();

  for (const row of bookingRows) {
    const bookings = bookingsByStageId.get(row.job_stage.id) ?? [];
    bookings.push(row.job_stage_station);
    bookingsByStageId.set(row.job_stage.id, bookings);
  }

  return stageRows.map((stage) => ({
    ...stage,
    stations: bookingsByStageId.get(stage.id) ?? [],
  }));
}

async function insertDerivedMilestoneEvents({
  actorUserId,
  afterStages,
  beforeJob,
  beforeStages,
  editedStageId,
  jobId,
  tx,
}: {
  actorUserId: AuthId;
  afterStages: StageWithBookings[];
  beforeJob: JobAuditRecord;
  beforeStages: StageWithBookings[];
  editedStageId: UUID;
  jobId: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  const beforeStage = beforeStages.find((stage) => stage.id === editedStageId);
  const afterStage = afterStages.find((stage) => stage.id === editedStageId);
  if (!beforeStage || !afterStage) {
    throw new JobStationBookingNotFoundError(editedStageId);
  }

  const beforeStageSchedule = rollupStageSchedule(mapScheduleRollupBookings(beforeStage.stations));
  const afterStageSchedule = rollupStageSchedule(mapScheduleRollupBookings(afterStage.stations));
  const beforeJobSchedule = rollupJobSchedule(
    beforeStages.map((stage) => ({ bookings: mapScheduleRollupBookings(stage.stations) })),
  );
  const afterJobSchedule = rollupJobSchedule(
    afterStages.map((stage) => ({ bookings: mapScheduleRollupBookings(stage.stations) })),
  );
  const events = deriveMilestoneEvents({
    job: { after: afterJobSchedule.actualWindow, before: beforeJobSchedule.actualWindow },
    stage: { after: afterStageSchedule.actualWindow, before: beforeStageSchedule.actualWindow },
  });

  for (const eventType of events) {
    if (eventType === 'stage.started' || eventType === 'stage.ended') {
      await insertStageMilestoneEvent({
        actorUserId,
        eventType,
        jobId,
        stage: afterStage,
        tx,
        value:
          eventType === 'stage.started' ? afterStageSchedule.actualWindow.start : afterStageSchedule.actualWindow.end,
      });
      continue;
    }

    await insertJobMilestoneEvent({
      actorUserId,
      beforeJob,
      beforeWindow: beforeJobSchedule.actualWindow,
      eventType,
      jobId,
      nextWindow: afterJobSchedule.actualWindow,
      tx,
    });
  }
}

async function insertStationTransitionEvent({
  actorUserId,
  booking,
  jobId,
  stage,
  station,
  transition,
  tx,
}: {
  actorUserId: AuthId;
  booking: JobStageStationRow;
  jobId: UUID;
  stage: JobStageRow;
  station: typeof stations.$inferSelect;
  transition: StationBookingTransition;
  tx: DatabaseTransaction;
}): Promise<void> {
  const isStart = transition === 'start';
  const eventType = isStart ? 'station.started' : 'station.ended';
  const actualValue = isStart ? booking.actualStart : booking.actualEnd;

  if (!actualValue) {
    throw new Error(`${eventType} requires an actual ${isStart ? 'start' : 'end'} value.`);
  }

  await tx.insert(jobEvents).values({
    actorUserId,
    eventType,
    jobId,
    occurredAt: new Date(),
    payload: {
      [isStart ? 'actualStart' : 'actualEnd']: actualValue.toISOString(),
      stage: stage.stage,
      stationBookingId: booking.id,
      stationId: station.id,
      stationName: station.name,
    },
    stageId: stage.id,
  });
}

async function insertStageMilestoneEvent({
  actorUserId,
  eventType,
  jobId,
  stage,
  tx,
  value,
}: {
  actorUserId: AuthId;
  eventType: 'stage.started' | 'stage.ended';
  jobId: UUID;
  stage: JobStageRow;
  tx: DatabaseTransaction;
  value: Date | null;
}): Promise<void> {
  if (!value) {
    throw new Error(`${eventType} requires an actual value.`);
  }

  await tx.insert(jobEvents).values({
    actorUserId,
    eventType,
    jobId,
    occurredAt: new Date(),
    payload: {
      [eventType === 'stage.started' ? 'actualStart' : 'actualEnd']: value.toISOString(),
      stage: stage.stage,
    },
    stageId: stage.id,
  });
}

async function insertJobMilestoneEvent({
  actorUserId,
  beforeJob,
  beforeWindow,
  eventType,
  jobId,
  nextWindow,
  tx,
}: {
  actorUserId: AuthId;
  beforeJob: JobAuditRecord;
  beforeWindow: { end: Date | null; start: Date | null };
  eventType: Extract<JobEvent['eventType'], 'job.completed' | 'job.started'>;
  jobId: UUID;
  nextWindow: { end: Date | null; start: Date | null };
  tx: DatabaseTransaction;
}): Promise<void> {
  await tx.insert(jobEvents).values({
    actorUserId,
    eventType,
    jobId,
    occurredAt: new Date(),
    payload: {
      fromLifecycleStatus: deriveJobStatus({
        actualEnd: beforeWindow.end,
        actualStart: beforeWindow.start,
        isCancelled: beforeJob.isCancelled,
        isPaused: beforeJob.isPaused,
      }),
      toLifecycleStatus: deriveJobStatus({
        actualEnd: nextWindow.end,
        actualStart: nextWindow.start,
        isCancelled: beforeJob.isCancelled,
        isPaused: beforeJob.isPaused,
      }),
    },
    stageId: null,
  });
}

function mapScheduleRollupBookings(
  bookings: readonly Pick<JobStageStationRow, 'actualEnd' | 'actualStart' | 'dueEnd' | 'dueStart'>[],
) {
  return bookings.map((booking) => ({
    actualEnd: booking.actualEnd,
    actualStart: booking.actualStart,
    plannedEnd: parseDateOnlyAsUtc(booking.dueEnd),
    plannedStart: parseDateOnlyAsUtc(booking.dueStart),
  }));
}

function parseDateOnlyAsUtc(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function assertReturnedRow<TRow>(rows: readonly TRow[], message: string): TRow {
  const [row] = rows;

  if (!row) {
    throw new Error(message);
  }

  return row;
}
