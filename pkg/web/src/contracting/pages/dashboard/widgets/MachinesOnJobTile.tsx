import { formatNumber } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { DashboardTile, dashboardTileLinkClassName } from '@/components/common/dashboard/DashboardTile.js';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/contracting/lib/dashboard-refresh.js';
import { busyFilterMatches } from '@/contracting/pages/fleet/types.js';
import { useTRPC } from '@/lib/trpc.js';

export function MachinesOnJobTile() {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.contractingFleet.machines.list.queryOptions({ status: 'active' }),
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
    select: (machines) => machines.filter((machine) => busyFilterMatches(machine, 'on-job')).length,
  });
  return (
    <DashboardTile
      value={query.data === undefined ? undefined : formatNumber(query.data)}
      error={query.error}
      errorMessage="Unable to load the fleet."
      sublabel="On site now"
      link={(body) => (
        <Link className={dashboardTileLinkClassName} to="/contracting/fleet" search={{ busy: 'on-job' }}>
          {body}
        </Link>
      )}
    />
  );
}
