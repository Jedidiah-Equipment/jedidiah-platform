import type { DateOnlyIso, StocktakeOverdueRow, StocktakeScope } from '@pkg/schema';

import { addDateOnlyDays, addDateOnlyMonths, diffDateOnlyDays } from '../formatting/date-only.js';
import { isWorkingDay, type WorkingCalendar } from '../jobs/working-calendar.js';

/**
 * The two standing rhythms and the slack each is given before it counts as late (spec §12).
 *
 * Hard-coded on purpose: v1 has exactly two rhythms with two agreed cadences, and a configurable
 * cadence is deferred. Grace is counted in **working days** because the whole point of grace is to
 * cover the days the shop was actually open — a Friday-due count is not late because the plant
 * closed for the weekend.
 */
export const STOCKTAKE_CADENCE = {
  'raw-material': { every: 'week', graceWorkingDays: 2 },
  stores: { every: 'month', graceWorkingDays: 5 },
} as const satisfies Record<StocktakeScope, { every: 'month' | 'week'; graceWorkingDays: number }>;

/**
 * Whether a rhythm has fallen behind, and by how much.
 *
 * A scope that has **never** closed a session is overdue outright. Spec §12 asks for "no closed
 * session within the cadence plus grace", and no session at all fails that plainly — anchoring the
 * due date on today instead would let a rhythm nobody has ever walked stay silent forever, which is
 * the one case the signal exists for. Its `overdueDays` is zero because there is no date to count
 * from, so the row says *that* it is late without inventing how late.
 */
export function deriveStocktakeOverdue({
  lastClosedOn,
  scope,
  today,
  workingCalendar = {},
}: {
  lastClosedOn: DateOnlyIso | null;
  scope: StocktakeScope;
  today: DateOnlyIso;
  workingCalendar?: WorkingCalendar;
}): StocktakeOverdueRow {
  if (lastClosedOn === null) {
    return { dueBy: today, isOverdue: true, lastClosedOn, overdueDays: 0, scope };
  }

  const cadence = STOCKTAKE_CADENCE[scope];
  const nextDueOn = cadence.every === 'week' ? addDateOnlyDays(lastClosedOn, 7) : addDateOnlyMonths(lastClosedOn, 1);
  const dueBy = addWorkingDays(nextDueOn, cadence.graceWorkingDays, workingCalendar);
  const overdueDays = Math.max(0, diffDateOnlyDays(today, dueBy));

  return { dueBy, isOverdue: overdueDays > 0, lastClosedOn, overdueDays, scope };
}

/** Walks forward over the calendar's working days; a zero grace lands on the due date itself. */
function addWorkingDays(date: DateOnlyIso, workingDays: number, workingCalendar: WorkingCalendar): DateOnlyIso {
  let cursor = date;
  let remaining = workingDays;

  while (remaining > 0) {
    cursor = addDateOnlyDays(cursor, 1);
    if (isWorkingDay(cursor, workingCalendar)) remaining -= 1;
  }

  return cursor;
}
