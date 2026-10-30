import { formatNumber } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { DashboardTile, dashboardTileLinkClassName } from '@/components/common/dashboard/DashboardTile.js';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/contracting/lib/dashboard-refresh.js';
import { useTRPC } from '@/lib/trpc.js';

export function DisputesTile() {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.contractingReadings.listDisputes.queryOptions(),
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
  });
  return (
    <DashboardTile
      value={query.data ? formatNumber(query.data.length) : undefined}
      error={query.error}
      errorMessage="Unable to load Disputes."
      sublabel="To resolve"
      link={(body) => (
        <Link className={dashboardTileLinkClassName} to="/contracting/disputes">
          {body}
        </Link>
      )}
    />
  );
}
