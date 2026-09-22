import { hasPermission } from '@pkg/domain';
import { derivePartStockActions } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { ReturnFromCheckoutDialog } from './components/ReturnFromCheckoutDialog.js';
import { StockMovementHistoryTable } from './components/StockMovementHistoryTable.js';

export function StockMovementHistoryPage({ partId }: { partId: UUID }) {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const historyQuery = useQuery(trpc.inventory.history.queryOptions({ partId }));
  const [returnSourceCheckoutId, setReturnSourceCheckoutId] = useState<UUID | null>(null);
  const showCosts = hasPermission(accessQuery.data, 'equipment_inventory_cost:read');
  // Stores reads this ledger and holds no `equipment_job:read`, so a Job link would only ever land them on a
  // sheet that refuses to load. The code still shows — it is what the row was drawn against.
  const canReadJobs = hasPermission(accessQuery.data, 'equipment_job:read');
  // Stores holds no Quote permission either, so a Parts Sale code is named but not linked for them.
  const canReadQuotes = hasPermission(accessQuery.data, 'equipment_quote:read');
  const part = historyQuery.data?.part;
  // The same gate the post applies: a Part that refuses returns is not offered one from its history.
  const canReturn =
    hasPermission(accessQuery.data, 'equipment_inventory:move') &&
    part !== undefined &&
    derivePartStockActions(part).returnToStore.allowed;

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
          canReadQuotes={canReadQuotes}
          items={historyQuery.data.items}
          onReturnCheckout={canReturn ? setReturnSourceCheckoutId : undefined}
          showCosts={showCosts}
          unitOfMeasure={historyQuery.data.part.unitOfMeasure}
        />
      ) : null}
      {returnSourceCheckoutId === null ? null : (
        <ReturnFromCheckoutDialog
          defaultSourceCheckoutId={returnSourceCheckoutId}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setReturnSourceCheckoutId(null);
          }}
          open
          partId={partId}
        />
      )}
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
