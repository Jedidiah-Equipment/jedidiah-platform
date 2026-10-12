import { formatNumber } from '@pkg/domain';
import type { JobQueue } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/components/common/dashboard/dashboard-refresh.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardTile, dashboardTileLinkClassName } from './DashboardTile.js';

function useQueueCount(queue: JobQueue) {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.contractingJobs.jobs.queues.queryOptions(),
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
  });
  const count = query.data ? formatNumber(query.data.counts[queue]) : undefined;
  return { count, error: query.error, errorMessage: 'Unable to load Job counts.' };
}

export function LooksFinishedTile() {
  return (
    <DashboardTile
      {...useQueueCount('looks-finished')}
      sublabel="Need sign-off"
      link={(body) => (
        <Link className={dashboardTileLinkClassName} to="/contracting/jobs" search={{ stage: 'looks-finished' }}>
          {body}
        </Link>
      )}
    />
  );
}

export function AwaitingPricingTile() {
  return (
    <DashboardTile
      {...useQueueCount('awaiting-pricing')}
      sublabel="Need pricing"
      link={(body) => (
        <Link className={dashboardTileLinkClassName} to="/contracting/jobs" search={{ stage: 'awaiting-pricing' }}>
          {body}
        </Link>
      )}
    />
  );
}

export function AwaitingInvoiceTile() {
  return (
    <DashboardTile
      {...useQueueCount('awaiting-invoice')}
      sublabel="Need an Invoice Number"
      link={(body) => (
        <Link className={dashboardTileLinkClassName} to="/contracting/invoicing" search={{ stage: 'awaiting-invoice' }}>
          {body}
        </Link>
      )}
    />
  );
}
