import type { ReactNode } from 'react';

import { StatCard, StatCardSkeleton } from '../StatCard.js';
import { DashboardWidgetError } from './DashboardWidgetCard.js';

/** A stat tile: the figure, what it asks for, and the link to the list behind it. */
export function DashboardTile({
  value,
  error,
  errorMessage,
  sublabel,
  link,
}: {
  /** The formatted figure; the tile shows its skeleton until it is in. */
  value: string | undefined;
  error: unknown;
  errorMessage: string;
  sublabel?: string | undefined;
  /** Renders the tile body inside the link to the filtered list; a tile without a list renders the body alone. */
  link?: ((body: ReactNode) => ReactNode) | undefined;
}) {
  if (error) return <DashboardWidgetError error={error} fallbackMessage={errorMessage} />;
  if (value === undefined) return <StatCardSkeleton />;
  const body = <StatCard value={value} sublabel={sublabel} />;
  return link ? link(body) : body;
}

export const dashboardTileLinkClassName =
  'flex flex-1 flex-col rounded-md outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring';
