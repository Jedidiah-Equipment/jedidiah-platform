import type { JobStockMovementType } from '@pkg/schema';
import { IconArrowDown, IconArrowUp, IconShoppingCartPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { SeedPurchaseOrdersDialog } from '../../inventory/components/SeedPurchaseOrdersDialog.js';
import { StockMovementDialog } from '../../inventory/components/StockMovementDialog.js';
import { perpetualPartOptions } from '../../inventory/components/types.js';
import { JobStockTable } from './JobStockTable.js';
import { toJobStockSeedCandidates } from './job-stock-seed.js';

export function JobStockTab({ isCancelled, job }: { isCancelled: boolean; job: { code: string; id: string } }) {
  const trpc = useTRPC();
  const canMove = useCan('inventory:move').can;
  const canSeedPurchaseOrders = useCan('purchase_order:create').can;
  const jobStockQuery = useQuery(trpc.inventory.jobStock.queryOptions({ jobId: job.id }));
  const [movementType, setMovementType] = useState<JobStockMovementType | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  // The stock-on-hand report replays the ledger; only a movement or a seeded order needs it, so the
  // tab does not pay for it until one is opened.
  const stockOnHandQuery = useQuery(
    trpc.inventory.stockOnHand.queryOptions(undefined, {
      enabled: (canMove && movementType !== null) || (canSeedPurchaseOrders && isSeeding),
    }),
  );
  const stockOnHandItems = useMemo(() => stockOnHandQuery.data?.items ?? [], [stockOnHandQuery.data?.items]);
  const parts = useMemo(() => perpetualPartOptions(stockOnHandItems), [stockOnHandItems]);
  const seedCandidates = useMemo(
    () => toJobStockSeedCandidates({ items: jobStockQuery.data?.items ?? [], stockOnHand: stockOnHandItems }),
    [jobStockQuery.data?.items, stockOnHandItems],
  );

  if (jobStockQuery.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (jobStockQuery.error) {
    return <p className="text-destructive text-sm">Unable to load Job stock.</p>;
  }

  const hasOpenCommitment = jobStockQuery.data.items.some((item) => item.committedQuantity > 0);

  return (
    <div className="grid gap-4">
      {canMove || canSeedPurchaseOrders ? (
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
          {canSeedPurchaseOrders && !isCancelled && hasOpenCommitment ? (
            <Button onClick={() => setIsSeeding(true)} variant="outline">
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
      {isSeeding && !stockOnHandQuery.isPending ? (
        <SeedPurchaseOrdersDialog candidates={seedCandidates} jobId={job.id} onOpenChange={setIsSeeding} open={true} />
      ) : null}
    </div>
  );
}
