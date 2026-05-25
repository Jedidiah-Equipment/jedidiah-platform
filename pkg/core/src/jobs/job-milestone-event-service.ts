import { type DatabaseTransaction, jobEvents, jobStageStations, jobStages } from '@pkg/db';
import { deriveMilestoneEvents, rollupJobSchedule, rollupStageSchedule } from '@pkg/domain';
import type { AuthId, JobEvent, UUID } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { JobStationBookingNotFoundError } from './job-errors.js';
import type { JobStageRow, JobStageStationRow } from './job-mappers.js';

export type StageWithBookings = JobStageRow & { stations: JobStageStationRow[] };

export async function readStagesWithBookingsForUpdate(
  jobId: UUID,
  tx: DatabaseTransaction,
): Promise<StageWithBookings[]> {
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

export async function insertDerivedMilestoneEvents({
  actorUserId,
  afterStages,
  beforeStages,
  editedStageId,
  jobId,
  tx,
}: {
  actorUserId: AuthId;
  afterStages: StageWithBookings[];
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
      eventType,
      jobId,
      nextWindow: afterJobSchedule.actualWindow,
      tx,
    });
  }
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
  eventType,
  jobId,
  nextWindow,
  tx,
}: {
  actorUserId: AuthId;
  eventType: Extract<JobEvent['eventType'], 'job.completed' | 'job.started'>;
  jobId: UUID;
  nextWindow: { end: Date | null; start: Date | null };
  tx: DatabaseTransaction;
}): Promise<void> {
  const value = eventType === 'job.started' ? nextWindow.start : nextWindow.end;

  if (!value) {
    throw new Error(`${eventType} requires an actual value.`);
  }

  await tx.insert(jobEvents).values({
    actorUserId,
    eventType,
    jobId,
    occurredAt: new Date(),
    payload: {
      [eventType === 'job.started' ? 'actualStart' : 'actualEnd']: value.toISOString(),
    },
    stageId: null,
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
