import { type DatabaseTransaction, type Db, jobStageStations, jobStages, jobs, quotes, stations } from '@pkg/db';
import { JOB_STAGE_PIPELINE } from '@pkg/domain';
import {
  type AuthId,
  DateIso,
  DateOnlyIso,
  type JobCreateInput,
  type JobDetail,
  type JobDueDateEditInput,
  type JobSetStatusInput,
  type QuoteStatus,
  type StationDateEditInput,
  type UserAccessSummary,
  type UUID,
} from '@pkg/schema';
import { and, eq } from 'drizzle-orm';

import {
  createAuditChanges,
  insertAuditEvent,
  jobAuditDescriptor,
  jobStageStationAuditDescriptor,
} from '../audit/audit-service.js';
import {
  JobCreateFromQuoteDeniedError,
  JobDateEditInvalidError,
  JobDateEditTargetNotFoundError,
  JobNotFoundError,
} from './job-errors.js';
import { type JobStageStationRow, mapJobAuditRecord } from './job-mappers.js';
import { getJob } from './job-read-service.js';
import {
  startStationBooking as startStationBookingTransition,
  stopStationBooking as stopStationBookingTransition,
} from './station-booking-service.js';

const JOB_ELIGIBLE_QUOTE_STATUSES: readonly QuoteStatus[] = ['accepted', 'draft', 'sent'];

type StationDateField = StationDateEditInput['field'];

export async function createJob({
  access,
  db,
  input,
  actorUserId,
}: {
  access: UserAccessSummary;
  db: Db;
  input: JobCreateInput;
  actorUserId: AuthId;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const quoteId = input.quoteId ?? null;

    if (quoteId) {
      await validateJobQuoteForCreate({ allowedStatuses: JOB_ELIGIBLE_QUOTE_STATUSES, quoteId, tx });
    }

    const [job] = await tx
      .insert(jobs)
      .values({
        dueDate: input.dueDate ?? null,
        productId: input.productId,
        quoteId,
      })
      .returning();

    if (!job) {
      throw new Error('Job insert did not return a row');
    }

    const stageRows = await tx
      .insert(jobStages)
      .values(buildJobStageInsertValues({ jobId: job.id }))
      .returning();

    const stageRowsByStage = new Map(stageRows.map((stage) => [stage.stage, stage]));
    const stationBookingValues =
      input.stages?.flatMap((stage) => {
        const stageRow = stageRowsByStage.get(stage.stage);
        if (!stageRow) {
          throw new Error(`Missing inserted row for ${stage.stage}.`);
        }

        return stage.stationBookings.map((booking) => ({
          plannedEnd: booking.plannedEnd ?? null,
          plannedStart: booking.plannedStart ?? null,
          jobStageId: stageRow.id,
          stationId: booking.stationId,
        }));
      }) ?? [];

    if (stationBookingValues.length > 0) {
      await tx.insert(jobStageStations).values(stationBookingValues);
    }

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'created',
        actorUserId,
        after: mapJobAuditRecord(job),
        before: null,
        changes: null,
        entityId: job.id,
        entityType: jobAuditDescriptor.entityType,
      },
    });

    return getJob({ access, db: tx, id: job.id });
  });
}

