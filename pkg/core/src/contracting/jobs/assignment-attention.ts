import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import { contractingAttentionDismissals, contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import {
  type AttentionStint,
  type JobActor,
  rearmedAttentionKinds,
  stintAttentionKinds,
} from '@pkg/domain/contracting';
import { type AssignmentAttentionKind, type AttentionDismissInput, DismissedAttention } from '@pkg/schema/contracting';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getContractingSettings } from '../settings/settings-service.js';
import { attentionCleared, withJobConstraints } from './job-errors.js';
import type { DbOrTx } from './job-load.js';
import { lockStintFor } from './job-lock.js';

/**
 * Assignment Attention, whole: the rule the Job read applies, its SQL twin the queues count and filter with, the
 * dismissals both read, the dismiss write, and the re-arming every Assignment write runs. Nothing else in core
 * knows a dismissal exists.
 */

type AssignmentRow = typeof contractingMachineAssignments.$inferSelect;

const undismissed = (kind: AssignmentAttentionKind) => sql`not exists (
  select 1
  from contracting.attention_dismissal
  where contracting.attention_dismissal.assignment_id = summary_assignment.id
    and contracting.attention_dismissal.kind = ${kind}
)`;

/**
 * The Job's stints that need a look against the thresholds as Settings holds them now, less what was dismissed:
 * the SQL twin of `stintAttention`.
 */
export const assignmentAttention = sql<number>`(
  select count(*)::integer
  from contracting.machine_assignment summary_assignment
  cross join contracting.settings
  where summary_assignment.job_id = ${contractingJobs.id}
    and (
      (summary_assignment.travel_hours > contracting.settings.travel_flag_threshold_hours
        and summary_assignment.travel_set_at is null
        and ${undismissed('travel-over-threshold')})
      or (summary_assignment.travel_clamped and ${undismissed('travel-clamped')})
      or ((abs(summary_assignment.arrival_hours - summary_assignment.arrival_telematics_hours)
          > contracting.settings.john_deere_difference_threshold_hours
        or abs(summary_assignment.departure_hours - summary_assignment.departure_telematics_hours)
          > contracting.settings.john_deere_difference_threshold_hours)
        and ${undismissed('john-deere-difference')})
    )
)`;

export const needsALook = sql<boolean>`(${assignmentAttention} > 0)`;

/** Every dismissal on the Job's Assignments, by Assignment, with who dismissed it. */
export async function loadDismissals(db: DbOrTx, jobId: string) {
  const byAssignment = new Map<string, DismissedAttention[]>();
  const rows = await db
    .select({
      assignmentId: contractingAttentionDismissals.assignmentId,
      kind: contractingAttentionDismissals.kind,
      dismissedAt: contractingAttentionDismissals.dismissedAt,
      dismissedByName: user.name,
    })
    .from(contractingAttentionDismissals)
    .innerJoin(
      contractingMachineAssignments,
      eq(contractingMachineAssignments.id, contractingAttentionDismissals.assignmentId),
    )
    .innerJoin(user, eq(user.id, contractingAttentionDismissals.dismissedByUserId))
    .where(eq(contractingMachineAssignments.jobId, jobId));
  for (const { assignmentId, dismissedAt, ...row } of rows) {
    const dismissal = DismissedAttention.parse({ ...row, dismissedAt: dismissedAt.toISOString() });
    byAssignment.set(assignmentId, [...(byAssignment.get(assignmentId) ?? []), dismissal]);
  }
  return byAssignment;
}

const reading = (hours: number | null, telematicsHours: number | null, telematicsAt: Date | null) =>
  hours === null
    ? null
    : {
        hours,
        telematics:
          telematicsHours !== null && telematicsAt !== null
            ? { hours: telematicsHours, at: telematicsAt.toISOString() }
            : null,
      };

/** What the kinds read off a stored Machine Assignment. */
export const attentionStint = (row: AssignmentRow): AttentionStint => ({
  travelHours: row.travelHours,
  travelClamped: row.travelClamped,
  travelSet: row.travelSetAt !== null,
  arrival: reading(row.arrivalHours, row.arrivalTelematicsHours, row.arrivalTelematicsAt),
  departure: reading(row.departureHours, row.departureTelematicsHours, row.departureTelematicsAt),
});

/** Deletes the dismissals whose facts this Assignment write changed, so their kinds are judged again. */
export async function rearmAttention(tx: DatabaseTransaction, before: AssignmentRow, after: AssignmentRow) {
  const kinds = rearmedAttentionKinds(attentionStint(before), attentionStint(after));
  if (!kinds.length) return;
  await tx
    .delete(contractingAttentionDismissals)
    .where(
      and(
        eq(contractingAttentionDismissals.assignmentId, after.id),
        inArray(contractingAttentionDismissals.kind, kinds),
      ),
    );
}

/**
 * Dismisses one needs-a-look kind on a Machine Assignment for everyone, until the facts it reads change. A kind
 * already dismissed stays as it was; one that no longer holds is refused.
 */
export async function dismissAttention({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: AttentionDismissInput;
}): Promise<void> {
  await withJobConstraints(() =>
    db.transaction(async (tx) => {
      const { stint } = await lockStintFor(tx, input.assignmentId, 'dismissAttention', actor);
      if (!stintAttentionKinds(attentionStint(stint), await getContractingSettings({ db: tx })).includes(input.kind))
        throw attentionCleared();
      await tx
        .insert(contractingAttentionDismissals)
        .values({ assignmentId: stint.id, kind: input.kind, dismissedByUserId: actor.userId })
        .onConflictDoNothing();
    }),
  );
}
