import type { JobStockMovementType } from '@pkg/schema';
import { IconArrowDown, IconArrowUp, IconShoppingCartPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { CreatePurchaseOrdersDialog } from '../../inventory/components/CreatePurchaseOrdersDialog.js';
import { StockMovementDialog } from '../../inventory/components/StockMovementDialog.js';
import { partOptionsAllowing } from '../../inventory/components/types.js';
import { JobStockTable } from './JobStockTable.js';
import { toJobStockPurchaseCandidates } from './job-stock-purchase-selection.js';

export function JobStockTab({ isCancelled, job }: { isCancelled: boolean; job: { code: string; id: string } }) {
  const trpc = useTRPC();
  const canMove = useCan('equipment_inventory:move').can;
  const canCreatePurchaseOrders = useCan('equipment_purchase_order:create').can;
  const jobStockQuery = useQuery(trpc.inventory.jobStock.queryOptions({ jobId: job.id }));
  const [movementType, setMovementType] = useState<JobStockMovementType | null>(null);
  const [isCreatingPurchaseOrders, setIsCreatingPurchaseOrders] = useState(false);
  // The stock-on-hand report replays the whole ledger; only the movement dialog's Part picker needs
  // it, so the tab does not pay for it until one opens.
  const stockOnHandQuery = useQuery(
    trpc.inventory.stockOnHand.queryOptions(undefined, { enabled: canMove && movementType !== null }),
  );
  const stockOnHandItems = useMemo(() => stockOnHandQuery.data?.items ?? [], [stockOnHandQuery.data?.items]);
  const parts = useMemo(
    () => partOptionsAllowing(stockOnHandItems, movementType === 'return-to-store' ? 'returnToStore' : 'checkout'),
    [movementType, stockOnHandItems],
  );
  const purchaseCandidates = useMemo(
    () => toJobStockPurchaseCandidates(jobStockQuery.data?.items ?? []),
    [jobStockQuery.data?.items],
  );

  if (jobStockQuery.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (jobStockQuery.error) {
    return <p className="text-destructive text-sm">Unable to load Job stock.</p>;
  }

  return (
    <div className="grid gap-4">
      {canMove || canCreatePurchaseOrders ? (
        <div className="flex flex-wrap gap-2">
          {canMove && !isCancelled ? (
            <Button onClick={() => setMovementType('checkout')} variant="outline">
              <IconArrowDown data-icon="inline-start" />
              Check out
            </Button>
          ) : null}
          {canMove ? (
            <Button onClick={() => setMovementType('return-to-store')} variant="outline">
              <IconArrowUp data-icon="inline-start" />
              Return to store
            </Button>
          ) : null}
          {canCreatePurchaseOrders && !isCancelled && purchaseCandidates.length > 0 ? (
            <Button onClick={() => setIsCreatingPurchaseOrders(true)} variant="outline">
              <IconShoppingCartPlus data-icon="inline-start" />
              Create Purchase Orders
            </Button>
          ) : null}
        </div>
      ) : null}
      {jobStockQuery.data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No CFO or stock movements for this Job.</p>
      ) : (
        <JobStockTable items={jobStockQuery.data.items} />
      )}
      {movementType ? (
        <StockMovementDialog
          fixedJob={job}
          isLoadingParts={stockOnHandQuery.isPending}
          items={stockOnHandItems}
          onOpenChange={(open) => {
            if (!open) setMovementType(null);
          }}
          open={true}
          parts={parts}
          type={movementType}
        />
      ) : null}
      <CreatePurchaseOrdersDialog
        candidates={purchaseCandidates}
        jobId={job.id}
        onOpenChange={setIsCreatingPurchaseOrders}
        open={isCreatingPurchaseOrders}
      />
    </div>
  );
}
