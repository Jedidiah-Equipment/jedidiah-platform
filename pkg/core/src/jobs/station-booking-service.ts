import { type DatabaseTransaction, type Db, jobEvents, jobStageStations, jobStages, jobs, stations } from '@pkg/db';
import { canEditStationBooking, cascadeUp, deriveJobStatus, evaluateActualWriteGuard } from '@pkg/domain';
import type { AuthId, JobDetail, JobEvent, UserAccessSummary, UUID } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import {
  createAuditChanges,
  insertAuditEvent,
  jobAuditDescriptor,
  jobStageAuditDescriptor,
  jobStageStationAuditDescriptor,
} from '../audit/audit-service.js';
import {
  JobNotFoundError,
  JobStationBookingNotFoundError,
  JobStationBookingTransitionDeniedError,
} from './job-errors.js';
import {
  type JobAuditRecord,
  type JobStageRow,
  type JobStageStationRow,
  mapJobAuditRecord,
  mapJobStage,
} from './job-mappers.js';
import { getJob } from './job-read-service.js';

type StationBookingTransition = 'start' | 'stop';

type StationBookingTarget = {
  booking: JobStageStationRow;
  job: JobAuditRecord;
  jobId: UUID;
  stage: JobStageRow;
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

    await cascadeStageActuals({
      actorUserId,
      beforeStage: target.stage,
      tx,
    });

    await cascadeJobActuals({
      actorUserId,
      beforeJob: target.job,
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

    if (target.job.actualEnd) {
      throw new JobStationBookingTransitionDeniedError('Job is already complete.');
    }

    if (target.stage.actualEnd) {
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

  return {
    booking: row.booking,
    job: mapJobAuditRecord(row.job),
    jobId: row.job.id,
    stage: row.stage,
    station: row.station,
  };
}

async function cascadeStageActuals({
  actorUserId,
  beforeStage,
  tx,
}: {
  actorUserId: AuthId;
  beforeStage: JobStageRow;
  tx: DatabaseTransaction;
}): Promise<JobStageRow> {
  const bookings = await tx
    .select()
    .from(jobStageStations)
    .where(eq(jobStageStations.jobStageId, beforeStage.id))
    .for('update');

  const nextActuals = cascadeUp({
    children: bookings,
    currentParent: beforeStage,
    stickyMarker: beforeStage,
  });

  if (
    datesEqual(beforeStage.actualStart, nextActuals.actualStart) &&
    datesEqual(beforeStage.actualEnd, nextActuals.actualEnd)
  ) {
    return beforeStage;
  }

  const [updatedStage] = await tx
    .update(jobStages)
    .set(nextActuals)
    .where(eq(jobStages.id, beforeStage.id))
    .returning();

  if (!updatedStage) {
    throw new JobNotFoundError(beforeStage.jobId);
  }

  await insertAuditEvent({
    db: tx,
    input: {
      action: 'updated',
      actorUserId,
      after: mapJobStage(updatedStage),
      before: mapJobStage(beforeStage),
      changes: createAuditChanges(mapJobStage(beforeStage), mapJobStage(updatedStage), jobStageAuditDescriptor.fields),
      entityId: updatedStage.id,
      entityType: jobStageAuditDescriptor.entityType,
    },
  });

  if (!beforeStage.actualStart && updatedStage.actualStart) {
    await insertStageCascadeEvent({ actorUserId, eventType: 'stage.started', stage: updatedStage, tx });
  }

  if (!beforeStage.actualEnd && updatedStage.actualEnd) {
    await insertStageCascadeEvent({ actorUserId, eventType: 'stage.ended', stage: updatedStage, tx });
  }

  return updatedStage;
}

async function cascadeJobActuals({
  actorUserId,
  beforeJob,
  jobId,
  tx,
}: {
  actorUserId: AuthId;
  beforeJob: JobAuditRecord;
  jobId: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  const stages = await tx.select().from(jobStages).where(eq(jobStages.jobId, jobId)).for('update');
  const nextActuals = cascadeUp({
    children: stages,
    currentParent: beforeJob,
    stickyMarker: beforeJob,
  });

  if (
    datesEqual(beforeJob.actualStart, nextActuals.actualStart) &&
    datesEqual(beforeJob.actualEnd, nextActuals.actualEnd)
  ) {
    return;
  }

  const [updatedJob] = await tx
    .update(jobs)
    .set({ ...nextActuals, updatedAt: new Date() })
    .where(eq(jobs.id, jobId))
    .returning();

  if (!updatedJob) {
    throw new JobNotFoundError(jobId);
  }

  const afterJob = mapJobAuditRecord(updatedJob);

  await insertAuditEvent({
    db: tx,
    input: {
      action: 'updated',
      actorUserId,
      after: afterJob,
      before: beforeJob,
      changes: createAuditChanges(beforeJob, afterJob, jobAuditDescriptor.fields),
      entityId: updatedJob.id,
      entityType: jobAuditDescriptor.entityType,
    },
  });

  if (!beforeJob.actualStart && updatedJob.actualStart) {
    await insertJobCascadeEvent({ actorUserId, beforeJob, eventType: 'job.started', job: updatedJob, tx });
  }

  if (!beforeJob.actualEnd && updatedJob.actualEnd) {
    await insertJobCascadeEvent({ actorUserId, beforeJob, eventType: 'job.completed', job: updatedJob, tx });
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

async function insertStageCascadeEvent({
  actorUserId,
  eventType,
  stage,
  tx,
}: {
  actorUserId: AuthId;
  eventType: 'stage.started' | 'stage.ended';
  stage: JobStageRow;
  tx: DatabaseTransaction;
}): Promise<void> {
  const actualValue = eventType === 'stage.started' ? stage.actualStart : stage.actualEnd;

  if (!actualValue) {
    throw new Error(`${eventType} requires an actual value.`);
  }

  await tx.insert(jobEvents).values({
    actorUserId,
    eventType,
    jobId: stage.jobId,
    occurredAt: new Date(),
    payload: {
      [eventType === 'stage.started' ? 'actualStart' : 'actualEnd']: actualValue.toISOString(),
      stage: stage.stage,
    },
    stageId: stage.id,
  });
}

async function insertJobCascadeEvent({
  actorUserId,
  beforeJob,
  eventType,
  job,
  tx,
}: {
  actorUserId: AuthId;
  beforeJob: JobAuditRecord;
  eventType: Extract<JobEvent['eventType'], 'job.completed' | 'job.started'>;
  job: typeof jobs.$inferSelect;
  tx: DatabaseTransaction;
}): Promise<void> {
  await tx.insert(jobEvents).values({
    actorUserId,
    eventType,
    jobId: job.id,
    occurredAt: new Date(),
    payload: {
      fromLifecycleStatus: deriveJobStatus(beforeJob),
      toLifecycleStatus: deriveJobStatus(job),
    },
    stageId: null,
  });
}

function datesEqual(left: Date | null, right: Date | null): boolean {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

function assertReturnedRow<TRow>(rows: readonly TRow[], message: string): TRow {
  const [row] = rows;

  if (!row) {
    throw new Error(message);
  }

  return row;
}
