import { formatCurrency, formatDate, hasPermission } from '@pkg/domain';
import { STOCKTAKE_SCOPE_LABELS, type UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

import { StocktakeCountsTable } from './components/StocktakeCountsTable.js';
import { StocktakeUncountedTable } from './components/StocktakeUncountedTable.js';

/**
 * One walk's variance report (spec §9). There is no approval gate anywhere in stocktake — this page
 * *is* the control: every counted Part with its delta, the priced total for a cost reader, and the
 * list of what the walk never reached.
 */
export function StocktakeSessionPage({ sessionId }: { sessionId: UUID }) {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const detailQuery = useQuery(trpc.inventory.stocktakeSession.queryOptions({ sessionId }));
  const showCosts = hasPermission(accessQuery.data, 'inventory_cost:read');

  if (detailQuery.isPending) {
    return (
      <PageLayout size="lg" title="Stocktake session">
        <Skeleton className="h-40 w-full" />
      </PageLayout>
    );
  }

  if (detailQuery.error) {
    return (
      <PageLayout size="lg" title="Stocktake session">
        <p className="text-destructive text-sm">Unable to load this stocktake session.</p>
      </PageLayout>
    );
  }

  const { counts, session, totalVarianceValue, uncounted } = detailQuery.data;
  const isClosed = session.closedAt !== null;

  return (
    <PageLayout
      actions={<Badge variant={isClosed ? 'secondary' : 'default'}>{isClosed ? 'Closed' : 'Open'}</Badge>}
      description={describeSession({
        closedAt: session.closedAt,
        closedByName: session.closedByName,
        openedAt: session.openedAt,
        openedByName: session.openedByName,
      })}
      size="lg"
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

      <section className="space-y-2">
        <h2 className="font-medium text-sm">{isClosed ? 'Skipped' : 'Still to count'}</h2>
        <StocktakeUncountedTable isClosed={isClosed} isLoading={false} items={uncounted} />
      </section>
    </PageLayout>
  );
}

function describeSession({
  closedAt,
  closedByName,
  openedAt,
  openedByName,
}: {
  closedAt: string | null;
  closedByName: string | null;
  openedAt: string;
  openedByName: string;
}): string {
  const opened = `Opened ${formatDate(openedAt)} by ${openedByName}`;

  if (closedAt === null) return `${opened}. Still open — counts may still be posted against it.`;

  return `${opened} · closed ${formatDate(closedAt)}${closedByName === null ? '' : ` by ${closedByName}`}.`;
}
