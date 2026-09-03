import { formatCurrency, formatDate, hasPermission, stocktakeSessionStatusOf } from '@pkg/domain';
import { STOCKTAKE_SCOPE_LABELS, type StocktakeSession, type UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { RawMaterialDriftTable } from './components/RawMaterialDriftTable.js';
import { StocktakeCountsTable } from './components/StocktakeCountsTable.js';
import { StocktakeSessionStatusBadge } from './components/StocktakeSessionStatusBadge.js';
import { StocktakeUncountedTable } from './components/StocktakeUncountedTable.js';

/**
 * One walk's variance report (spec §9). There is no approval gate anywhere in stocktake — this page
 * *is* the control: every counted Part with its delta, the priced total for a cost reader, and the
 * list of what the walk never reached.
 */
export function StocktakeSessionPage({ sessionId }: { sessionId: UUID }) {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const reportQuery = useQuery(trpc.inventory.stocktakeSessionReport.queryOptions({ sessionId }));
  const showCosts = hasPermission(accessQuery.data, 'inventory_cost:read');

  if (reportQuery.isPending) {
    return (
      <PageLayout title="Stocktake session">
        <Skeleton className="h-40 w-full" />
      </PageLayout>
    );
  }

  if (reportQuery.error) {
    return (
      <PageLayout title="Stocktake session">
        <p className="text-destructive text-sm">Unable to load this stocktake session.</p>
      </PageLayout>
    );
  }

  const { counts, rawMaterialDrift, session, totalVarianceValue } = reportQuery.data;
  const isClosed = session.closedAt !== null;

  return (
    <PageLayout
      actions={<StocktakeSessionStatusBadge size="lg" status={stocktakeSessionStatusOf(session)} />}
      description={describeSession(session)}
      title={`${STOCKTAKE_SCOPE_LABELS[session.scope]} stocktake`}
    >
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium text-sm">Counted</h2>
          {showCosts ? (
            <p className="text-muted-foreground text-sm">
              Variance total:{' '}
              <span className="font-medium tabular-nums text-foreground">
                {totalVarianceValue === null ? 'not priced' : formatCurrency(totalVarianceValue)}
              </span>
            </p>
          ) : null}
        </div>
        <StocktakeCountsTable isLoading={false} items={counts} showCosts={showCosts} />
      </section>

      {showCosts && rawMaterialDrift ? (
        <section className="space-y-2">
          <h2 className="font-medium text-sm">Expected vs actual raw-material consumption</h2>
          <RawMaterialDriftTable report={rawMaterialDrift} />
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-medium text-sm">{isClosed ? 'Skipped' : 'Still to count'}</h2>
        <StocktakeUncountedTable isClosed={isClosed} sessionId={sessionId} />
      </section>
    </PageLayout>
  );
}

function describeSession({ closedAt, closedByName, openedAt, openedByName }: StocktakeSession): string {
  const opened = `Opened ${formatDate(openedAt)} by ${openedByName}`;

  if (closedAt === null) return `${opened}. Still open — counts may still be posted against it.`;

  return `${opened} · closed ${formatDate(closedAt)}${closedByName === null ? '' : ` by ${closedByName}`}.`;
}
