import type { BreakdownActionName, BreakdownDetail, BreakdownStatus } from '@pkg/schema/contracting';
import { breakdownStatuses, unsolvedBreakdownStatuses } from '@pkg/schema/contracting';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { readMultiSelectFilter } from '@/components/data-table/column-filter-values.js';

/**
 * The Breakdown page's reading of the Breakdown Actions the server served, as `jobSheet` reads Job Actions:
 * `action(name)` is null when the person lacks the permission (render nothing), otherwise disabled with the
 * server's refusal while the Breakdown refuses it.
 */
export function breakdownSheet(breakdown: Pick<BreakdownDetail, 'actions'>) {
  const verdict = (action: BreakdownActionName) => breakdown.actions[action];
  const can = (action: BreakdownActionName) => verdict(action).allowed;
  const holds = (action: BreakdownActionName) => {
    const judged = verdict(action);
    return judged.allowed || judged.reason !== 'no-permission';
  };
  const refusal = (action: BreakdownActionName) => {
    const judged = verdict(action);
    return judged.allowed ? undefined : judged.message;
  };
  return {
    can,
    holds,
    refusal,
    action: (name: BreakdownActionName) => (holds(name) ? { disabled: !can(name), title: refusal(name) } : null),
  };
}

export type BreakdownSheet = ReturnType<typeof breakdownSheet>;

export const STATUS_COLUMN_ID = 'status';

/** What the queue asks the server for: the picked statuses, or every unsolved one when none is picked. */
export function listedStatuses(columnFilters: ColumnFiltersState): BreakdownStatus[] {
  const picked = readMultiSelectFilter(columnFilters, STATUS_COLUMN_ID);
  const statuses = breakdownStatuses.filter((status) => picked.includes(status));
  return statuses.length ? statuses : [...unsolvedBreakdownStatuses];
}
