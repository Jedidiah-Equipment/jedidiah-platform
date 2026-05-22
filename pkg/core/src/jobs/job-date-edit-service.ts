import { type DatabaseTransaction, type Db, jobEvents, jobStageStations, jobStages, jobs } from '@pkg/db';
import { cascadeDown, cascadeUp, deriveJobStatus, hasPermission } from '@pkg/domain';
import type {
  AuditEntityType,
  AuthId,
  JobDateEditInput,
  JobDetail,
  JobEvent,
  UserAccessSummary,
  UUID,
} from '@pkg/schema';
import { eq } from 'drizzle-orm';

import {
  createAuditChanges,
  insertAuditEvent,
  jobAuditDescriptor,
  jobStageAuditDescriptor,
  jobStageStationAuditDescriptor,
} from '../audit/audit-service.js';
import {
  JobDateEditDeniedError,
  JobDateEditInvalidError,
  JobDateEditTargetNotFoundError,
  JobNotFoundError,
} from './job-errors.js';
import {
  type JobAuditRecord,
  type JobStageRow,
  type JobStageStationRow,
  mapJobAuditRecord,
  mapJobStage,
} from './job-mappers.js';
import { getJob } from './job-read-service.js';

type DateField = JobDateEditInput['field'];
type DueField = Extract<DateField, 'due_start' | 'due_end'>;
type ActualField = Extract<DateField, 'actual_start' | 'actual_end'>;
type DateEditEntityLevel = JobDateEditInput['entityLevel'];
type DateEditValue = string | null;
type AuditRecord = Record<string, unknown>;
type AuditDescriptor = {
  entityType: AuditEntityType;
  fields: Record<string, string>;
};
type DueDateShiftRow<Key extends string = string> = {
  dueEnd: string | null;
  dueEndSetManually: boolean;
  dueStart: string | null;
  dueStartSetManually: boolean;
  id: Key;
};

export async function editJobDate({
  access,
  actorUserId,
  db,
  input,
}: {
  access: UserAccessSummary;
  actorUserId: AuthId;
  db: Db;
  input: JobDateEditInput;
}): Promise<JobDetail> {
  if (!hasPermission(access, 'job:update')) {
    throw new JobDateEditDeniedError('Only supervisors can edit job dates.');
  }

  return db.transaction(async (tx) => {
    const result = await applyDateEdit({ actorUserId, input, tx });
    return getJob({ access, db: tx, id: result.jobId });
  });
}

async function applyDateEdit({
  actorUserId,
  input,
  tx,
}: {
  actorUserId: AuthId;
  input: JobDateEditInput;
  tx: DatabaseTransaction;
}): Promise<{ jobId: UUID }> {
  switch (input.entityLevel) {
    case 'job':
      return editJobLevelDate({ actorUserId, input, tx });
    case 'stage':
      return editStageLevelDate({ actorUserId, input, tx });
    case 'station-booking':
      return editStationBookingLevelDate({ actorUserId, input, tx });
    default:
      return assertNever(input.entityLevel);
  }
}

async function editJobLevelDate({
  actorUserId,
  input,
  tx,
}: {
  actorUserId: AuthId;
  input: JobDateEditInput;
  tx: DatabaseTransaction;
}): Promise<{ jobId: UUID }> {
  const beforeJob = await readJobForUpdate(input.entityId, tx);
  if (isDueDateField(input.field)) {
    return editJobDueDate({ actorUserId, beforeJob, input, tx });
  }
  if (isDueField(input.field)) {
    assertDueDateEditKeepsRange({ field: input.field, row: beforeJob, value: input.value });
  }
  if (isNoOpDateEdit({ field: input.field, row: beforeJob, value: input.value })) {
    return { jobId: beforeJob.id };
  }
  const updatedJob = await updateJobDateField({ field: input.field, id: beforeJob.id, tx, value: input.value });
  const afterJob = mapJobAuditRecord(updatedJob);
  const beforeAuditJob = mapJobAuditRecord(beforeJob);

  await insertDateEditAuditEvents({
    actorUserId,
    after: afterJob,
    before: beforeAuditJob,
    descriptor: jobAuditDescriptor,
    entityId: updatedJob.id,
    tx,
  });
  await insertDateOverriddenEvent({
    actorUserId,
    entityId: updatedJob.id,
    entityLevel: input.entityLevel,
    field: input.field,
    jobId: updatedJob.id,
    newValue: serializeDateEditValue(getDateFieldValue(afterJob, input.field)),
    oldValue: serializeDateEditValue(getDateFieldValue(beforeAuditJob, input.field)),
    stageId: null,
    tx,
  });

  if (isDueField(input.field) && input.value !== null) {
    await cascadeJobDueDates({
      actorUserId,
      anchorField: input.field,
      jobId: updatedJob.id,
      nextValue: input.value,
      previousValue: getDateFieldValue(beforeAuditJob, input.field) as string | null,
      tx,
    });
  } else if (isDueField(input.field)) {
    // Clearing a Job due anchor only re-enables the Job field's auto state. There is no remaining
    // delta to apply safely, so existing Stage and Station Booking windows stay as-is.
  }

  return { jobId: updatedJob.id };
}

