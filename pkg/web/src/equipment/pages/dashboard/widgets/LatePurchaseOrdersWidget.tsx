import { formatNumber } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';
import { DashboardTile } from '@/components/common/dashboard/DashboardTile.js';
import { useTRPC } from '@/lib/trpc.js';

export const LatePurchaseOrdersWidget: React.FC = () => {
  const trpc = useTRPC();
  const lateQuery = useQuery(trpc.purchaseOrders.late.queryOptions());
  const items = lateQuery.data?.items;

  return (
    <DashboardTile
      value={items ? formatNumber(items.length) : undefined}
      error={lateQuery.error}
      errorMessage="Unable to load late Purchase Orders."
      // The worst one leads: an order three weeks overdue is a different conversation from one a day late.
      sublabel={
        items
          ? describeLate(
              items.length,
              items.reduce((longest, item) => Math.max(longest, item.daysLate), 0),
            )
          : undefined
      }
      link={(body) => (
        <Link className="flex flex-1 hover:underline" to="/equipment/inventory/buy-list">
          {body}
        </Link>
      )}
    />
  );
};

function describeLate(count: number, worstDaysLate: number): string {
  if (count === 0) return 'Nothing overdue';

  return worstDaysLate === 1 ? 'Worst is 1 day late' : `Worst is ${worstDaysLate} days late`;
}
