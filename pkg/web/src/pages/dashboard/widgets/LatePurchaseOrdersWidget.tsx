import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { useTRPC } from '@/lib/trpc.js';

import { DashboardWidgetError } from '../DashboardWidgetCard.js';
import { StatCard, StatCardSkeleton } from '../StatCard.js';

export const LatePurchaseOrdersWidget: React.FC = () => {
  const trpc = useTRPC();
  const lateQuery = useQuery(trpc.purchaseOrders.late.queryOptions());

  if (lateQuery.error) {
    return <DashboardWidgetError error={lateQuery.error} fallbackMessage="Unable to load late Purchase Orders." />;
  }

  if (lateQuery.isPending) {
    return <StatCardSkeleton />;
  }

  const items = lateQuery.data.items;
  // The worst one leads: an order three weeks overdue is a different conversation from one a day late.
  const worst = items.reduce((longest, item) => Math.max(longest, item.daysLate), 0);

  return (
    <Link className="flex flex-1 hover:underline" to="/equipment/inventory/buy-list">
      <StatCard sublabel={describeLate(items.length, worst)} value={items.length} />
    </Link>
  );
};

function describeLate(count: number, worstDaysLate: number): string {
  if (count === 0) return 'Nothing overdue';

  return worstDaysLate === 1 ? 'Worst is 1 day late' : `Worst is ${worstDaysLate} days late`;
}
