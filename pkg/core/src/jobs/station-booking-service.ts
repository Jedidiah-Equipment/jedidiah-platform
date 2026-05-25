import { type DatabaseTransaction, type Db, jobEvents, jobStageStations, jobStages, jobs, stations } from '@pkg/db';
import { canEditStationBooking, evaluateActualWriteGuard, rollupJobSchedule, rollupStageSchedule } from '@pkg/domain';
import type { AuthId, JobDetail, UserAccessSummary, UUID } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { createAuditChanges, insertAuditEvent, jobStageStationAuditDescriptor } from '../audit/audit-service.js';
import { JobStationBookingNotFoundError, JobStationBookingTransitionDeniedError } from './job-errors.js';
import { type JobAuditRecord, type JobStageRow, type JobStageStationRow, mapJobAuditRecord } from './job-mappers.js';
import {
  insertDerivedMilestoneEvents,
  readStagesWithBookingsForUpdate,
  type StageWithBookings,
} from './job-milestone-event-service.js';
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
    job: mapJobAuditRecord(row.job),
    jobId: row.job.id,
    stage: row.stage,
    stages,
    station: row.station,
  };
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

function mapScheduleRollupBookings(
  bookings: readonly Pick<JobStageStationRow, 'actualEnd' | 'actualStart' | 'plannedEnd' | 'plannedStart'>[],
) {
  return bookings.map((booking) => ({
    actualEnd: booking.actualEnd,
    actualStart: booking.actualStart,
    plannedEnd: parseDateOnlyAsUtc(booking.plannedEnd),
    plannedStart: parseDateOnlyAsUtc(booking.plannedStart),
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
