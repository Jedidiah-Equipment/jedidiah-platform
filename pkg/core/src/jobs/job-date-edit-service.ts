import { type DatabaseTransaction, type Db, jobEvents, jobStageStations, jobStages, jobs } from '@pkg/db';
import { deriveMilestoneEvents, hasPermission, rollupJobSchedule, rollupStageSchedule } from '@pkg/domain';
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
  jobStageStationAuditDescriptor,
} from '../audit/audit-service.js';
import { JobDateEditDeniedError, JobDateEditInvalidError, JobDateEditTargetNotFoundError } from './job-errors.js';
import { type JobAuditRecord, type JobStageRow, type JobStageStationRow, mapJobAuditRecord } from './job-mappers.js';
import { getJob } from './job-read-service.js';

type DateField = JobDateEditInput['field'];
type PlannedField = Extract<DateField, 'planned_start' | 'planned_end'>;
type ActualField = Extract<DateField, 'actual_start' | 'actual_end'>;
type DateEditEntityLevel = JobDateEditInput['entityLevel'];
type DateEditValue = string | null;
type AuditRecord = Record<string, unknown>;
type AuditDescriptor = {
  entityType: AuditEntityType;
  fields: Record<string, string>;
};
type StageWithBookings = JobStageRow & { stations: JobStageStationRow[] };

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
      throw new JobDateEditInvalidError('Stage dates are derived from Station Bookings.');
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
  throw new JobDateEditInvalidError('Only Job Due Date can be edited on a Job.');
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
  if (isPlannedField(input.field)) {
    assertPlannedDateEditKeepsRange({ field: input.field, row: target.booking, value: input.value });
  }
  if (isActualField(input.field)) {
    assertActualDateEditKeepsRange({ field: input.field, row: target.booking, value: input.value });
  }
  if (input.field === 'actual_end' && input.value !== null && !target.booking.actualStart) {
    throw new JobDateEditInvalidError('Station booking must be started before its actual end can be set.');
  }
  if (isDueDateField(input.field)) {
    throw new JobDateEditInvalidError('Job Due Date can only be edited on a Job.');
  }
  if (isNoOpDateEdit({ field: input.field, row: target.booking, value: input.value })) {
    return { jobId: target.stage.jobId };
  }
  const beforeStages = isActualField(input.field)
    ? await readStagesWithBookingsForUpdate(target.stage.jobId, tx)
    : undefined;
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
    if (!beforeStages) {
      throw new Error('Expected stage snapshot before actual date edit.');
    }
    const afterStages = await readStagesWithBookingsForUpdate(target.stage.jobId, tx);
    await insertDerivedMilestoneEvents({
      actorUserId,
      afterStages,
      beforeStages,
      editedStageId: target.stage.id,
      jobId: target.stage.jobId,
      tx,
    });
  }

  return { jobId: target.stage.jobId };
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

async function readJobForUpdate(id: UUID, tx: DatabaseTransaction) {
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, id)).for('update');
  if (!job) {
    throw new JobDateEditTargetNotFoundError(id);
  }
  return job;
}

async function readStationBookingForUpdate(
  id: UUID,
  tx: DatabaseTransaction,
): Promise<{ booking: JobStageStationRow; job: JobAuditRecord; stage: JobStageRow }> {
  const [row] = await tx
    .select({
      booking: jobStageStations,
      job: jobs,
      stage: jobStages,
    })
    .from(jobStageStations)
    .innerJoin(jobStages, eq(jobStages.id, jobStageStations.jobStageId))
    .innerJoin(jobs, eq(jobs.id, jobStages.jobId))
    .where(eq(jobStageStations.id, id))
    .for('update');

  if (!row) {
    throw new JobDateEditTargetNotFoundError(id);
  }

  return { booking: row.booking, job: mapJobAuditRecord(row.job), stage: row.stage };
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
  switch (field) {
    case 'actual_end':
      return { actualEnd: value ? new Date(value) : null };
    case 'actual_start':
      return { actualStart: value ? new Date(value) : null };
    case 'due_date':
      return { dueDate: value };
    case 'planned_end':
      return { plannedEnd: value };
    case 'planned_start':
      return { plannedStart: value };
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

async function insertDerivedMilestoneEvents({
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
    throw new JobDateEditTargetNotFoundError(editedStageId);
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
        value:
          eventType === 'stage.started' ? afterStageSchedule.actualWindow.start : afterStageSchedule.actualWindow.end,
        tx,
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

function getDateFieldValue(record: Record<string, unknown>, field: DateField): unknown {
  switch (field) {
    case 'actual_end':
      return record.actualEnd;
    case 'actual_start':
      return record.actualStart;
    case 'due_date':
      return record.dueDate;
    case 'planned_end':
      return record.plannedEnd;
    case 'planned_start':
      return record.plannedStart;
    default:
      return assertNever(field);
  }
}

function serializeDateEditValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function isPlannedField(field: DateField): field is PlannedField {
  return field === 'planned_start' || field === 'planned_end';
}

function isDueDateField(field: DateField): field is Extract<DateField, 'due_date'> {
  return field === 'due_date';
}

function isActualField(field: DateField): field is ActualField {
  return field === 'actual_start' || field === 'actual_end';
}

function assertPlannedDateEditKeepsRange({
  field,
  row,
  value,
}: {
  field: PlannedField;
  row: Pick<JobStageStationRow, 'plannedEnd' | 'plannedStart'>;
  value: string | null;
}): void {
  assertDueDateRange({
    plannedEnd: field === 'planned_end' ? value : row.plannedEnd,
    plannedStart: field === 'planned_start' ? value : row.plannedStart,
  });
}

function assertActualDateEditKeepsRange({
  field,
  row,
  value,
}: {
  field: ActualField;
  row: Pick<JobStageStationRow, 'actualEnd' | 'actualStart'>;
  value: string | null;
}): void {
  assertActualDateRange({
    actualEnd: field === 'actual_end' ? (value ? new Date(value) : null) : row.actualEnd,
    actualStart: field === 'actual_start' ? (value ? new Date(value) : null) : row.actualStart,
  });
}

function assertDueDateRange({
  plannedEnd,
  plannedStart,
}: {
  plannedEnd: string | null;
  plannedStart: string | null;
}): void {
  if (!plannedEnd || !plannedStart) return;

  if (parseDateOnly(plannedStart).getTime() > parseDateOnly(plannedEnd).getTime()) {
    throw new JobDateEditInvalidError('Planned start must be on or before planned end.');
  }
}

function assertActualDateRange({ actualEnd, actualStart }: { actualEnd: Date | null; actualStart: Date | null }): void {
  if (!actualEnd || !actualStart) return;

  if (actualStart.getTime() > actualEnd.getTime()) {
    throw new JobDateEditInvalidError('Actual start must be on or before actual end.');
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
  return serializeDateEditValue(getDateFieldValue(row, field)) === value;
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    throw new JobDateEditInvalidError('Date value must be a valid date.');
  }

  return new Date(Date.UTC(year, month - 1, day));
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

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
