import { BUY_LIST_REASONS, type BuyListReason } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { useTRPC } from '@/lib/trpc.js';

import { DashboardWidgetError } from '../DashboardWidgetCard.js';
import { StatCard, StatCardSkeleton } from '../StatCard.js';

/**
 * The three stock signals the buy list carries, split into the tiles their audiences read (spec
 * §12). One query behind all of them: they are facets of the same list, and asking three times
 * would let the dashboard contradict itself between tiles.
 */
const BuyListReasonWidget: React.FC<{
  emptyLabel: string;
  reason: BuyListReason;
  singular: string;
  plural: string;
}> = ({ emptyLabel, plural, reason, singular }) => {
  // Each tile is one facet of BUY_LIST_REASONS; the label there is what the buy list's badge says.
  const trpc = useTRPC();
  const buyListQuery = useQuery(trpc.inventory.buyList.queryOptions());

  if (buyListQuery.error) {
    return <DashboardWidgetError error={buyListQuery.error} fallbackMessage="Unable to load the buy list." />;
  }

  if (buyListQuery.isPending) {
    return <StatCardSkeleton />;
  }

  const count = buyListQuery.data.items.filter((item) => item.reasons.includes(reason)).length;

  return (
    <Link className="flex flex-1 hover:underline" to="/inventory/buy-list">
      <StatCard sublabel={count === 0 ? emptyLabel : count === 1 ? singular : `${count} ${plural}`} value={count} />
    </Link>
  );
};

export const OutOfStockWidget: React.FC = () => (
  <BuyListReasonWidget
    emptyLabel="Nothing has run out"
    plural="Parts off the shelf"
    reason="out-of-stock"
    singular="1 Part off the shelf"
  />
);

export const BelowMinimumStockWidget: React.FC = () => (
  <BuyListReasonWidget
    emptyLabel="Every Part is above its minimum"
    plural="Parts under their minimum"
    reason="below-minimum"
    singular="1 Part under its minimum"
  />
);

export const ShortForJobsWidget: React.FC = () => (
  <BuyListReasonWidget
    emptyLabel="Every Job is covered"
    plural="Parts short for Jobs"
    reason="negative-free"
    singular="1 Part short for Jobs"
  />
);
