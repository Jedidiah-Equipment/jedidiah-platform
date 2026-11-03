import { countPhrase, formatCurrency, formatDate } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { dashboardTileLinkClassName } from '@/components/common/dashboard/DashboardTile.js';
import { DashboardWidgetError } from '@/components/common/dashboard/DashboardWidgetCard.js';
import { StatCard, StatCardSkeleton } from '@/components/common/StatCard.js';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/contracting/lib/dashboard-refresh.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

const monthsShown = 4;
const gridClassName = 'grid grid-cols-2 gap-4 xl:grid-cols-4';

export function InvoicedByMonthWidget() {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.contractingJobs.jobs.invoicedByMonth.queryOptions(),
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
  });
  const readsAllJobs = useCan('contracting_job:read').can;
  if (query.error)
    return <DashboardWidgetError error={query.error} fallbackMessage="Unable to load invoiced totals." />;
  if (!query.data)
    return (
      <div className={gridClassName}>
        {Array.from({ length: monthsShown }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders with no identity of their own.
          <StatCardSkeleton key={index} />
        ))}
      </div>
    );
  return (
    <div className={gridClassName}>
      {query.data.months.map(({ month, total, jobs }, index) => (
        <InvoicedJobsLink key={month} readsAllJobs={readsAllJobs}>
          <StatCard
            label={index === 0 ? `${formatDate(month, 'month')} to date` : formatDate(month, 'month')}
            value={formatCurrency(total, undefined, { decimals: 0 })}
            sublabel={countPhrase(jobs, 'Job', 'Jobs')}
          />
        </InvoicedJobsLink>
      ))}
    </div>
  );
}

/**
 * Every Invoiced Job; there is no month filter. Invoicing reads its Jobs on the Invoicing page, and the Jobs page would
 * send it there without the stage.
 */
function InvoicedJobsLink({ readsAllJobs, children }: { readsAllJobs: boolean; children: ReactNode }) {
  return readsAllJobs ? (
    <Link className={dashboardTileLinkClassName} to="/contracting/jobs" search={{ stage: 'invoiced' }}>
      {children}
    </Link>
  ) : (
    <Link className={dashboardTileLinkClassName} to="/contracting/invoicing" search={{ stage: 'invoiced' }}>
      {children}
    </Link>
  );
}
