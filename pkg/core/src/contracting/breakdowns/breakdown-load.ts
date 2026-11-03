import { user } from '@pkg/db';
import {
  contractingBreakdowns,
  contractingCategories,
  contractingFarms,
  contractingImplements,
  contractingJobs,
  contractingMachineAssignments,
  contractingMachines,
} from '@pkg/db/contracting';
import { type BreakdownActor, breakdownFirstLine, breakdownReadScope, formatJobNumber } from '@pkg/domain/contracting';
import { type BreakdownSubjectRef, BreakdownSummary, unsolvedBreakdownStatuses } from '@pkg/schema/contracting';
import { and, asc, eq, getTableColumns, inArray, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '../jobs/job-load.js';
import { jobNumberText, latestArrivalFirst, stintOnSite } from '../jobs/job-sql.js';
import { BreakdownError } from './breakdown-errors.js';

/** A Breakdown's columns the Job rule reads, on the table or on an alias of it. */
type BreakdownColumns = { jobId: SQLWrapper; machineId: SQLWrapper; implementId: SQLWrapper; status: SQLWrapper };

const unsolvedOf = (breakdown: Pick<BreakdownColumns, 'status'>) =>
  inArray(breakdown.status, [...unsolvedBreakdownStatuses]);

/** Not yet Fixed: the Breakdowns still on the queue, still a Mechanic's and still a Job's open work. */
export const unsolvedBreakdown = unsolvedOf(contractingBreakdowns);

const breakdownStint = alias(contractingMachineAssignments, 'breakdown_stint');

/** While a Breakdown is not yet Fixed, the Job its Machine or Implement is on site on now; null in the yard or once Fixed. */
const onSiteJobIdOf = (breakdown: BreakdownColumns) => sql<string | null>`(
  select ${breakdownStint.jobId}
  from contracting.machine_assignment breakdown_stint
  where ${unsolvedOf(breakdown)}
    and (${breakdownStint.machineId} = ${breakdown.machineId}
      or ${breakdownStint.implementId} = ${breakdown.implementId})
    and ${stintOnSite(breakdownStint)}
  order by ${latestArrivalFirst(breakdownStint)}
  limit 1
)`;

/**
 * The one rule for which Jobs a Breakdown is on: the Job it was filed on, and while it is not yet Fixed, the Job its
 * Machine or Implement is on site on now. Every Job read of Breakdowns is built from this pair, so a Job flags exactly
 * what its fleet's rows flag.
 */
const jobsOf = (breakdown: BreakdownColumns) => [breakdown.jobId, onSiteJobIdOf(breakdown)] as const;
const onJobOf = (breakdown: BreakdownColumns, job: SQLWrapper) => or(...jobsOf(breakdown).map((id) => eq(id, job)));

const breakdownOnSiteJobId = onSiteJobIdOf(contractingBreakdowns);

/** The Breakdowns on this Job, by the one rule. */
export const breakdownOnJob = (job: SQLWrapper) => onJobOf(contractingBreakdowns, job);

/** The Breakdowns on any of these Jobs, by the one rule. */
export const breakdownOnJobs = (jobIds: readonly string[]) =>
  or(...jobsOf(contractingBreakdowns).map((id) => inArray(id, [...jobIds])));

const farmJob = alias(contractingJobs, 'farm_job');

/** The Breakdowns on a Job at any of these Farms, by the one rule. */
export const breakdownOnFarms = (farmIds: readonly string[]) => sql`exists (
  select 1
  from contracting.job farm_job
  where ${inArray(farmJob.farmId, [...farmIds])} and ${breakdownOnJob(farmJob.id)}
)`;

/** The Jobs one loaded Breakdown is on, by the one rule. */
export const jobsOfBreakdown = ({ breakdown, onSiteJobId }: LoadedBreakdown): string[] => [
  ...new Set([breakdown.jobId, onSiteJobId].filter((id): id is string => id !== null)),
];

/**
 * The Job a Breakdown's summary names and whose Foreman it is: the one it was filed on, or for a yard report not yet
 * Fixed, where it is now.
 */
export const breakdownJobId = sql<string | null>`coalesce(${contractingBreakdowns.jobId}, ${breakdownOnSiteJobId})`;

export const breakdownReporter = alias(user, 'breakdown_reporter');
const breakdownMechanic = alias(user, 'breakdown_mechanic');
const solver = alias(user, 'breakdown_solver');

/**
 * Everyone named as primary Mechanic on a Breakdown that matches `where`, by name. A role change never drops them:
 * the Workshop's Mechanic filter and the Mechanics report both keep a name for anyone still on a Breakdown.
 */
export const namedMechanics = (db: DbOrTx, where?: SQL) =>
  db
    .selectDistinct({ id: breakdownMechanic.id, name: breakdownMechanic.name })
    .from(contractingBreakdowns)
    .innerJoin(breakdownMechanic, eq(breakdownMechanic.id, contractingBreakdowns.primaryMechanicUserId))
    .where(where)
    .orderBy(asc(breakdownMechanic.name));

const noteCount = sql<number>`(
  select count(*)::integer
  from contracting.breakdown_note summary_note
  where summary_note.breakdown_id = ${contractingBreakdowns.id}
)`;

const firstNoteText = sql<string | null>`(
  select first_note.text
  from contracting.breakdown_note first_note
  where first_note.breakdown_id = ${contractingBreakdowns.id}
  order by first_note.created_at, first_note.id
  limit 1
)`;

const sameJob = alias(contractingBreakdowns, 'same_job');
const sharedJob = alias(contractingJobs, 'shared_job');

/** Other unsolved Breakdowns on a Job this one is on, by the one rule: the dispatch cross-reference, derived. */
const sameJobOpenCount = sql<number>`(
  select count(*)::integer
  from contracting.breakdown same_job
  where ${sameJob.id} <> ${contractingBreakdowns.id}
    and ${unsolvedOf(sameJob)}
    and exists (
      select 1
      from contracting.job shared_job
      where ${breakdownOnJob(sharedJob.id)} and ${onJobOf(sameJob, sharedJob.id)}
    )
)`;

/** A Breakdown row with everything its summary shows. */
const breakdownHeader = {
  breakdown: getTableColumns(contractingBreakdowns),
  machineCode: contractingMachines.code,
  implementCode: contractingImplements.code,
  categoryName: contractingCategories.name,
  categoryIcon: contractingCategories.icon,
  categoryColour: contractingCategories.colour,
  jobCode: contractingJobs.code,
  jobForemanUserId: contractingJobs.foremanUserId,
  farmId: contractingFarms.id,
  farmName: contractingFarms.name,
  reporterName: breakdownReporter.name,
  mechanicName: breakdownMechanic.name,
  solvedByName: solver.name,
  noteCount,
  firstNoteText,
  sameJobOpenCount,
  onSiteJobId: breakdownOnSiteJobId,
};

/** What the Workshop search box looks in: the subject, the Job and its Farm, the people, and the report. */
export const breakdownSearchColumns = [
  sql`${contractingMachines.code}`,
  sql`${contractingImplements.code}`,
  jobNumberText,
  sql`${contractingFarms.name}`,
  sql`${breakdownReporter.name}`,
  sql`${breakdownMechanic.name}`,
  sql`${contractingBreakdowns.description}`,
];

/** Breakdowns joined to everything a summary names; the caller adds its filter, order and paging. */
export function selectBreakdowns(db: DbOrTx) {
  return db
    .select({ ...breakdownHeader, total: sql<number>`count(*) over ()`.mapWith(Number) })
    .from(contractingBreakdowns)
    .leftJoin(contractingMachines, eq(contractingMachines.id, contractingBreakdowns.machineId))
    .leftJoin(contractingImplements, eq(contractingImplements.id, contractingBreakdowns.implementId))
    .innerJoin(
      contractingCategories,
      or(
        eq(contractingCategories.id, contractingMachines.categoryId),
        eq(contractingCategories.id, contractingImplements.categoryId),
      ),
    )
    .leftJoin(contractingJobs, eq(contractingJobs.id, breakdownJobId))
    .leftJoin(contractingFarms, eq(contractingFarms.id, contractingJobs.farmId))
    .innerJoin(breakdownReporter, eq(breakdownReporter.id, contractingBreakdowns.reportedByUserId))
    .leftJoin(breakdownMechanic, eq(breakdownMechanic.id, contractingBreakdowns.primaryMechanicUserId))
    .leftJoin(solver, eq(solver.id, contractingBreakdowns.solvedByUserId))
    .$dynamic();
}
export type LoadedBreakdown = Awaited<ReturnType<typeof selectBreakdowns>>[number];

/**
 * The Breakdowns this actor may read: every one, or for a `report` holder only, the ones that are theirs.
 * Self-contained, so a count or a lock-select needs no Job join to use it.
 */
export function breakdownReadableBy(actor: BreakdownActor) {
  const scope = breakdownReadScope(actor);
  if (!scope) throw new BreakdownError('breakdown.forbidden', 'You do not have permission to view Breakdowns.');
  if (scope === 'all') return undefined;
  return or(
    eq(contractingBreakdowns.reportedByUserId, actor.userId),
    sql`exists (
      select 1
      from contracting.job foreman_job
      where foreman_job.id = ${breakdownJobId}
        and foreman_job.foreman_user_id = ${actor.userId}
    )`,
  );
}

/** The one subject a Breakdown row names; the table's XOR check makes any other shape a corrupt row. */
export function breakdownSubjectRef(row: {
  machineId: string | null;
  implementId: string | null;
}): BreakdownSubjectRef {
  if (row.machineId !== null && row.implementId === null) return { kind: 'machine', id: row.machineId };
  if (row.implementId !== null && row.machineId === null) return { kind: 'implement', id: row.implementId };
  throw new Error('Breakdown row names neither one Machine nor one Implement');
}

export const breakdownSubjectOf = (row: LoadedBreakdown) => ({
  ...breakdownSubjectRef(row.breakdown),
  code: (row.breakdown.machineId ? row.machineCode : row.implementCode) ?? '',
  categoryName: row.categoryName,
  categoryIcon: row.categoryIcon,
  categoryColour: row.categoryColour,
});

/** The verdict subject: the least of a Breakdown that Breakdown Actions read. */
export const breakdownActionSubject = (row: LoadedBreakdown) => ({
  status: row.breakdown.status,
  reportedByUserId: row.breakdown.reportedByUserId,
  jobForemanUserId: row.jobForemanUserId,
});

export function toBreakdownSummary(row: LoadedBreakdown): BreakdownSummary {
  const { breakdown } = row;
  return BreakdownSummary.parse({
    id: breakdown.id,
    subject: breakdownSubjectOf(row),
    jobId: breakdown.jobId ?? row.onSiteJobId,
    jobNumber: row.jobCode === null ? null : formatJobNumber(row.jobCode),
    jobForemanUserId: row.jobForemanUserId,
    farmId: row.farmId,
    farmName: row.farmName,
    urgency: breakdown.urgency,
    status: breakdown.status,
    reportedAt: breakdown.reportedAt.toISOString(),
    reportedByUserId: breakdown.reportedByUserId,
    reporterName: row.reporterName,
    primaryMechanicUserId: breakdown.primaryMechanicUserId,
    mechanicName: row.mechanicName,
    firstLine: breakdownFirstLine(breakdown.description),
    photoCount: breakdown.photos.length,
    noteCount: row.noteCount,
    firstNote: row.firstNoteText === null ? null : breakdownFirstLine(row.firstNoteText),
    startedAt: breakdown.startedAt?.toISOString() ?? null,
    solvedAt: breakdown.solvedAt?.toISOString() ?? null,
    sameJobOpenCount: row.sameJobOpenCount,
  });
}

/** One readable Breakdown, or undefined when it does not exist or the actor may not read it. */
export async function loadReadableBreakdown(db: DbOrTx, actor: BreakdownActor, id: string) {
  const [row] = await selectBreakdowns(db)
    .where(and(eq(contractingBreakdowns.id, id), breakdownReadableBy(actor)))
    .limit(1);
  return row;
}