async function editJobDueDate({
  actorUserId,
  beforeJob,
  input,
  tx,
}: {
  actorUserId: AuthId;
  beforeJob: Awaited<ReturnType<typeof readJobForUpdate>>;
  input: JobDateEditInput;
  tx: DatabaseTransaction;
}): Promise<{ jobId: UUID }> {
  if (isNoOpDateEdit({ field: input.field, row: beforeJob, value: input.value })) {
    return { jobId: beforeJob.id };
  }

  const updatedJob = await updateJobDateField({ field: input.field, id: beforeJob.id, tx, value: input.value });
  const afterJob = mapJobAuditRecord(updatedJob);
  const beforeAuditJob = mapJobAuditRecord(beforeJob);

  await insertDateEditAuditEvents({
    actorUserId,
    after: afterJob,
    before: beforeAuditJob,
    descriptor: jobAuditDescriptor,
    entityId: updatedJob.id,
    tx,
  });
  await insertDateOverriddenEvent({
    actorUserId,
    entityId: updatedJob.id,
    entityLevel: input.entityLevel,
    field: input.field,
    jobId: updatedJob.id,
    newValue: serializeDateEditValue(getDateFieldValue(afterJob, input.field)),
    oldValue: serializeDateEditValue(getDateFieldValue(beforeAuditJob, input.field)),
    stageId: null,
    tx,
  });

  return { jobId: updatedJob.id };
}

async function editStageLevelDate({
  actorUserId,
  input,
  tx,
}: {
  actorUserId: AuthId;
  input: JobDateEditInput;
  tx: DatabaseTransaction;
}): Promise<{ jobId: UUID }> {
  const beforeStage = await readStageForUpdate(input.entityId, tx);
  const beforeJob = await readJobForUpdate(beforeStage.jobId, tx);
  if (isDueField(input.field)) {
    assertDueDateEditKeepsRange({ field: input.field, row: beforeStage, value: input.value });
  }
  if (isNoOpDateEdit({ field: input.field, row: beforeStage, value: input.value })) {
    return { jobId: beforeStage.jobId };
  }
  const updatedStage = await updateStageDateField({ field: input.field, id: beforeStage.id, tx, value: input.value });

  await insertDateEditAuditEvents({
    actorUserId,
    after: mapJobStage(updatedStage),
    before: mapJobStage(beforeStage),
    descriptor: jobStageAuditDescriptor,
    entityId: updatedStage.id,
    tx,
  });
  await insertDateOverriddenEvent({
    actorUserId,
    entityId: updatedStage.id,
    entityLevel: input.entityLevel,
    field: input.field,
    jobId: updatedStage.jobId,
    newValue: serializeDateEditValue(getDateFieldValue(updatedStage, input.field)),
    oldValue: serializeDateEditValue(getDateFieldValue(beforeStage, input.field)),
    stageId: updatedStage.id,
    tx,
  });

  if (isDueField(input.field) && input.value !== null) {
    await cascadeStageDueDates({
      actorUserId,
      anchorField: input.field,
      nextValue: input.value,
      previousValue: getDateFieldValue(beforeStage, input.field) as string | null,
      stageId: updatedStage.id,
      tx,
    });
  }

  if (isActualField(input.field)) {
    await cascadeJobActuals({
      actorUserId,
      beforeJob: mapJobAuditRecord(beforeJob),
      jobId: beforeStage.jobId,
      tx,
    });
  }

  return { jobId: beforeStage.jobId };
}

