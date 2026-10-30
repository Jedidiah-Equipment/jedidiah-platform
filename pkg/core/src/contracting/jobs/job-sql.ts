import { contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import { JOB_NUMBER_DIGITS, JOB_NUMBER_PREFIX } from '@pkg/domain/contracting';
import type { AssignmentState, JobHoursRole } from '@pkg/schema/contracting';
import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

/**
 * The Job read model's derived facts, in SQL for the queues. Each mirrors a domain rule the detail read
 * computes in TypeScript (`assignmentState`, `stintAttentionKinds`, `looksFinished`), so a rule changes here and
 * there together.
 */

const stints = contractingMachineAssignments;

/** Each of a stint's Job Hours as the Machine Assignment holds it: the one table every reader of both sides walks. */
export const jobHoursColumns = {
  arrival: {
    hours: stints.arrivalHours,
    at: stints.arrivalAt,
    byUserId: stints.arrivalByUserId,
    comment: stints.arrivalComment,
    telematicsHours: stints.arrivalTelematicsHours,
    telematicsAt: stints.arrivalTelematicsAt,
  },
  departure: {
    hours: stints.departureHours,
    at: stints.departureAt,
    byUserId: stints.departureByUserId,
    comment: stints.departureComment,
    telematicsHours: stints.departureTelematicsHours,
    telematicsAt: stints.departureTelematicsAt,
  },
} as const satisfies Record<JobHoursRole, Record<string, SQLWrapper>>;

/** A Machine Assignment's Job Hours columns, on the table or on an alias of it. */
type StintColumns = { arrivalHours: SQLWrapper; departureHours: SQLWrapper };

/** The on-site Assignment: arrival captured, no departure yet. The partial unique indexes allow one per subject. */
export const stintOnSite = (stint: StintColumns): SQL =>
  sql`${stint.arrivalHours} is not null and ${stint.departureHours} is null`;

const assignmentInState: Record<AssignmentState, (stint: StintColumns) => SQL> = {
  planned: (stint) => sql`${stint.arrivalHours} is null`,
  'on-site': stintOnSite,
  left: (stint) => sql`${stint.departureHours} is not null`,
};

const summaryAssignment = alias(contractingMachineAssignments, 'summary_assignment');

export const stintCount = (state: AssignmentState) => sql<number>`(
  select count(*)::integer
  from contracting.machine_assignment summary_assignment
  where summary_assignment.job_id = ${contractingJobs.id}
    and ${assignmentInState[state](summaryAssignment)}
)`;

/**
 * The Job's stints that need a look against the thresholds as Settings holds them now: the SQL twin of
 * `stintAttentionKinds`.
 */
export const assignmentAttention = sql<number>`(
  select count(*)::integer
  from contracting.machine_assignment summary_assignment
  cross join contracting.settings
  where summary_assignment.job_id = ${contractingJobs.id}
    and (
      (summary_assignment.travel_hours > contracting.settings.travel_flag_threshold_hours
        and summary_assignment.travel_set_at is null)
      or summary_assignment.travel_clamped
      or abs(summary_assignment.arrival_hours - summary_assignment.arrival_telematics_hours)
        > contracting.settings.john_deere_difference_threshold_hours
      or abs(summary_assignment.departure_hours - summary_assignment.departure_telematics_hours)
        > contracting.settings.john_deere_difference_threshold_hours
    )
)`;

export const needsALook = sql<boolean>`(${assignmentAttention} > 0)`;

/** The Machine has an Assignment on the Job, in any state. */
export const hasMachine = (machineId: string) => sql<boolean>`exists (
  select 1
  from contracting.machine_assignment summary_assignment
  where summary_assignment.job_id = ${contractingJobs.id}
    and summary_assignment.machine_id = ${machineId}
)`;

/** Parameter-free, so the queue counts can group by it. */
export const looksFinished = sql<boolean>`(
  ${contractingJobs.status} = 'active'
  and ${stintCount('left')} > 0
  and ${stintCount('on-site')} = 0
)`;

/** SQL twin of domain `formatJobNumber`, so a search for the Job Number finds the Job. */
// lpad truncates a longer value, so the width grows with the code as padStart does.
export const jobNumberSql = (code: SQLWrapper) =>
  sql`${JOB_NUMBER_PREFIX} || lpad(${code}::text, greatest(${JOB_NUMBER_DIGITS}, length(${code}::text)), '0')`;
export const jobNumberText = jobNumberSql(contractingJobs.code);
