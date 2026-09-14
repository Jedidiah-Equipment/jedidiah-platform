import { hasPermission } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import type { SourceCheckoutOption, StockMovementHistoryRow } from '@pkg/schema/equipment';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { StockMovementDialog } from './components/StockMovementDialog.js';
import { StockMovementHistoryTable } from './components/StockMovementHistoryTable.js';
import { partOptionsAllowing } from './components/types.js';

export function StockMovementHistoryPage({ partId }: { partId: UUID }) {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const historyQuery = useQuery(trpc.inventory.history.queryOptions({ partId }));
  const canMove = hasPermission(accessQuery.data, 'equipment_inventory:move');
  const stockQuery = useQuery(trpc.inventory.stockOnHand.queryOptions(undefined, { enabled: canMove }));
  const [returnSourceCheckout, setReturnSourceCheckout] = useState<StockMovementHistoryRow | null>(null);
  const openReturn = useCallback((checkout: StockMovementHistoryRow) => setReturnSourceCheckout(checkout), []);
  const showCosts = hasPermission(accessQuery.data, 'equipment_inventory_cost:read');
  // Stores reads this ledger and holds no `equipment_job:read`, so a Job link would only ever land them on a
  // sheet that refuses to load. The code still shows — it is what the row was drawn against.
  const canReadJobs = hasPermission(accessQuery.data, 'equipment_job:read');
  const part = historyQuery.data?.part;

  return (
    <PageLayout
      description={part ? `${part.code} · Complete append-only movement ledger` : undefined}
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
          {...(canMove ? { onReturnCheckout: openReturn } : {})}
          showCosts={showCosts}
          unitOfMeasure={historyQuery.data.part.unitOfMeasure}
        />
      ) : null}
      {returnSourceCheckout !== null && historyQuery.data ? (
        <StockMovementDialog
          defaultPartId={partId}
          defaultSourceCheckout={sourceCheckoutOption(returnSourceCheckout, historyQuery.data)}
          defaultSourceCheckoutId={returnSourceCheckout.id}
          items={stockQuery.data?.items ?? []}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setReturnSourceCheckout(null);
          }}
          open
          parts={partOptionsAllowing(stockQuery.data?.items ?? [], 'returnToStore')}
          type="return-to-store"
        />
      ) : null}
    </PageLayout>
  );
}

function sourceCheckoutOption(
  checkout: StockMovementHistoryRow,
  history: {
    items: StockMovementHistoryRow[];
    part: { code: string; id: UUID; name: string; unitOfMeasure: SourceCheckoutOption['unitOfMeasure'] };
  },
): SourceCheckoutOption {
  return {
    createdAt: checkout.createdAt,
    id: checkout.id,
    lengthMm: checkout.lengthMm,
    note: checkout.note ?? '',
    partCode: history.part.code,
    partId: history.part.id,
    partName: history.part.name,
    quantity: -checkout.delta,
    recipientName: checkout.recipientName ?? '',
    recipientUserId: checkout.recipientUserId ?? '',
    returnedQuantity: history.items
      .filter((movement) => movement.sourceCheckoutId === checkout.id)
      .reduce((total, movement) => total + movement.delta, 0),
    unitCost: checkout.unitCost,
    unitOfMeasure: history.part.unitOfMeasure,
  };
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
