import type { JobStockLengthBucket } from '@pkg/schema/equipment';
import { useQuery } from '@tanstack/react-query';

import { useTRPC } from '@/lib/trpc.js';

import type { ReturnStockTarget } from './types.js';

/** What a Job or Parts Sale stock read serves per Part, as far as a return is judged against it. */
export type TargetStockRow = { drawnQuantity: number; lengthBuckets: readonly JobStockLengthBucket[]; partId: string };

function drawnRows(result: { items: readonly TargetStockRow[] }): readonly TargetStockRow[] {
  return result.items;
}

/**
 * What the selected target already has drawn, whichever kind it is. A Job and a Parts Sale are read
 * from their own procedures, so the kind chooses which request runs and the caller sees one read.
 */
export function useTargetStock({ kind, targetId }: { kind: ReturnStockTarget | undefined; targetId: string }): {
  isPending: boolean;
  rows: readonly TargetStockRow[] | undefined;
} {
  const trpc = useTRPC();
  const jobStock = useQuery(
    trpc.inventory.jobStock.queryOptions(
      { jobId: targetId },
      { enabled: kind === 'job' && targetId !== '', select: drawnRows },
    ),
  );
  const quoteStock = useQuery(
    trpc.inventoryQuotes.quoteStock.queryOptions(
      { quoteId: targetId },
      { enabled: kind === 'quote' && targetId !== '', select: drawnRows },
    ),
  );
  const query = kind === 'quote' ? quoteStock : jobStock;

  return { isPending: query.isPending, rows: query.data };
}
