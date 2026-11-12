import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { dashboardTileLinkClassName } from '@/components/common/dashboard/DashboardTile.js';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/components/common/dashboard/dashboard-refresh.js';
import { InvoicedMonthCards } from '@/components/common/dashboard/InvoicedMonthCards.js';
import { useTRPC } from '@/lib/trpc.js';

/** Each month opens the Invoicing page on Invoiced; the page has no month filter. */
export function InvoicedByMonthWidget() {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.quotes.invoicedByMonth.queryOptions(),
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
  });
  return (
    <InvoicedMonthCards
      months={query.data?.months.map(({ month, total, quotes }) => ({ month, total, count: quotes }))}
      error={query.error}
      noun={{ one: 'Quote', many: 'Quotes' }}
      link={(body) => (
        <Link className={dashboardTileLinkClassName} to="/equipment/invoicing" search={{ stage: 'invoiced' }}>
          {body}
        </Link>
      )}
    />
  );
}
