import { hasPermission } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

import { StockMovementHistoryTable } from './components/StockMovementHistoryTable.js';

export function StockMovementHistoryPage({ partId }: { partId: UUID }) {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const historyQuery = useQuery(trpc.inventory.history.queryOptions({ partId }));
  const showCosts = hasPermission(accessQuery.data, 'inventory_cost:read');
  // Stores reads this ledger and holds no `job:read`, so a Job link would only ever land them on a
  // sheet that refuses to load. The code still shows — it is what the row was drawn against.
  const canReadJobs = hasPermission(accessQuery.data, 'job:read');
  const part = historyQuery.data?.part;

  return (
    <PageLayout
      description={part ? `${part.code} · Complete append-only movement ledger` : undefined}
      size="lg"
      title={part ? `${part.name} history` : undefined}
    >
      {historyQuery.isPending ? <HistorySkeleton /> : null}
      {historyQuery.error ? <p className="text-destructive text-sm">Unable to load transaction history.</p> : null}
      {historyQuery.data?.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No stock movements have been posted for this Part.</p>
      ) : null}
      {historyQuery.data?.items.length ? (
        <StockMovementHistoryTable
          canReadJobs={canReadJobs}
          items={historyQuery.data.items}
          showCosts={showCosts}
          unitOfMeasure={historyQuery.data.part.unitOfMeasure}
        />
      ) : null}
    </PageLayout>
  );
}

function HistorySkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
