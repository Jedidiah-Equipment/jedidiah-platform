import { formatNumber } from '@pkg/domain';
import { breakdownStatusesCount, breakdownStatusLabels } from '@pkg/domain/contracting';
import {
  type BreakdownStatus,
  type BreakdownStatusCounts,
  breakdownStatuses,
  unsolvedBreakdownStatuses,
} from '@pkg/schema/contracting';
import type { ListControlOption } from '@/components/ListControls';

/** Every unsolved status, one status, or every status, as web's Workshop filters offer them. */
export type StatusFilter = 'unsolved' | 'all' | BreakdownStatus;

export const isStatusFilter = (value: unknown): value is StatusFilter =>
  value === 'unsolved' || value === 'all' || breakdownStatuses.includes(value as BreakdownStatus);

/** The statuses a filter lists. */
export const statusesFor = (filter: StatusFilter): BreakdownStatus[] =>
  filter === 'unsolved' ? [...unsolvedBreakdownStatuses] : filter === 'all' ? [...breakdownStatuses] : [filter];

/** The status filter's options with their counts, when this person may count every Breakdown. */
export function statusOptions(counts: BreakdownStatusCounts | undefined): ListControlOption<StatusFilter>[] {
  const count = (statuses: readonly BreakdownStatus[]) =>
    counts ? ` (${formatNumber(breakdownStatusesCount(counts, statuses))})` : '';
  return [
    {
      label: `${breakdownStatusLabels.open} or ${breakdownStatusLabels['in-progress']}${count(unsolvedBreakdownStatuses)}`,
      value: 'unsolved',
    },
    ...breakdownStatuses.map((status) => ({
      label: `${breakdownStatusLabels[status]}${count([status])}`,
      value: status,
    })),
    { label: `All${count(breakdownStatuses)}`, value: 'all' },
  ];
}
