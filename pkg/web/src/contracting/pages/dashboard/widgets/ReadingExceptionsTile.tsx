import { formatNumber } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/contracting/pages/dashboard/dashboard-refresh.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardTile, dashboardTileLinkClassName } from './DashboardTile.js';

export function ReadingExceptionsTile() {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.contractingReadings.listExceptions.queryOptions(),
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
  });
  return (
    <DashboardTile
      count={query.data ? formatNumber(query.data.length) : undefined}
      error={query.error}
      errorMessage="Unable to load reading exceptions."
      sublabel="Need review"
      link={(body) => (
        <Link className={dashboardTileLinkClassName} to="/contracting/readings/exceptions">
          {body}
        </Link>
      )}
    />
  );
}
