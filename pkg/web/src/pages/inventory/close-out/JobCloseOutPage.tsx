import { formatDate, hasPermission } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { IconArrowUp, IconFlagCheck } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { JobStockTable } from '../../jobs/components/JobStockTable.js';
import { StockMovementDialog } from '../components/StockMovementDialog.js';
import { perpetualPartOptions } from '../components/types.js';
import { JobCloseOutDialog } from './components/JobCloseOutDialog.js';

export function JobCloseOutPage({ jobId }: { jobId: UUID }) {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const jobStockQuery = useQuery(trpc.inventory.jobStock.queryOptions({ jobId }));
  const [returningPartId, setReturningPartId] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const canMove = hasPermission(accessQuery.data, 'inventory:move');
  const canCloseOut = hasPermission(accessQuery.data, 'inventory:close-out');
  // The stock-on-hand report replays the whole ledger; only a return needs it, so the screen does
  // not pay for it until one opens.
  const stockOnHandQuery = useQuery(
    trpc.inventory.stockOnHand.queryOptions(undefined, { enabled: canMove && returningPartId !== null }),
  );
  const parts = useMemo(() => perpetualPartOptions(stockOnHandQuery.data?.items ?? []), [stockOnHandQuery.data?.items]);

  if (jobStockQuery.isPending) {
    return (
      <PageLayout size="lg" title="Close out Job stock">
        <Skeleton className="h-40 w-full" />
      </PageLayout>
    );
  }

  if (jobStockQuery.error) {
    return (
      <PageLayout size="lg" title="Close out Job stock">
        <p className="text-destructive text-sm">Unable to load this Job’s stock.</p>
      </PageLayout>
    );
  }

  const { items, job } = jobStockQuery.data;
  // Counted, never summed: one Job's Parts span pieces, lengths, and weights.
  const drawnPartCount = items.filter((item) => item.drawnQuantity > 0).length;
  const committedPartCount = items.filter((item) => item.committedQuantity > 0).length;
  // Cancellation ends a Job's stock life its own way, so only a live completed Job is closeable here.
  const isCloseable = job.closedOutAt === null && job.cancelledAt === null && job.completedOn !== null;

  return (
    <PageLayout
      actions={
        <div className="flex flex-wrap gap-2">
          {/* Returns stay open after the close: recovered stock must never be stranded off-ledger,
              and the released commitment does not come back with it. */}
          {canMove ? (
            <Button onClick={() => setReturningPartId('')} variant="outline">
              <IconArrowUp data-icon="inline-start" />
              Return to store
            </Button>
          ) : null}
          {canCloseOut && isCloseable ? (
            <Button onClick={() => setIsClosing(true)}>
              <IconFlagCheck data-icon="inline-start" />
              Close out
            </Button>
          ) : null}
        </div>
      }
      description={describeJob(job)}
      size="lg"
      title={`Close out ${job.displayName}`}
    >
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No CFO or stock movements for this Job.</p>
      ) : (
        <JobStockTable items={items} onReturn={canMove ? setReturningPartId : undefined} />
      )}
      {returningPartId === null ? null : (
        <StockMovementDialog
          defaultPartId={returningPartId}
          fixedJob={{ code: job.code, id: job.id }}
          isLoadingParts={stockOnHandQuery.isPending}
          items={stockOnHandQuery.data?.items ?? []}
          onOpenChange={(open) => {
            if (!open) setReturningPartId(null);
          }}
          open={true}
          parts={parts}
          type="return-to-store"
        />
      )}
      {isClosing ? (
        <JobCloseOutDialog
          jobId={jobId}
          onOpenChange={setIsClosing}
          open={true}
          committedPartCount={committedPartCount}
          drawnPartCount={drawnPartCount}
        />
      ) : null}
    </PageLayout>
  );
}

function describeJob(job: {
  cancelledAt: string | null;
  closedOutAt: string | null;
  code: string;
  completedOn: string | null;
}): string {
  if (job.closedOutAt !== null) {
    return `${job.code} · closed out ${formatDate(job.closedOutAt)}. Its commitment stays released.`;
  }

  // Cancellation already released the commitment, so there is nothing left for a close-out to do.
  if (job.cancelledAt !== null) {
    return `${job.code} · cancelled, so its commitment is already released. Return anything still drawn.`;
  }

  if (job.completedOn === null) {
    return `${job.code} · not completed yet, so it cannot be closed out.`;
  }

  return `${job.code} · completed ${formatDate(job.completedOn)}. Return what is left, then close the Job out.`;
}
