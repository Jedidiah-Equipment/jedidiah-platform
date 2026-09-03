import type { DateOnlyIso, StocktakeOverdueRow, StocktakeScope, StocktakeSessionStatus } from '@pkg/schema';

import { addDateOnlyDays, addDateOnlyMonths, diffDateOnlyDays } from '../../formatting/date-only.js';
import { type BadgeColorClassNames, statusBadgeColorClassNames } from '../../theme/status-badge.js';
import { addWorkingDays, type WorkingCalendar } from '../jobs/working-calendar.js';

/** A session's status is derived, so every surface asks the same question of the same field. */
export function stocktakeSessionStatusOf(session: { closedAt: string | null }): StocktakeSessionStatus {
  return session.closedAt === null ? 'open' : 'closed';
}

export const stocktakeSessionStatusLabels: Record<StocktakeSessionStatus, string> = {
  closed: 'Closed',
  open: 'Open',
};

/**
 * Tailwind classes split so native surfaces can put the text colour on the Text element, the same shape
 * `purchaseOrderStatusColorClassNames` uses — and for the same reason it gives: a session's status
 * is a fact about where the walk sits in its life, never a call to action, so neither reaches for
 * the brand colour. Closed is grey rather than green because a walk that closed over a long skip
 * list is settled, not successful; the skip list is what carries that judgement.
 */
export const stocktakeSessionStatusColorClassNames: Record<StocktakeSessionStatus, BadgeColorClassNames> = {
  closed: statusBadgeColorClassNames.gray,
  open: statusBadgeColorClassNames.blue,
};

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
