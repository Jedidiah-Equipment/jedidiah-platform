import type { jobEvents, jobStageStations, jobStages, jobs, stations, user } from '@pkg/db';
import { deriveJobStatus, deriveLevelStatus } from '@pkg/domain';
import type { JobLifecycleStatus, JobWorkState } from '@pkg/schema';
import { Job, JobEvent, JobEventDerivationStage, JobStage, Station, StationBooking } from '@pkg/schema';

export type JobRow = typeof jobs.$inferSelect;
export type JobEventRow = typeof jobEvents.$inferSelect;
export type JobEventWithActorRow = JobEventRow & {
  actor: Pick<typeof user.$inferSelect, 'name'> | null;
};
export type JobStageRow = typeof jobStages.$inferSelect;
export type StationRow = typeof stations.$inferSelect;
export type JobStageStationRow = typeof jobStageStations.$inferSelect;
export type JobStageStationWithStationRow = JobStageStationRow & {
  station: StationRow;
};
export type JobAuditRecord = Pick<
  JobRow,
  | 'actualEnd'
  | 'actualEndSetManually'
  | 'actualStart'
  | 'actualStartSetManually'
  | 'code'
  | 'dueEnd'
  | 'dueEndSetManually'
  | 'dueDate'
  | 'dueStart'
  | 'dueStartSetManually'
  | 'isCancelled'
  | 'isPaused'
  | 'productId'
  | 'quoteId'
>;

export function deriveJobLifecycleStatus(
  row: Pick<JobRow, 'actualEnd' | 'actualStart' | 'isCancelled' | 'isPaused'>,
): JobLifecycleStatus {
  return deriveJobStatus(row);
}

export function deriveWorkState(
  row: Pick<JobStageRow | JobStageStationRow, 'actualEnd' | 'actualStart'>,
): JobWorkState {
  return deriveLevelStatus(row);
}

export function mapJob(row: JobRow): Job {
  return Job.parse({
    actualEnd: row.actualEnd?.toISOString() ?? null,
    actualEndSetManually: row.actualEndSetManually,
    actualStart: row.actualStart?.toISOString() ?? null,
    actualStartSetManually: row.actualStartSetManually,
    code: row.code,
    createdAt: row.createdAt.toISOString(),
    dueEnd: row.dueEnd,
    dueEndSetManually: row.dueEndSetManually,
    dueDate: row.dueDate,
    dueStart: row.dueStart,
    dueStartSetManually: row.dueStartSetManually,
    id: row.id,
    isCancelled: row.isCancelled,
    isPaused: row.isPaused,
    lifecycleStatus: deriveJobLifecycleStatus(row),
    productId: row.productId,
    quoteId: row.quoteId,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function mapJobAuditRecord(job: JobAuditRecord): JobAuditRecord {
  return {
    actualEnd: job.actualEnd,
    actualEndSetManually: job.actualEndSetManually,
    actualStart: job.actualStart,
    actualStartSetManually: job.actualStartSetManually,
    code: job.code,
    dueEnd: job.dueEnd,
    dueEndSetManually: job.dueEndSetManually,
    dueDate: job.dueDate,
    dueStart: job.dueStart,
    dueStartSetManually: job.dueStartSetManually,
    isCancelled: job.isCancelled,
    isPaused: job.isPaused,
    productId: job.productId,
    quoteId: job.quoteId,
  };
}

export function mapStation(row: StationRow): Station {
  return Station.parse({
    createdAt: row.createdAt.toISOString(),
    department: row.department,
    displayOrder: row.displayOrder,
    id: row.id,
    isActive: row.isActive,
    name: row.name,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function mapStationBooking(row: JobStageStationWithStationRow): StationBooking {
  return StationBooking.parse({
    actualEnd: row.actualEnd?.toISOString() ?? null,
    actualEndSetManually: row.actualEndSetManually,
    actualStart: row.actualStart?.toISOString() ?? null,
    actualStartSetManually: row.actualStartSetManually,
    createdAt: row.createdAt.toISOString(),
    dueEnd: row.dueEnd,
    dueEndSetManually: row.dueEndSetManually,
    dueStart: row.dueStart,
    dueStartSetManually: row.dueStartSetManually,
    id: row.id,
    jobStageId: row.jobStageId,
    state: deriveWorkState(row),
    station: mapStation(row.station),
    stationId: row.stationId,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function mapJobStage(row: JobStageRow): JobStage {
  const state = deriveWorkState(row);

  return JobStage.parse({
    actualEnd: row.actualEnd?.toISOString() ?? null,
    actualEndSetManually: row.actualEndSetManually,
    actualStart: row.actualStart?.toISOString() ?? null,
    actualStartSetManually: row.actualStartSetManually,
    dueEnd: row.dueEnd,
    dueEndSetManually: row.dueEndSetManually,
    dueStart: row.dueStart,
    dueStartSetManually: row.dueStartSetManually,
    id: row.id,
    jobId: row.jobId,
    sequence: row.sequence,
    stage: row.stage,
    state,
  });
}

export function mapJobEventWithActor(row: JobEventWithActorRow): JobEvent {
  return parseJobEvent(row, row.actor?.name ?? null);
}

function parseJobEvent(row: JobEventRow, actorName: string | null): JobEvent {
  // DB currently stores event_type as text; this parse intentionally fails fast until the column is constrained.
  return JobEvent.parse({
    actorName,
    actorUserId: row.actorUserId,
    eventType: row.eventType,
    id: row.id,
    jobId: row.jobId,
    occurredAt: row.occurredAt.toISOString(),
    payload: row.payload,
    stageId: row.stageId,
  });
}

export function mapJobEventDerivationStage(row: JobStageRow): JobEventDerivationStage {
  return JobEventDerivationStage.parse({
    actualEnd: row.actualEnd?.toISOString() ?? null,
    actualStart: row.actualStart?.toISOString() ?? null,
    stage: row.stage,
  });
}
