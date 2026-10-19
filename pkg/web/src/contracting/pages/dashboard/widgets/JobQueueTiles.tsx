import { formatNumber } from '@pkg/domain';
import type { JobQueue } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { DashboardTile, dashboardTileLinkClassName } from '@/components/common/dashboard/DashboardTile.js';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/contracting/lib/dashboard-refresh.js';
import { useTRPC } from '@/lib/trpc.js';

function useQueueCount(queue: JobQueue) {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.contractingJobs.jobs.queues.queryOptions(),
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
  });
  const value = query.data ? formatNumber(query.data.counts[queue]) : undefined;
  return { value, error: query.error, errorMessage: 'Unable to load Job counts.' };
}

function JobsStageTile({ stage, sublabel }: { stage: 'looks-finished' | 'awaiting-pricing'; sublabel: string }) {
  return (
    <DashboardTile
      {...useQueueCount(stage)}
      sublabel={sublabel}
      link={(body) => (
        <Link className={dashboardTileLinkClassName} to="/contracting/jobs" search={{ stage }}>
          {body}
        </Link>
      )}
    />
  );
}

export const LooksFinishedTile = () => <JobsStageTile stage="looks-finished" sublabel="Need sign-off" />;

export const AwaitingPricingTile = () => <JobsStageTile stage="awaiting-pricing" sublabel="Need pricing" />;

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
