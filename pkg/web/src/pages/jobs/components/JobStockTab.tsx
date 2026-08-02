import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { StockMovementDialog } from '../../inventory/components/StockMovementDialog.js';
import { perpetualPartOptions } from '../../inventory/components/types.js';
import { JobStockTable } from './JobStockTable.js';

export function JobStockTab({ isCancelled, job }: { isCancelled: boolean; job: { code: string; id: string } }) {
  const trpc = useTRPC();
  const canMove = useCan('inventory:move').can;
  const jobStockQuery = useQuery(trpc.inventory.jobStock.queryOptions({ jobId: job.id }));
  const stockOnHandQuery = useQuery(trpc.inventory.stockOnHand.queryOptions(undefined, { enabled: canMove }));
  const [movementType, setMovementType] = useState<'checkout' | 'return-to-store' | null>(null);
  const parts = useMemo(() => perpetualPartOptions(stockOnHandQuery.data?.items ?? []), [stockOnHandQuery.data?.items]);

  if (jobStockQuery.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (jobStockQuery.error) {
    return <p className="text-destructive text-sm">Unable to load Job stock.</p>;
  }

  return (
    <div className="grid gap-4">
      {canMove ? (
        <div className="flex flex-wrap gap-2">
          {!isCancelled ? (
            <Button disabled={parts.length === 0} onClick={() => setMovementType('checkout')} variant="outline">
              <IconArrowDown data-icon="inline-start" />
              Check out
            </Button>
          ) : null}
          <Button disabled={parts.length === 0} onClick={() => setMovementType('return-to-store')} variant="outline">
            <IconArrowUp data-icon="inline-start" />
            Return to store
          </Button>
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
          items={stockOnHandQuery.data?.items ?? []}
          onOpenChange={(open) => {
            if (!open) setMovementType(null);
          }}
          open={true}
          parts={parts}
          type={movementType}
        />
      ) : null}
    </div>
  );
}
