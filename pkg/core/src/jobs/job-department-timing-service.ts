import { type DatabaseTransaction, type Db, jobDepartmentCrew, jobDepartmentTimings, user } from '@pkg/db';
import { getPlantDateNow, toPlantDateOnly } from '@pkg/domain';
import type {
  AuthId,
  JobDepartmentTimingCompleteInput,
  JobDepartmentTimingStartInput,
  JobDepartmentTimingUpdateInput,
  UUID,
  WorkItemDepartment,
} from '@pkg/schema';
import { and, asc, eq } from 'drizzle-orm';

import { recordAuditEvent } from '../audit/audit-service.js';
import { jobAuditDescriptor } from './job-audit.js';
import { getAssignableBayOperatorForUpdate } from './job-bay-service.js';
import {
  JobDepartmentTimingAlreadyCompletedError,
  JobDepartmentTimingAlreadyStartedError,
  JobDepartmentTimingInvalidError,
  JobDepartmentTimingLockedError,
  JobDepartmentTimingNotStartedError,
} from './job-errors.js';
import type { JobRow } from './job-mappers.js';
import { lockMutableJob } from './job-mutation-guards.js';

type TimingRow = typeof jobDepartmentTimings.$inferSelect;

/**
 * The stamps a person witnessed on one Department's work. Every mutation here is an observation about
 * work already done: nothing in scheduling, the board, or the Job lifecycle reads what it writes, and
 * a stamp never moves a Slot. The Job's own completion is what freezes them.
 */
export async function startDepartmentTiming({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: JobDepartmentTimingStartInput;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const job = await lockStampableJob(tx, input.id);
    const existing = await findTiming(tx, input.id, input.department);

    if (existing) {
      throw new JobDepartmentTimingAlreadyStartedError(input.id, input.department);
    }

    const startedAt = new Date();

    await tx.insert(jobDepartmentTimings).values({
      department: input.department,
      jobId: input.id,
      startedAt,
    });

    await recordTimingAudit({
      actorUserId,
      department: input.department,
      from: null,
      job,
      to: { completedAt: null, crew: [], startedAt },
      tx,
    });
  });
}

export async function completeDepartmentTiming({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: JobDepartmentTimingCompleteInput;
}): Promise<void> {
  await db.transaction(async (tx) => {
    // Deliberately not `lockStampableJob`: closing an observation that was already open is the one
    // stamp a completed Job still accepts. The completion sweep stamps `completedOn` the day after a
    // Job's last Slot ends, so a fabrication run that overran its Slot would otherwise be locked out
    // by an automatic write — dropping exactly the late builds the actual-versus-scheduled metric
    // exists to show. Starting a new observation and correcting a recorded one stay locked.
    const job = await lockMutableJob(tx, input.id);
    const existing = await findTiming(tx, input.id, input.department);

    if (!existing) {
      if (job.completedOn !== null) {
        throw new JobDepartmentTimingLockedError(input.id);
      }

      throw new JobDepartmentTimingNotStartedError(input.id, input.department);
    }

    // The correction path owns re-stamping. Without this, a replayed request or a second manager on a
    // stale sheet silently rewrites both the recorded duration and who is credited for it.
    if (existing.completedAt !== null) {
      throw new JobDepartmentTimingAlreadyCompletedError(input.id, input.department);
    }

    const before = await readTimingState(tx, existing);
    const crew = await resolveCrew(tx, input.crewUserIds);
    const completedAt = new Date();

    await tx
      .update(jobDepartmentTimings)
      .set({ completedAt, updatedAt: new Date() })
      .where(timingKey(input.id, input.department));
    await replaceCrew(tx, input.id, input.department, crew);

    await recordTimingAudit({
      actorUserId,
      department: input.department,
      from: before,
      job,
      to: { completedAt, crew: crew.map((member) => member.name), startedAt: existing.startedAt },
      tx,
    });
  });
}

/**
 * The correction path: the caller sends the whole desired state for one department, so clearing a
 * mistaken stamp is expressible (`startedAt: null` removes the row and its crew) rather than needing
 * its own verb.
 */
