import { type Db, jobSlots, jobs } from '@pkg/db';
import { foldJobScheduleStates, getPlantDateNow, isJobScheduleComplete } from '@pkg/domain';
import { type DateOnlyIso, UUID } from '@pkg/schema';
import { and, eq, exists, isNull, sql } from 'drizzle-orm';
import { diffAuditUpdate, recordAuditUpdate } from '../audit/audit-service.js';
import { findBoardBayRows, toProjectedBoard } from './board-read.js';
import { jobAuditDescriptor } from './job-service.js';
import { listWorkingCalendarOffDays } from './working-calendar-service.js';

export type JobCompletionSweepResult = {
  /** Jobs stamped by this run. */
  completed: number;
  /** Jobs considered — open, not cancelled, and scheduled somewhere. */
  considered: number;
};

/**
 * Stamps `completedOn` on every open Job whose Work Slots have all finished, using the Job's latest
 * `lastWorkDay`.
 *
 * Strictly additive: it only ever writes `NULL -> date`. It never overwrites an existing value and
 * never clears one, so a manual date survives, a recorded date cannot drift when an upstream Slot is
 * resized, and backfilling history is simply the first run. Jobs that are cancelled or have no Work
 * Slot are ineligible — a Job with no Slots carries no evidence of completion and is left to a human.
 *
 * Writes are audited with a null (system) actor: with no auto-vs-manual source column, the audit log
 * is the only record of where a date came from.
 */
export async function sweepJobCompletions({ db }: { db: Db }): Promise<JobCompletionSweepResult> {
  const today = getPlantDateNow();

  // A plain select, not the relational query builder: the RQB aliases `job`, which breaks the
  // correlation from the Work-Slot `exists` back out to the Job row.
  const candidates = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        isNull(jobs.completedOn),
        isNull(jobs.cancelledAt),
        exists(
          db
            .select({ one: sql`1` })
            .from(jobSlots)
            .where(and(eq(jobSlots.jobId, jobs.id), eq(jobSlots.kind, 'work'))),
        ),
      ),
    );

  if (candidates.length === 0) {
    return { completed: 0, considered: 0 };
  }

  const candidateIds = candidates.map((row) => UUID.parse(row.id));
  const [offDays, bayRows] = await Promise.all([listWorkingCalendarOffDays(db), findBoardBayRows(db)]);
  const states = foldJobScheduleStates(toProjectedBoard(bayRows, { offDays, today }).queues, candidateIds);

  let completed = 0;

  for (const jobId of candidateIds) {
    const state = states.get(jobId);

    if (!state || !isJobScheduleComplete(state) || state.lastWorkDay === null) {
      continue;
    }

    if (await stampJobCompletion({ completedOn: state.lastWorkDay, db, jobId })) {
      completed += 1;
    }
  }

  return { completed, considered: candidateIds.length };
}

/**
 * One Job's stamp, in its own transaction so a long backfill never holds a single lock over every row.
 * The `completed_on IS NULL` guard re-checks under the row lock, so a manual completion landing between
 * the projection and the write wins.
 */
async function stampJobCompletion({
  completedOn,
  db,
  jobId,
}: {
  completedOn: DateOnlyIso;
  db: Db;
  jobId: UUID;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for('update');

    if (!before || before.completedOn !== null || before.cancelledAt !== null) {
      return false;
    }

    const [row] = await tx
      .update(jobs)
      .set({ completedOn, updatedAt: new Date() })
      .where(and(eq(jobs.id, jobId), isNull(jobs.completedOn)))
      .returning();

    if (!row) {
      return false;
    }

    const changes = diffAuditUpdate(jobAuditDescriptor, before, row);

    if (changes) {
      await recordAuditUpdate({ actorUserId: null, after: row, changes, db: tx, descriptor: jobAuditDescriptor });
    }

    return true;
  });
}
