import { user } from '@pkg/db';
import {
  contractingBreakdowns,
  contractingCategories,
  contractingFarms,
  contractingImplements,
  contractingJobs,
  contractingMachines,
} from '@pkg/db/contracting';
import { type BreakdownActor, breakdownFirstLine, breakdownReadScope, formatJobNumber } from '@pkg/domain/contracting';
import { BreakdownSummary } from '@pkg/schema/contracting';
import { and, eq, getTableColumns, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '../jobs/job-load.js';
import { BreakdownError } from './breakdown-errors.js';

const reporter = alias(user, 'breakdown_reporter');
const mechanic = alias(user, 'breakdown_mechanic');
const solver = alias(user, 'breakdown_solver');

const noteCount = sql<number>`(
  select count(*)::integer
  from contracting.breakdown_note summary_note
  where summary_note.breakdown_id = ${contractingBreakdowns.id}
)`;

/** Other unsolved Breakdowns on the same Job: the dispatch cross-reference, derived. */
const sameJobOpenCount = sql<number>`(
  select count(*)::integer
  from contracting.breakdown same_job
  where same_job.job_id = ${contractingBreakdowns.jobId}
    and same_job.id <> ${contractingBreakdowns.id}
    and same_job.status in ('open', 'in-progress')
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
  farmName: contractingFarms.name,
  reporterName: reporter.name,
  mechanicName: mechanic.name,
  solvedByName: solver.name,
  noteCount,
  sameJobOpenCount,
};

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
    .leftJoin(contractingJobs, eq(contractingJobs.id, contractingBreakdowns.jobId))
    .leftJoin(contractingFarms, eq(contractingFarms.id, contractingJobs.farmId))
    .innerJoin(reporter, eq(reporter.id, contractingBreakdowns.reportedByUserId))
    .leftJoin(mechanic, eq(mechanic.id, contractingBreakdowns.primaryMechanicUserId))
    .leftJoin(solver, eq(solver.id, contractingBreakdowns.solvedByUserId))
    .$dynamic();
}
export type LoadedBreakdown = Awaited<ReturnType<typeof selectBreakdowns>>[number];

/** The Breakdowns this actor may read: every one, or for a `report` holder only, the ones that are theirs. */
export function breakdownReadableBy(actor: BreakdownActor) {
  const scope = breakdownReadScope(actor);
  if (!scope) throw new BreakdownError('breakdown.forbidden', 'You do not have permission to view Breakdowns.');
  if (scope === 'all') return undefined;
  return or(eq(contractingBreakdowns.reportedByUserId, actor.userId), eq(contractingJobs.foremanUserId, actor.userId));
}

export const breakdownSubjectOf = (row: LoadedBreakdown) => ({
  kind: row.breakdown.machineId ? ('machine' as const) : ('implement' as const),
  id: row.breakdown.machineId ?? row.breakdown.implementId ?? '',
  code: row.machineCode ?? row.implementCode ?? '',
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
    jobId: breakdown.jobId,
    jobNumber: row.jobCode === null ? null : formatJobNumber(row.jobCode),
    jobForemanUserId: row.jobForemanUserId,
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
