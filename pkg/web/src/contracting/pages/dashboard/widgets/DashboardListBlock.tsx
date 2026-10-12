import type { ReactNode } from 'react';

import {
  DashboardList,
  DashboardListItem,
  DashboardListScrollArea,
} from '@/components/common/dashboard/DashboardList.js';
import { DashboardListHeading } from '@/components/common/dashboard/DashboardListHeading.js';
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
      <DashboardListHeading count={count(rows.length)} action={viewAll} />
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

export const dashboardRowLinkClassName = 'block truncate font-medium text-foreground hover:underline';