async function validateJobQuoteForCreate({
  allowedStatuses,
  quoteId,
  tx,
}: {
  allowedStatuses?: readonly QuoteStatus[];
  quoteId: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for('update');

  if (!quote) {
    throw new JobCreateFromQuoteDeniedError('Quote not found.');
  }

  if (allowedStatuses && !allowedStatuses.includes(quote.status)) {
    throw new JobCreateFromQuoteDeniedError("This quote's status does not allow job creation.");
  }

  return;
}

function buildJobStageInsertValues({ jobId }: { jobId: UUID }) {
  return JOB_STAGE_PIPELINE.map(({ sequence, stage }) => {
    return {
      jobId,
      sequence,
      stage,
    };
  });
}

export async function startStationBooking({
  db,
  access,
  actorUserId,
  id,
}: {
  db: Db;
  access: UserAccessSummary;
  actorUserId: AuthId;
  id: UUID;
}): Promise<JobDetail> {
  return startStationBookingTransition({ access, actorUserId, db, id });
}

export async function stopStationBooking({
  db,
  access,
  actorUserId,
  id,
}: {
  db: Db;
  access: UserAccessSummary;
  actorUserId: AuthId;
  id: UUID;
}): Promise<JobDetail> {
  return stopStationBookingTransition({ access, actorUserId, db, id });
}

export async function setJobStatus({
  access,
  actorUserId,
  db,
  input,
}: {
  access: UserAccessSummary;
  actorUserId: AuthId;
  db: Db;
  input: JobSetStatusInput;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const beforeJob = await readJobForUpdate(input.id, tx);

    if (beforeJob.status === input.status) {
      return getJob({ access, db: tx, id: beforeJob.id });
    }

    const [updatedJob] = await tx
      .update(jobs)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(jobs.id, input.id))
      .returning();

    if (!updatedJob) {
      throw new JobNotFoundError(input.id);
    }

    const before = mapJobAuditRecord(beforeJob);
    const after = mapJobAuditRecord(updatedJob);

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'updated',
        actorUserId,
        after,
        before,
        changes: createAuditChanges(before, after, jobAuditDescriptor.fields),
        entityId: updatedJob.id,
        entityType: jobAuditDescriptor.entityType,
      },
    });

    // TODO: Fix job event history.
    // await insertJobStatusChangedEvent({
    //   actorUserId,
    //   from: beforeJob.status,
    //   jobId: updatedJob.id,
    //   to: updatedJob.status,
    //   tx,
    // });

    return getJob({ access, db: tx, id: updatedJob.id });
  });
}

export async function editJobDueDate({
  db,
  access,
  actorUserId,
  input,
}: {
  db: Db;
  access: UserAccessSummary;
  actorUserId: AuthId;
  input: JobDueDateEditInput;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const beforeJob = await readJobForUpdate(input.jobId, tx);
    if (beforeJob.dueDate !== input.dueDate) {
      const [updatedJob] = await tx
        .update(jobs)
        .set({ dueDate: input.dueDate, updatedAt: new Date() })
        .where(eq(jobs.id, input.jobId))
        .returning();

      if (!updatedJob) {
        throw new JobDateEditTargetNotFoundError(input.jobId);
      }

      const beforeAuditJob = mapJobAuditRecord(beforeJob);
      const afterAuditJob = mapJobAuditRecord(updatedJob);

      await insertAuditEvent({
        db: tx,
        input: {
          action: 'updated',
          actorUserId,
          after: afterAuditJob,
          before: beforeAuditJob,
          changes: createAuditChanges(beforeAuditJob, afterAuditJob, jobAuditDescriptor.fields),
          entityId: input.jobId,
          entityType: jobAuditDescriptor.entityType,
        },
      });

      // TODO: Fix job event history.
      // await insertDateOverriddenEvent({
      //   actorUserId,
      //   entityId: updatedJob.id,
      //   entityLevel: 'job',
      //   field: 'due_date',
      //   jobId: updatedJob.id,
      //   newValue: updatedJob.dueDate,
      //   oldValue: beforeJob.dueDate,
      //   stageId: null,
      //   tx,
      // });
    }

    return getJob({ access, db: tx, id: input.jobId });
  });
}

async function readJobForUpdate(id: UUID, tx: DatabaseTransaction) {
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, id)).for('update');
  if (!job) {
    throw new JobDateEditTargetNotFoundError(id);
  }
  return job;
}

export async function editStationDate({
  db,
  access,
  actorUserId,
  input,
}: {
  db: Db;
  access: UserAccessSummary;
  actorUserId: AuthId;
  input: StationDateEditInput;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const target = await readStationBookingByNameForUpdate(input, tx);
    assertStationDateKeepsRange(target.booking, input);

    const oldValue = getStationDateValue(target.booking, input.field);
    if (oldValue !== input.value) {
      const updatedBooking = await updateStationDateField({
        id: target.booking.id,
        input,
        tx,
      });

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

      // TODO: Fix job event history.
      // await insertDateOverriddenEvent({
      //   actorUserId,
      //   entityId: updatedBooking.id,
      //   entityLevel: 'station-booking',
      //   field: input.field,
      //   jobId: input.jobId,
      //   newValue: getStationDateValue(updatedBooking, input.field),
      //   oldValue,
      //   stageId: target.stageId,
      //   tx,
      // });
    }

    return getJob({ access, db: tx, id: input.jobId });
  });
}

