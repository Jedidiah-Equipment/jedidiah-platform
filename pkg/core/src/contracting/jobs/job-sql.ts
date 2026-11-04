import { contractingJobs, contractingMachineAssignments } from '@pkg/db/contracting';
import { JOB_NUMBER_DIGITS, JOB_NUMBER_PREFIX } from '@pkg/domain/contracting';
import type { AssignmentState, JobHoursRole } from '@pkg/schema/contracting';
import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

/**
 * The Job read model's derived facts, in SQL for the queues. Each mirrors a domain rule the detail read
 * computes in TypeScript (`assignmentState`, `looksFinished`), so a rule changes here and there together.
 * Assignment Attention's twin lives with the rest of it, in `assignment-attention.ts`.
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

/** The on-site Assignment: arrival captured, no departure yet. A Machine or Implement may have several (ADR 0031). */
export const stintOnSite = (stint: StintColumns): SQL =>
  sql`${stint.arrivalHours} is not null and ${stint.departureHours} is null`;

/** The order every reader naming one on-site Assignment takes: the latest arrival capture first. */
export const latestArrivalFirst = (stint: { arrivalAt: SQLWrapper; id: SQLWrapper }): SQL =>
  sql`${stint.arrivalAt} desc, ${stint.id} desc`;

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

const hasAssignmentWhere = (condition: SQL) => sql<boolean>`exists (
  select 1
  from contracting.machine_assignment summary_assignment
  where summary_assignment.job_id = ${contractingJobs.id}
    and ${condition}
)`;

/** The Machine has an Assignment on the Job, in any state. */
export const hasMachine = (machineId: string) => hasAssignmentWhere(sql`${summaryAssignment.machineId} = ${machineId}`);

/** The Assignment's Driver, never the Machine's default, went on the Job, in any state. */
export const hasDriver = (driverUserId: string) =>
  hasAssignmentWhere(sql`${summaryAssignment.driverUserId} = ${driverUserId}`);

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
