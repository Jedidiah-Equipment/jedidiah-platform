import type { ReactNode } from 'react';

/** A dashboard list's first line: how many rows it holds, and the link to the full list. */
export function DashboardListHeading({ count, action }: { count: string; action: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground tabular-nums">{count}</span>
      {action}
    </div>
  );
}