async function readStationBookingByNameForUpdate(
  input: StationDateEditInput,
  tx: DatabaseTransaction,
): Promise<{ booking: JobStageStationRow; stageId: UUID }> {
  const rows = await tx
    .select({
      booking: jobStageStations,
      stageId: jobStages.id,
    })
    .from(jobStageStations)
    .innerJoin(jobStages, eq(jobStages.id, jobStageStations.jobStageId))
    .innerJoin(stations, eq(stations.id, jobStageStations.stationId))
    .where(and(eq(jobStages.jobId, input.jobId), eq(stations.name, input.stationName)))
    .for('update', { of: jobStageStations });

  if (rows.length === 0) {
    throw new JobDateEditTargetNotFoundError(input.stationName);
  }
  if (rows.length > 1) {
    throw new JobDateEditInvalidError(`Station name is ambiguous for this Job: ${input.stationName}`);
  }

  const [row] = rows;
  if (!row) {
    throw new JobDateEditTargetNotFoundError(input.stationName);
  }

  return row;
}

async function updateStationDateField({
  id,
  input,
  tx,
}: {
  id: UUID;
  input: StationDateEditInput;
  tx: DatabaseTransaction;
}): Promise<JobStageStationRow> {
  const [booking] = await tx
    .update(jobStageStations)
    .set({ ...createStationDateUpdate(input), updatedAt: new Date() })
    .where(eq(jobStageStations.id, id))
    .returning();
  if (!booking) {
    throw new JobDateEditTargetNotFoundError(id);
  }
  return booking;
}

function createStationDateUpdate(input: StationDateEditInput) {
  switch (input.field) {
    case 'actual_end':
      return { actualEnd: input.value ? new Date(input.value) : null };
    case 'actual_start':
      return { actualStart: input.value ? new Date(input.value) : null };
    case 'planned_end':
      return { plannedEnd: input.value };
    case 'planned_start':
      return { plannedStart: input.value };
  }
}

function assertStationDateKeepsRange(
  booking: Pick<JobStageStationRow, 'actualEnd' | 'actualStart' | 'plannedEnd' | 'plannedStart'>,
  input: StationDateEditInput,
): void {
  switch (input.field) {
    case 'planned_start':
      assertPlannedDateRange(input.value, booking.plannedEnd ? DateOnlyIso.parse(booking.plannedEnd) : null);
      return;
    case 'planned_end':
      assertPlannedDateRange(booking.plannedStart ? DateOnlyIso.parse(booking.plannedStart) : null, input.value);
      return;
    case 'actual_start':
      assertActualDateRange(input.value ? new Date(input.value) : null, booking.actualEnd);
      return;
    case 'actual_end':
      assertActualDateRange(booking.actualStart, input.value ? new Date(input.value) : null);
      return;
  }
}

function assertPlannedDateRange(plannedStart: DateOnlyIso | null, plannedEnd: DateOnlyIso | null): void {
  if (plannedStart && plannedEnd && plannedStart > plannedEnd) {
    throw new JobDateEditInvalidError('Planned start must be on or before planned end.');
  }
}

function assertActualDateRange(actualStart: Date | null, actualEnd: Date | null): void {
  if (actualStart !== null && actualEnd !== null && actualStart.getTime() > actualEnd.getTime()) {
    throw new JobDateEditInvalidError('Actual start must be on or before actual end.');
  }
}

function getStationDateValue(booking: JobStageStationRow, field: StationDateField): DateIso | DateOnlyIso | null {
  switch (field) {
    case 'actual_end':
      return booking.actualEnd ? DateIso.parse(booking.actualEnd) : null;
    case 'actual_start':
      return booking.actualStart ? DateIso.parse(booking.actualStart) : null;
    case 'planned_end':
      return booking.plannedEnd ? DateOnlyIso.parse(booking.plannedEnd) : null;
    case 'planned_start':
      return booking.plannedStart ? DateOnlyIso.parse(booking.plannedStart) : null;
  }
}