export async function updateDepartmentTiming({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: JobDepartmentTimingUpdateInput;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const job = await lockStampableJob(tx, input.id);
    const existing = await findTiming(tx, input.id, input.department);
    const before = existing ? await readTimingState(tx, existing) : null;

    if (input.startedAt === null) {
      if (input.completedAt !== null) {
        throw new JobDepartmentTimingInvalidError('A done time needs a start time.');
      }

      if (input.crewUserIds.length > 0) {
        throw new JobDepartmentTimingInvalidError('Crew can only be recorded against a done time.');
      }

      if (existing) {
        await tx.delete(jobDepartmentTimings).where(timingKey(input.id, input.department));
        await recordTimingAudit({
          actorUserId,
          department: input.department,
          from: before,
          job,
          to: null,
          tx,
        });
      }

      return;
    }

    const startedAt = new Date(input.startedAt);
    const completedAt = input.completedAt === null ? null : new Date(input.completedAt);

    if (completedAt && completedAt < startedAt) {
      throw new JobDepartmentTimingInvalidError('The done time cannot be before the start time.');
    }

    assertNotInFuture(startedAt);
    if (completedAt) assertNotInFuture(completedAt);

    if (completedAt === null && input.crewUserIds.length > 0) {
      throw new JobDepartmentTimingInvalidError('Crew can only be recorded against a done time.');
    }

    if (completedAt !== null && input.crewUserIds.length === 0) {
      throw new JobDepartmentTimingInvalidError('Name at least one crew member.');
    }

    // Only newly-named crew are role-checked. Someone already on this record was a Bay Operator when
    // they were recorded, and the record is the point: re-validating them would make a pure date fix
    // impossible the day one of them changes role, and the only way to save would be to drop the
    // person who actually did the work.
    const recordedCrewIds = await listRecordedCrewIds(tx, input.id, input.department);
    const crew = await resolveCrew(tx, input.crewUserIds, recordedCrewIds);

    await tx
      .insert(jobDepartmentTimings)
      .values({ completedAt, department: input.department, jobId: input.id, startedAt })
      .onConflictDoUpdate({
        set: { completedAt, startedAt, updatedAt: new Date() },
        target: [jobDepartmentTimings.jobId, jobDepartmentTimings.department],
      });
    await replaceCrew(tx, input.id, input.department, crew);

    await recordTimingAudit({
      actorUserId,
      department: input.department,
      from: before,
      job,
      to: { completedAt, crew: crew.map((member) => member.name), startedAt },
      tx,
    });
  });
}

/** Cancelled Jobs are refused by the shared guard; a completed Job latches its observations shut. */
async function lockStampableJob(tx: DatabaseTransaction, id: UUID): Promise<JobRow> {
  const job = await lockMutableJob(tx, id);

  if (job.completedOn !== null) {
    throw new JobDepartmentTimingLockedError(id);
  }

  return job;
}

/**
 * Compared as plant business dates, not as instants — the precedent `job.completed_on_in_future` sets.
 * Both clients send a plant date, which parses to a UTC-midnight instant sitting two hours ahead of
 * the plant day it names, so an instant comparison rejects a correction to *today* made before 02:00
 * plant time.
 */
function assertNotInFuture(stamp: Date): void {
  if (toPlantDateOnly(stamp) > getPlantDateNow()) {
    throw new JobDepartmentTimingInvalidError('A timing stamp cannot be in the future.');
  }
}

function timingKey(jobId: UUID, department: WorkItemDepartment) {
  return and(eq(jobDepartmentTimings.jobId, jobId), eq(jobDepartmentTimings.department, department));
}

async function findTiming(
  tx: DatabaseTransaction,
  jobId: UUID,
  department: WorkItemDepartment,
): Promise<TimingRow | undefined> {
  const [row] = await tx.select().from(jobDepartmentTimings).where(timingKey(jobId, department)).for('update');

  return row;
}

