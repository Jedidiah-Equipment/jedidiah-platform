import type { ReactNode } from 'react';

import {
  DashboardList,
  DashboardListItem,
  DashboardListScrollArea,
} from '@/components/common/dashboard/DashboardList.js';
import {
  DashboardWidgetEmpty,
  DashboardWidgetError,
  DashboardWidgetSkeleton,
} from '@/components/common/dashboard/DashboardWidgetCard.js';

/** A dashboard list in each of its states: the count and View all link, then every row, or the None line. */
export function DashboardListBlock<T>({
  rows,
  error,
  errorMessage,
  count,
  viewAll,
  empty,
  rowKey,
  renderRow,
}: {
  rows: readonly T[] | undefined;
  error: unknown;
  errorMessage: string;
  count: (total: number) => string;
  viewAll: ReactNode;
  empty: string;
  rowKey: (row: T) => string;
  renderRow: (row: T) => ReactNode;
}) {
  if (error) return <DashboardWidgetError error={error} fallbackMessage={errorMessage} />;
  if (!rows) return <DashboardWidgetSkeleton />;
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-4 text-sm">
        <span className="text-muted-foreground tabular-nums">{count(rows.length)}</span>
        {viewAll}
      </div>
      <DashboardListScrollArea>
        {rows.length ? (
          <DashboardList className="pr-3">
            {rows.map((row) => (
              <DashboardListItem key={rowKey(row)}>{renderRow(row)}</DashboardListItem>
            ))}
          </DashboardList>
        ) : (
          <DashboardWidgetEmpty>{empty}</DashboardWidgetEmpty>
        )}
      </DashboardListScrollArea>
    </>
  );
}

export const dashboardRowClassName = 'grid min-w-0 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 text-sm';
export const dashboardRowLinkClassName = 'block truncate font-medium text-foreground hover:underline';
