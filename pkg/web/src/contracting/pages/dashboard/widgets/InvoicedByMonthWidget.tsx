import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { dashboardTileLinkClassName } from '@/components/common/dashboard/DashboardTile.js';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/components/common/dashboard/dashboard-refresh.js';
import { InvoicedMonthCards } from '@/components/common/dashboard/InvoicedMonthCards.js';
import { useTRPC } from '@/lib/trpc.js';

/** Each month opens every Invoiced Job (there is no month filter); Invoicing lands on its own page. */
export function InvoicedByMonthWidget() {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.contractingJobs.jobs.invoicedByMonth.queryOptions(),
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
  });
  return (
    <InvoicedMonthCards
      months={query.data?.months.map(({ month, total, jobs }) => ({ month, total, count: jobs }))}
      error={query.error}
      noun={{ one: 'Job', many: 'Jobs' }}
      link={(body) => (
        <Link className={dashboardTileLinkClassName} to="/contracting/jobs" search={{ stage: 'invoiced' }}>
          {body}
        </Link>
      )}
    />
  );
}