async function editStationBookingLevelDate({
  actorUserId,
  input,
  tx,
}: {
  actorUserId: AuthId;
  input: JobDateEditInput;
  tx: DatabaseTransaction;
}): Promise<{ jobId: UUID }> {
  const target = await readStationBookingForUpdate(input.entityId, tx);
  const beforeJob = await readJobForUpdate(target.stage.jobId, tx);
  if (isDueField(input.field)) {
    assertDueDateEditKeepsRange({ field: input.field, row: target.booking, value: input.value });
  }
  if (input.field === 'actual_end' && input.value !== null && !target.booking.actualStart) {
    throw new JobDateEditInvalidError('Station booking must be started before its actual end can be set.');
  }
  if (isNoOpDateEdit({ field: input.field, row: target.booking, value: input.value })) {
    return { jobId: target.stage.jobId };
  }
  const updatedBooking = await updateStationBookingDateField({
    field: input.field,
    id: target.booking.id,
    tx,
    value: input.value,
  });

  await insertDateEditAuditEvents({
    actorUserId,
    after: updatedBooking,
    before: target.booking,
    descriptor: jobStageStationAuditDescriptor,
    entityId: updatedBooking.id,
    tx,
  });
  await insertDateOverriddenEvent({
    actorUserId,
    entityId: updatedBooking.id,
    entityLevel: input.entityLevel,
    field: input.field,
    jobId: target.stage.jobId,
    newValue: serializeDateEditValue(getDateFieldValue(updatedBooking, input.field)),
    oldValue: serializeDateEditValue(getDateFieldValue(target.booking, input.field)),
    stageId: target.stage.id,
    tx,
  });

  if (isActualField(input.field)) {
    await cascadeStageActuals({
      actorUserId,
      beforeStage: target.stage,
      tx,
    });
    await cascadeJobActuals({
      actorUserId,
      beforeJob: mapJobAuditRecord(beforeJob),
      jobId: target.stage.jobId,
      tx,
    });
  }

  return { jobId: target.stage.jobId };
}

async function cascadeJobDueDates({
  actorUserId,
  anchorField,
  jobId,
  nextValue,
  previousValue,
  tx,
}: {
  actorUserId: AuthId;
  anchorField: DueField;
  jobId: UUID;
  nextValue: string;
  previousValue: string | null;
  tx: DatabaseTransaction;
}): Promise<void> {
  const stages = await tx.select().from(jobStages).where(eq(jobStages.jobId, jobId)).for('update');
  const nextStageById = shiftDueDateRows({
    anchorField,
    nextValue,
    previousValue,
    rows: stages,
  });

  for (const beforeStage of stages) {
    const nextStage = nextStageById.get(beforeStage.id);
    if (!nextStage) continue;

    const afterStage = await updateStageDueFieldsIfChanged({
      actorUserId,
      beforeStage,
      nextDueEnd: nextStage.dueEnd,
      nextDueStart: nextStage.dueStart,
      tx,
    });
    await cascadeStageDueDatesByDelta({
      actorUserId,
      nextDueEnd: afterStage.dueEnd,
      nextDueStart: afterStage.dueStart,
      previousDueEnd: beforeStage.dueEnd,
      previousDueStart: beforeStage.dueStart,
      stageId: beforeStage.id,
      tx,
    });
  }
}

