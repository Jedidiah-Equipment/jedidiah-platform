import type { Db } from '@pkg/db';
import { contractingBreakdowns } from '@pkg/db/contracting';
import { type BreakdownActor, breakdownReadScope, breakdownsByUrgency } from '@pkg/domain/contracting';
import { type BreakdownSummary, type OpenBreakdown, unsolvedBreakdownStatuses } from '@pkg/schema/contracting';
import { and, inArray } from 'drizzle-orm';
import { breakdownReadableBy, selectBreakdowns, toBreakdownSummary } from './breakdown-load.js';

const flag = ({ id, urgency, status, subject, firstLine }: BreakdownSummary): OpenBreakdown => ({
  id,
  urgency,
  status,
  subjectCode: subject.code,
  firstLine,
});

/**
 * The unsolved Breakdowns on some Jobs or some Machines that `actor` may read, by Job or Machine id, each list Code Red
 * first and newest first: what a list row flags. A Job or Machine with none has no entry.
 */
export async function loadOpenBreakdowns({
  db,
  actor,
  on,
  ids,
}: {
  db: Db;
  actor: BreakdownActor;
  on: 'job' | 'machine';
  ids: readonly string[];
}): Promise<Map<string, OpenBreakdown[]>> {
  if (ids.length === 0 || !breakdownReadScope(actor)) return new Map();
  const column = on === 'job' ? contractingBreakdowns.jobId : contractingBreakdowns.machineId;
  const rows = await selectBreakdowns(db).where(
    and(
      inArray(column, [...ids]),
      inArray(contractingBreakdowns.status, [...unsolvedBreakdownStatuses]),
      breakdownReadableBy(actor),
    ),
  );
  const byId = new Map<string, BreakdownSummary[]>();
  for (const row of rows) {
    const id = on === 'job' ? row.breakdown.jobId : row.breakdown.machineId;
    if (id) byId.set(id, [...(byId.get(id) ?? []), toBreakdownSummary(row)]);
  }
  return new Map([...byId].map(([id, summaries]) => [id, breakdownsByUrgency(summaries).map(flag)]));
}
