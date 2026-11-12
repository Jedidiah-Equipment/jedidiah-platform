import { formatNumber } from '@pkg/domain';
import type { openInvoicingQuoteStages } from '@pkg/schema/equipment';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { DashboardTile, dashboardTileLinkClassName } from '@/components/common/dashboard/DashboardTile.js';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/components/common/dashboard/dashboard-refresh.js';
import { useTRPC } from '@/lib/trpc.js';

function QuoteStageTile({ stage, sublabel }: { stage: (typeof openInvoicingQuoteStages)[number]; sublabel: string }) {
  const trpc = useTRPC();
  const query = useQuery({ ...trpc.quotes.stageCounts.queryOptions(), refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS });
  return (
    <DashboardTile
      value={query.data ? formatNumber(query.data.counts[stage]) : undefined}
      error={query.error}
      errorMessage="Unable to load Quote counts."
      sublabel={sublabel}
      link={(body) => (
        <Link className={dashboardTileLinkClassName} to="/equipment/invoicing" search={{ stage }}>
          {body}
        </Link>
      )}
    />
  );
}

export const AwaitingPricingTile = () => <QuoteStageTile stage="awaiting-pricing" sublabel="Need final pricing" />;

export const AwaitingApprovalTile = () => <QuoteStageTile stage="awaiting-approval" sublabel="Need approval" />;

export const AwaitingInvoiceTile = () => <QuoteStageTile stage="awaiting-invoice" sublabel="Need an Invoice Number" />;
