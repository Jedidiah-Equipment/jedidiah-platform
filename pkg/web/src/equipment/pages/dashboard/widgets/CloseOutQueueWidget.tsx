import { STALE_CLOSE_OUT_DAYS } from '@pkg/domain/equipment';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { useTRPC } from '@/lib/trpc.js';

import { DashboardWidgetError } from '../DashboardWidgetCard.js';
import { StatCard, StatCardSkeleton } from '../StatCard.js';

export const CloseOutQueueWidget: React.FC = () => {
  const trpc = useTRPC();
  const queueQuery = useQuery(trpc.inventory.closeOutQueue.queryOptions());

  if (queueQuery.error) {
    return <DashboardWidgetError error={queueQuery.error} fallbackMessage="Unable to load the close-out queue." />;
  }

  if (queueQuery.isPending) {
    return <StatCardSkeleton />;
  }

  const items = queueQuery.data.items;
  const staleCount = items.filter((item) => item.isStale).length;

  return (
    <Link className="flex flex-1 hover:underline" to="/equipment/inventory/close-out">
      <StatCard sublabel={describeQueue(items.length, staleCount)} value={items.length} />
    </Link>
  );
};

function describeQueue(count: number, staleCount: number): string {
  if (count === 0) return 'Nothing waiting';
  // Stale is the backstop the queue exists to make loud, so it leads the sublabel when there is any.
  if (staleCount > 0) return `${staleCount} waiting ${STALE_CLOSE_OUT_DAYS} days or more`;

  return count === 1 ? '1 completed Job to close' : `${count} completed Jobs to close`;
}