/**
 * `alreadyRecorded` names the crew this timing already carries, which are taken as-is; everyone else
 * is a candidate and must hold the Bay Operator role, exactly as `assignJobBayOperator` demands. A
 * done-stamp passes no set, because there every crew member is new.
 */
async function resolveCrew(
  tx: DatabaseTransaction,
  crewUserIds: readonly AuthId[],
  alreadyRecorded: ReadonlySet<string> = new Set(),
): Promise<{ id: string; name: string }[]> {
  const uniqueIds = [...new Set(crewUserIds)];
  const crew: { id: string; name: string }[] = [];

  for (const crewUserId of uniqueIds) {
    if (alreadyRecorded.has(crewUserId)) {
      const [recorded] = await tx
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(eq(user.id, crewUserId))
        .for('update');

      // The crew table's FK to `user` is ON DELETE RESTRICT, so a recorded member always has a row.
      if (recorded) {
        crew.push(recorded);
        continue;
      }
    }

    const operator = await getAssignableBayOperatorForUpdate(tx, crewUserId);

    crew.push({ id: operator.id, name: operator.name });
  }

  return crew;
}

async function listRecordedCrewIds(
  tx: DatabaseTransaction,
  jobId: UUID,
  department: WorkItemDepartment,
): Promise<ReadonlySet<string>> {
  const rows = await tx
    .select({ crewUserId: jobDepartmentCrew.crewUserId })
    .from(jobDepartmentCrew)
    .where(and(eq(jobDepartmentCrew.jobId, jobId), eq(jobDepartmentCrew.department, department)));

  return new Set(rows.map((row) => row.crewUserId));
}

async function replaceCrew(
  tx: DatabaseTransaction,
  jobId: UUID,
  department: WorkItemDepartment,
  crew: readonly { id: string }[],
): Promise<void> {
  await tx
    .delete(jobDepartmentCrew)
    .where(and(eq(jobDepartmentCrew.jobId, jobId), eq(jobDepartmentCrew.department, department)));

  if (crew.length === 0) return;

  await tx.insert(jobDepartmentCrew).values(crew.map((member) => ({ crewUserId: member.id, department, jobId })));
}

type TimingState = { completedAt: Date | null; crew: string[]; startedAt: Date };

async function readTimingState(tx: DatabaseTransaction, row: TimingRow): Promise<TimingState> {
  const crew = await tx
    .select({ name: user.name })
    .from(jobDepartmentCrew)
    .innerJoin(user, eq(user.id, jobDepartmentCrew.crewUserId))
    .where(and(eq(jobDepartmentCrew.jobId, row.jobId), eq(jobDepartmentCrew.department, row.department)))
    .orderBy(asc(user.name));

  return { completedAt: row.completedAt, crew: crew.map((member) => member.name), startedAt: row.startedAt };
}

/**
 * Audited as a Job update under one `departmentTiming:<department>` field: the Job is what a reader is
 * looking at, and the whole stamp state reads as one change rather than three columns of a table
 * nobody browses. The stable field name is also the Job Activity projection boundary: only the four
 * work Departments are curated into Work Time entries, never the surrounding raw audit change set.
 */
async function recordTimingAudit({
  actorUserId,
  department,
  from,
  job,
  to,
  tx,
}: {
  actorUserId: AuthId;
  department: WorkItemDepartment;
  from: TimingState | null;
  job: JobRow;
  to: TimingState | null;
  tx: DatabaseTransaction;
}): Promise<void> {
  await recordAuditEvent({
    action: 'updated',
    actorUserId,
    changes: {
      [`departmentTiming:${department}`]: {
        from: from && {
          ...from,
          completedAt: from.completedAt?.toISOString() ?? null,
          startedAt: from.startedAt.toISOString(),
        },
        to: to && { ...to, completedAt: to.completedAt?.toISOString() ?? null, startedAt: to.startedAt.toISOString() },
      },
    },
    db: tx,
    descriptor: jobAuditDescriptor,
    entityId: job.id,
    record: { code: job.code },
  });
}
