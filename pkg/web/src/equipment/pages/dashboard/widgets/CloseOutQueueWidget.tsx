import { formatNumber } from '@pkg/domain';
import { STALE_CLOSE_OUT_DAYS } from '@pkg/domain/equipment';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';
import { DashboardTile } from '@/components/common/dashboard/DashboardTile.js';
import { useTRPC } from '@/lib/trpc.js';

export const CloseOutQueueWidget: React.FC = () => {
  const trpc = useTRPC();
  const queueQuery = useQuery(trpc.inventory.closeOutQueue.queryOptions());
  const items = queueQuery.data?.items;

  return (
    <DashboardTile
      value={items ? formatNumber(items.length) : undefined}
      error={queueQuery.error}
      errorMessage="Unable to load the close-out queue."
      sublabel={items ? describeQueue(items.length, items.filter((item) => item.isStale).length) : undefined}
      link={(body) => (
        <Link className="flex flex-1 hover:underline" to="/equipment/inventory/close-out">
          {body}
        </Link>
      )}
    />
  );
};

function describeQueue(count: number, staleCount: number): string {
  if (count === 0) return 'Nothing waiting';
  // Stale is the backstop the queue exists to make loud, so it leads the sublabel when there is any.
  if (staleCount > 0) return `${staleCount} waiting ${STALE_CLOSE_OUT_DAYS} days or more`;

  return count === 1 ? '1 completed Job to close' : `${count} completed Jobs to close`;
}
