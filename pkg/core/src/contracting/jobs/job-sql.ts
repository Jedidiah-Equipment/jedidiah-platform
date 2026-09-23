import { contractingJobs } from '@pkg/db/contracting';
import { GAP_FLAG_THRESHOLD_HOURS } from '@pkg/domain/contracting';
import { type AssignmentState, aiFlaggedVerifications } from '@pkg/schema/contracting';
import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';

/**
 * The Job read model's derived facts, in SQL for the queues. Each mirrors a domain rule the detail read
 * computes in TypeScript (`assignmentState`, `deriveStintHours`, `looksFinished`, reading attention), so a
 * rule changes here and there together.
 */

/** The value of the Machine's last departure before an arrival: where the stint's Hour Gap starts. */
export const previousDepartureValue = (machineId: SQLWrapper, arrivalSequence: SQLWrapper) => sql`(
  select previous.value
  from contracting.hour_reading previous
  where previous.machine_id = ${machineId}
    and previous.role = 'departure'
    and previous.sequence < ${arrivalSequence}
  order by previous.sequence desc
  limit 1
)`;

const assignmentInState: Record<AssignmentState, SQL> = {
  planned: sql`summary_assignment.arrival_reading_id is null`,
  'on-site': sql`summary_assignment.arrival_reading_id is not null and summary_assignment.departure_reading_id is null`,
  left: sql`summary_assignment.departure_reading_id is not null`,
};

export const stintCount = (state: AssignmentState) => sql<number>`(
  select count(*)::integer
  from contracting.machine_assignment summary_assignment
  where summary_assignment.job_id = ${contractingJobs.id}
    and ${assignmentInState[state]}
)`;

export const openGapFlags = sql<number>`(
  select count(*)::integer
  from contracting.machine_assignment summary_assignment
  join contracting.hour_reading summary_arrival
    on summary_arrival.id = summary_assignment.arrival_reading_id
  where summary_assignment.job_id = ${contractingJobs.id}
    and summary_assignment.gap_resolved_at is null
    and summary_arrival.value - ${previousDepartureValue(sql`summary_assignment.machine_id`, sql`summary_arrival.sequence`)} > ${GAP_FLAG_THRESHOLD_HOURS}
)`;

export const readingsNeedingALook = sql<number>`(
  select count(*)::integer
  from contracting.machine_assignment summary_assignment
  join contracting.hour_reading summary_reading
    on summary_reading.id = summary_assignment.arrival_reading_id
    or summary_reading.id = summary_assignment.departure_reading_id
  where summary_assignment.job_id = ${contractingJobs.id}
    and (
      summary_reading.disputed
      or (
        summary_reading.evidence_reviewed_at is null
        and summary_reading.ai_verification in (${sql.join(
          aiFlaggedVerifications.map((verification) => sql`${verification}`),
          sql`, `,
        )})
      )
    )
)`;

/** Parameter-free, so the queue counts can group by it. */
export const looksFinished = sql<boolean>`(
  ${contractingJobs.status} = 'active'
  and ${stintCount('left')} > 0
  and ${stintCount('on-site')} = 0
)`;