async function cascadeStageDueDates({
  actorUserId,
  anchorField,
  nextValue,
  previousValue,
  stageId,
  tx,
}: {
  actorUserId: AuthId;
  anchorField: DueField;
  nextValue: string;
  previousValue: string | null;
  stageId: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  const delta = getDayDelta(previousValue, nextValue);
  await cascadeStageDueDatesByDelta({
    actorUserId,
    nextDueEnd: anchorField === 'due_end' ? nextValue : null,
    nextDueStart: anchorField === 'due_start' ? nextValue : null,
    previousDueEnd: anchorField === 'due_end' ? previousValue : null,
    previousDueStart: anchorField === 'due_start' ? previousValue : null,
    stageId,
    tx,
    explicitDeltaDays: delta,
  });
}

async function cascadeStageDueDatesByDelta({
  actorUserId,
  explicitDeltaDays,
  nextDueEnd,
  nextDueStart,
  previousDueEnd,
  previousDueStart,
  stageId,
  tx,
}: {
  actorUserId: AuthId;
  explicitDeltaDays?: number;
  nextDueEnd: string | null;
  nextDueStart: string | null;
  previousDueEnd: string | null;
  previousDueStart: string | null;
  stageId: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  const bookings = await tx
    .select()
    .from(jobStageStations)
    .where(eq(jobStageStations.jobStageId, stageId))
    .for('update');
  const deltaDays =
    explicitDeltaDays ??
    (nextDueStart && previousDueStart
      ? getDayDelta(previousDueStart, nextDueStart)
      : nextDueEnd && previousDueEnd
        ? getDayDelta(previousDueEnd, nextDueEnd)
        : 0);

  if (deltaDays === 0) return;

  const nextBookingById = shiftDueDateRows({
    anchorField: 'due_start',
    nextValue: shiftDateOnly('2000-01-01', deltaDays) ?? '2000-01-01',
    previousValue: '2000-01-01',
    rows: bookings,
  });

  for (const booking of bookings) {
    const nextBooking = nextBookingById.get(booking.id);
    if (!nextBooking) continue;
    await updateStationBookingDueFieldsIfChanged({
      actorUserId,
      beforeBooking: booking,
      nextDueEnd: nextBooking.dueEnd,
      nextDueStart: nextBooking.dueStart,
      tx,
    });
  }
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

  await insertDateEditAuditEvents({
    actorUserId,
    after: mapJobStage(updatedStage),
    before: mapJobStage(beforeStage),
    descriptor: jobStageAuditDescriptor,
    entityId: updatedStage.id,
    tx,
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

  await insertDateEditAuditEvents({
    actorUserId,
    after: afterJob,
    before: beforeJob,
    descriptor: jobAuditDescriptor,
    entityId: updatedJob.id,
    tx,
  });

  if (!beforeJob.actualStart && updatedJob.actualStart) {
    await insertJobCascadeEvent({ actorUserId, beforeJob, eventType: 'job.started', job: updatedJob, tx });
  }

  if (!beforeJob.actualEnd && updatedJob.actualEnd) {
    await insertJobCascadeEvent({ actorUserId, beforeJob, eventType: 'job.completed', job: updatedJob, tx });
  }
}

async function updateStageDueFieldsIfChanged({
  actorUserId,
  beforeStage,
  nextDueEnd,
  nextDueStart,
  tx,
}: {
  actorUserId: AuthId;
  beforeStage: JobStageRow;
  nextDueEnd: string | null;
  nextDueStart: string | null;
  tx: DatabaseTransaction;
}): Promise<JobStageRow> {
  if (beforeStage.dueStart === nextDueStart && beforeStage.dueEnd === nextDueEnd) {
    return beforeStage;
  }
  assertDueDateRange({ dueEnd: nextDueEnd, dueStart: nextDueStart });

  const [updatedStage] = await tx
    .update(jobStages)
    .set({ dueEnd: nextDueEnd, dueStart: nextDueStart })
    .where(eq(jobStages.id, beforeStage.id))
    .returning();

  if (!updatedStage) {
    throw new JobDateEditTargetNotFoundError(beforeStage.id);
  }

  await insertDateEditAuditEvents({
    actorUserId,
    after: mapJobStage(updatedStage),
    before: mapJobStage(beforeStage),
    descriptor: jobStageAuditDescriptor,
    entityId: updatedStage.id,
    tx,
  });

  return updatedStage;
}

async function updateStationBookingDueFieldsIfChanged({
  actorUserId,
  beforeBooking,
  nextDueEnd,
  nextDueStart,
  tx,
}: {
  actorUserId: AuthId;
  beforeBooking: JobStageStationRow;
  nextDueEnd: string | null;
  nextDueStart: string | null;
  tx: DatabaseTransaction;
}): Promise<void> {
  if (beforeBooking.dueStart === nextDueStart && beforeBooking.dueEnd === nextDueEnd) {
    return;
  }
  assertDueDateRange({ dueEnd: nextDueEnd, dueStart: nextDueStart });

  const [updatedBooking] = await tx
    .update(jobStageStations)
    .set({ dueEnd: nextDueEnd, dueStart: nextDueStart, updatedAt: new Date() })
    .where(eq(jobStageStations.id, beforeBooking.id))
    .returning();

  if (!updatedBooking) {
    throw new JobDateEditTargetNotFoundError(beforeBooking.id);
  }

  await insertDateEditAuditEvents({
    actorUserId,
    after: updatedBooking,
    before: beforeBooking,
    descriptor: jobStageStationAuditDescriptor,
    entityId: updatedBooking.id,
    tx,
  });
}

async function readJobForUpdate(id: UUID, tx: DatabaseTransaction) {
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, id)).for('update');
  if (!job) {
    throw new JobDateEditTargetNotFoundError(id);
  }
  return job;
}

async function readStageForUpdate(id: UUID, tx: DatabaseTransaction): Promise<JobStageRow> {
  const [stage] = await tx.select().from(jobStages).where(eq(jobStages.id, id)).for('update');
  if (!stage) {
    throw new JobDateEditTargetNotFoundError(id);
  }
  return stage;
}

async function readStationBookingForUpdate(
  id: UUID,
  tx: DatabaseTransaction,
): Promise<{ booking: JobStageStationRow; stage: JobStageRow }> {
  const [row] = await tx
    .select({
      booking: jobStageStations,
      stage: jobStages,
    })
    .from(jobStageStations)
    .innerJoin(jobStages, eq(jobStages.id, jobStageStations.jobStageId))
    .where(eq(jobStageStations.id, id))
    .for('update');

  if (!row) {
    throw new JobDateEditTargetNotFoundError(id);
  }

  return row;
}

async function updateJobDateField({
  field,
  id,
  tx,
  value,
}: {
  field: DateField;
  id: UUID;
  tx: DatabaseTransaction;
  value: DateEditValue;
}) {
  const [job] = await tx
    .update(jobs)
    .set({ ...createDateUpdate(field, value), updatedAt: new Date() })
    .where(eq(jobs.id, id))
    .returning();
  if (!job) {
    throw new JobDateEditTargetNotFoundError(id);
  }
  return job;
}

async function updateStageDateField({
  field,
  id,
  tx,
  value,
}: {
  field: DateField;
  id: UUID;
  tx: DatabaseTransaction;
  value: DateEditValue;
}) {
  const [stage] = await tx
    .update(jobStages)
    .set(createDateUpdate(field, value))
    .where(eq(jobStages.id, id))
    .returning();
  if (!stage) {
    throw new JobDateEditTargetNotFoundError(id);
  }
  return stage;
}

async function updateStationBookingDateField({
  field,
  id,
  tx,
  value,
}: {
  field: DateField;
  id: UUID;
  tx: DatabaseTransaction;
  value: DateEditValue;
}) {
  const [booking] = await tx
    .update(jobStageStations)
    .set({ ...createDateUpdate(field, value), updatedAt: new Date() })
    .where(eq(jobStageStations.id, id))
    .returning();
  if (!booking) {
    throw new JobDateEditTargetNotFoundError(id);
  }
  return booking;
}

function createDateUpdate(field: DateField, value: DateEditValue) {
  const setManually = value !== null;

  switch (field) {
    case 'actual_end':
      return { actualEnd: value ? new Date(value) : null, actualEndSetManually: setManually };
    case 'actual_start':
      return { actualStart: value ? new Date(value) : null, actualStartSetManually: setManually };
    case 'due_date':
      return { dueDate: value };
    case 'due_end':
      return { dueEnd: value, dueEndSetManually: setManually };
    case 'due_start':
      return { dueStart: value, dueStartSetManually: setManually };
    default:
      return assertNever(field);
  }
}

async function insertDateEditAuditEvents({
  actorUserId,
  after,
  before,
  descriptor,
  entityId,
  tx,
}: {
  actorUserId: AuthId;
  after: AuditRecord;
  before: AuditRecord;
  descriptor: AuditDescriptor;
  entityId: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  const changes = createAuditChanges(before, after, descriptor.fields);
  if (!changes) return;

  for (const [field, change] of Object.entries(changes)) {
    await insertAuditEvent({
      db: tx,
      input: {
        action: 'updated',
        actorUserId,
        after,
        before,
        changes: { [field]: change },
        entityId,
        entityType: descriptor.entityType,
      },
    });
  }
}

async function insertDateOverriddenEvent({
  actorUserId,
  entityId,
  entityLevel,
  field,
  jobId,
  newValue,
  oldValue,
  stageId,
  tx,
}: {
  actorUserId: AuthId;
  entityId: UUID;
  entityLevel: DateEditEntityLevel;
  field: DateField;
  jobId: UUID;
  newValue: string | null;
  oldValue: string | null;
  stageId: UUID | null;
  tx: DatabaseTransaction;
}): Promise<void> {
  await tx.insert(jobEvents).values({
    actorUserId,
    eventType: 'date.overridden',
    jobId,
    occurredAt: new Date(),
    payload: {
      entityId,
      entityLevel,
      field,
      newValue,
      oldValue,
    },
    stageId,
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

function getDateFieldValue(record: Record<string, unknown>, field: DateField): unknown {
  switch (field) {
    case 'actual_end':
      return record.actualEnd;
    case 'actual_start':
      return record.actualStart;
    case 'due_date':
      return record.dueDate;
    case 'due_end':
      return record.dueEnd;
    case 'due_start':
      return record.dueStart;
    default:
      return assertNever(field);
  }
}

function serializeDateEditValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function isDueField(field: DateField): field is DueField {
  return field === 'due_start' || field === 'due_end';
}

function isDueDateField(field: DateField): field is Extract<DateField, 'due_date'> {
  return field === 'due_date';
}

function isActualField(field: DateField): field is ActualField {
  return field === 'actual_start' || field === 'actual_end';
}

function shiftDueDateRows<Key extends string>({
  anchorField,
  nextValue,
  previousValue,
  rows,
}: {
  anchorField: DueField;
  nextValue: string;
  previousValue: string | null;
  rows: readonly DueDateShiftRow<Key>[];
}): Map<Key, { dueEnd: string | null; dueStart: string | null }> {
  const anchor = {
    kind: anchorField === 'due_start' ? 'start' : 'end',
    value: parseDateOnly(nextValue),
    ...(previousValue ? { previousValue: parseDateOnly(previousValue) } : {}),
  } as const;

  // Shift mode only uses the anchor delta and each row's current dates/sticky markers. Durations are
  // deliberately zero placeholders so every due shift, including bookings, goes through one helper.
  const shiftedRows = cascadeDown({
    anchor,
    currentLevels: rows.map((row) => ({
      dueEnd: parseOptionalDateOnly(row.dueEnd),
      dueStart: parseOptionalDateOnly(row.dueStart),
      key: row.id,
    })),
    durations: rows.map((row) => ({ durationDays: 0, key: row.id })),
    mode: 'shift',
    stickyMarkers: rows.map((row) => ({
      dueEndSetManually: row.dueEndSetManually,
      dueStartSetManually: row.dueStartSetManually,
      key: row.id,
    })),
  });

  return new Map(
    shiftedRows.map((row) => [
      row.key,
      {
        dueEnd: formatOptionalDateOnly(row.dueEnd),
        dueStart: formatOptionalDateOnly(row.dueStart),
      },
    ]),
  );
}

function assertDueDateEditKeepsRange({
  field,
  row,
  value,
}: {
  field: DueField;
  row: Pick<DueDateShiftRow, 'dueEnd' | 'dueStart'>;
  value: string | null;
}): void {
  assertDueDateRange({
    dueEnd: field === 'due_end' ? value : row.dueEnd,
    dueStart: field === 'due_start' ? value : row.dueStart,
  });
}

function assertDueDateRange({ dueEnd, dueStart }: { dueEnd: string | null; dueStart: string | null }): void {
  if (!dueEnd || !dueStart) return;

  if (parseDateOnly(dueStart).getTime() > parseDateOnly(dueEnd).getTime()) {
    throw new JobDateEditInvalidError('Due start must be on or before due end.');
  }
}

function isNoOpDateEdit({
  field,
  row,
  value,
}: {
  field: DateField;
  row: Record<string, unknown>;
  value: string | null;
}): boolean {
  if (isDueDateField(field)) {
    return serializeDateEditValue(getDateFieldValue(row, field)) === value;
  }

  const nextSetManually = value !== null;
  return (
    serializeDateEditValue(getDateFieldValue(row, field)) === value &&
    getDateFieldManualValue(row, field) === nextSetManually
  );
}

function getDateFieldManualValue(record: Record<string, unknown>, field: Exclude<DateField, 'due_date'>): boolean {
  switch (field) {
    case 'actual_end':
      return record.actualEndSetManually === true;
    case 'actual_start':
      return record.actualStartSetManually === true;
    case 'due_end':
      return record.dueEndSetManually === true;
    case 'due_start':
      return record.dueStartSetManually === true;
    default:
      return assertNever(field);
  }
}

function parseOptionalDateOnly(value: string | null): Date | null {
  return value ? parseDateOnly(value) : null;
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    throw new JobDateEditInvalidError('Date value must be a valid date.');
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatOptionalDateOnly(value: Date | null): string | null {
  return value ? formatDateOnly(value) : null;
}

function shiftDateOnly(value: string | null, deltaDays: number): string | null {
  if (!value) return null;

  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return formatOptionalDateOnly(date);
}

function getDayDelta(previousValue: string | null, nextValue: string): number {
  if (!previousValue) return 0;
  return Math.round((parseDateOnly(nextValue).getTime() - parseDateOnly(previousValue).getTime()) / 86_400_000);
}

function datesEqual(left: Date | null, right: Date | null): boolean {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
