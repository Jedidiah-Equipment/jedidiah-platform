import type { ReactNode } from 'react';

import { DashboardList, DashboardListItem, DashboardListScrollArea } from './DashboardList.js';
import { DashboardWidgetEmpty, DashboardWidgetError, DashboardWidgetSkeleton } from './DashboardWidgetCard.js';

/** A dashboard list in each of its states: the count and View all link, then every row, or the None line. */
export function DashboardListBlock<T>({
  rows,
  error,
  errorMessage,
  count,
  viewAll,
  empty,
  skeleton,
  rowKey,
  renderRow,
}: {
  rows: readonly T[] | undefined;
  error: unknown;
  errorMessage: string;
  /** The line above the rows: how many there are, and the link to every one. A list without it starts at its rows. */
  count?: ((total: number) => string) | undefined;
  viewAll?: ReactNode;
  empty: string;
  /** What stands in for the rows while they load; the shared widget skeleton by default. */
  skeleton?: ReactNode;
  rowKey: (row: T) => string;
  renderRow: (row: T) => ReactNode;
}) {
  // Every state keeps the list's height, so a card never shrinks while loading or on an error and grows after.
  if (error)
    return (
      <DashboardListScrollArea>
        <DashboardWidgetError error={error} fallbackMessage={errorMessage} />
      </DashboardListScrollArea>
    );
  if (!rows) return <DashboardListScrollArea>{skeleton ?? <DashboardWidgetSkeleton />}</DashboardListScrollArea>;
  return (
    <>
      {count || viewAll ? (
        <div className="mb-3 flex items-center justify-between gap-4 text-sm">
          {count ? <span className="text-muted-foreground tabular-nums">{count(rows.length)}</span> : null}
          {viewAll}
        </div>
      ) : null}
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
