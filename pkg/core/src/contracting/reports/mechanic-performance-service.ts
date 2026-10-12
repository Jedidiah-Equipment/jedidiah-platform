import type { Db } from '@pkg/db';
import { contractingBreakdowns } from '@pkg/db/contracting';
import { getPlantDateNow, groupBy } from '@pkg/domain';
import {
  averageReportToSolvedDays,
  orderMechanicPerformance,
  reportWindowInstants,
  resolveReportWindow,
  UNASSIGNED_MECHANIC_LABEL,
} from '@pkg/domain/contracting';
import type { DateOnlyIso } from '@pkg/schema';
import {
  MechanicPerformanceReport,
  type MechanicPerformanceRow,
  type ReportWindowInput,
} from '@pkg/schema/contracting';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { namedMechanics } from '../breakdowns/breakdown-load.js';
import { listMechanics } from '../mechanics.js';

/**
 * One row per Mechanic and one Unassigned row, derived on read: Solved and Report-to-Solved over the window's
 * plant-time range, Not solved as it stands today whatever the window.
 */
export async function getMechanicPerformance({
  db,
  input,
  today = getPlantDateNow(),
}: {
  db: Db;
  input: ReportWindowInput;
  today?: DateOnlyIso;
}): Promise<MechanicPerformanceReport> {
  const window = resolveReportWindow(input, today);
  const range = reportWindowInstants(window);
  const [mechanics, everAssigned, solved, notSolved] = await Promise.all([
    listMechanics({ db }),
    // Every count follows the current primary Mechanic, so someone replaced everywhere has nothing to show.
    namedMechanics(db),
    window.days === 0
      ? Promise.resolve([])
      : db
          .select({
            mechanicUserId: contractingBreakdowns.primaryMechanicUserId,
            reportedAt: contractingBreakdowns.reportedAt,
            solvedAt: contractingBreakdowns.solvedAt,
          })
          .from(contractingBreakdowns)
          .where(
            and(
              eq(contractingBreakdowns.status, 'solved'),
              gte(contractingBreakdowns.solvedAt, range.from),
              lt(contractingBreakdowns.solvedAt, range.to),
            ),
          ),
    db
      .select({ mechanicUserId: contractingBreakdowns.primaryMechanicUserId, count: sql<number>`count(*)::integer` })
      .from(contractingBreakdowns)
      .where(inArray(contractingBreakdowns.status, ['open', 'in-progress']))
      .groupBy(contractingBreakdowns.primaryMechanicUserId),
  ]);
  const roster = new Map([...mechanics, ...everAssigned].map((person) => [person.id, person.name]));
  const solvedBy = groupBy(solved, (row) => row.mechanicUserId);
  const notSolvedBy = new Map(notSolved.map((row) => [row.mechanicUserId, row.count]));
  const rowFor = (mechanicUserId: string | null, name: string): MechanicPerformanceRow => {
    const pairs = (solvedBy.get(mechanicUserId) ?? []).flatMap((row) =>
      row.solvedAt ? [{ reportedAt: row.reportedAt.toISOString(), solvedAt: row.solvedAt.toISOString() }] : [],
    );
    return {
      mechanicUserId,
      name,
      solvedCount: pairs.length,
      averageReportToSolvedDays: averageReportToSolvedDays(pairs),
      notSolvedCount: notSolvedBy.get(mechanicUserId) ?? 0,
    };
  };
  const rows = [...[...roster].map(([id, name]) => rowFor(id, name)), rowFor(null, UNASSIGNED_MECHANIC_LABEL)];
  return MechanicPerformanceReport.parse({
    window,
    rows: orderMechanicPerformance(rows),
  });
}
