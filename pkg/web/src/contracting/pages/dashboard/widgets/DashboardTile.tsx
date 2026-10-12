import type { ReactNode } from 'react';
import { DashboardWidgetError } from '@/components/common/dashboard/DashboardWidgetCard.js';
import { StatCard, StatCardSkeleton } from '@/components/common/StatCard.js';

/** A count tile: the number, what it asks for, and the link to the list it counts. */
export function DashboardTile({
  count,
  error,
  errorMessage,
  sublabel,
  link,
}: {
  count: string | undefined;
  error: unknown;
  errorMessage: string;
  sublabel: string;
  /** Renders the tile body inside the link to the filtered list. */
  link: (body: ReactNode) => ReactNode;
}) {
  if (error) return <DashboardWidgetError error={error} fallbackMessage={errorMessage} />;
  if (count === undefined) return <StatCardSkeleton />;
  return link(<StatCard value={count} sublabel={sublabel} />);
}

export const dashboardTileLinkClassName =
  'flex flex-1 flex-col rounded-md outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring';
