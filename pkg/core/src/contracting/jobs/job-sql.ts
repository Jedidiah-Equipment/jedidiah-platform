import { contractingHourReadings, contractingJobs } from '@pkg/db/contracting';
import { GAP_FLAG_THRESHOLD_HOURS, JOB_NUMBER_DIGITS, JOB_NUMBER_PREFIX } from '@pkg/domain/contracting';
import type { AssignmentState, NeedsALookLevel } from '@pkg/schema/contracting';
import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { readingNeedsALookLevelSql } from '../readings/reading-sql.js';

/**
 * The Job read model's derived facts, in SQL for the queues. Each mirrors a domain rule the detail read
 * computes in TypeScript (`assignmentState`, `deriveStintHours`, `looksFinished`, `readingNeedsALook`), so a
 * rule changes here and there together.
 */

/** The Machine's last departure before an arrival, as one column of it: where the stint's Hour Gap starts. */
const previousDeparture = (column: 'id' | 'value', machineId: SQLWrapper, arrivalSequence: SQLWrapper) => sql`(
  select ${sql.raw(`previous.${column}`)}
  from contracting.hour_reading previous
  where previous.machine_id = ${machineId}
    and previous.role = 'departure'
    and previous.sequence < ${arrivalSequence}
  order by previous.sequence desc
  limit 1
)`;

export const previousDepartureValue = (machineId: SQLWrapper, arrivalSequence: SQLWrapper) =>
  previousDeparture('value', machineId, arrivalSequence);

export const previousDepartureId = (machineId: SQLWrapper, arrivalSequence: SQLWrapper) =>
  previousDeparture('id', machineId, arrivalSequence);

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

const summaryReading = alias(contractingHourReadings, 'summary_reading');

/** The Job's arrival and departure readings whose loudest level needing a look is `level`. */
export const readingsNeedingALookAt = (level: NeedsALookLevel) => sql<number>`(
  select count(*)::integer
  from contracting.machine_assignment summary_assignment
  join contracting.hour_reading summary_reading
    on summary_reading.id = summary_assignment.arrival_reading_id
    or summary_reading.id = summary_assignment.departure_reading_id
  where summary_assignment.job_id = ${contractingJobs.id}
    and ${readingNeedsALookLevelSql(summaryReading)} = ${level}
)`;

/** Parameter-free, so the queue counts can group by it. */
export const looksFinished = sql<boolean>`(
  ${contractingJobs.status} = 'active'
  and ${stintCount('left')} > 0
  and ${stintCount('on-site')} = 0
)`;

/** SQL twin of domain `formatJobNumber`, so a search for the Job Number finds the Job. */
// lpad truncates a longer value, so the width grows with the code as padStart does.
export const jobNumberText = sql`${JOB_NUMBER_PREFIX} || lpad(${contractingJobs.code}::text, greatest(${JOB_NUMBER_DIGITS}, length(${contractingJobs.code}::text)), '0')`;
