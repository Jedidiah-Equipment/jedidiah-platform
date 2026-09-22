import type { JobStockMovementType } from '@pkg/schema/equipment';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';

import { useTRPC } from '@/lib/trpc.js';

import { CheckoutBasketDialog } from './CheckoutBasketDialog.js';
import { StockMovementDialog } from './StockMovementDialog.js';
import { type FixedMovementTarget, partOptionsAllowing } from './types.js';

/**
 * The Check out and Return to store dialogs a Job or Parts Sale page opens already pointed at itself.
 * `openDialog` opens one; `dialogs` renders whichever is open, and belongs anywhere in the page.
 */
export function useStockMovementDialogs({
  canMove,
  fixedTarget,
}: {
  canMove: boolean;
  fixedTarget: FixedMovementTarget;
}): { dialogs: ReactNode; openDialog: (movementType: JobStockMovementType) => void } {
  const trpc = useTRPC();
  const [movementType, setMovementType] = useState<JobStockMovementType | null>(null);
  // The stock-on-hand report replays the whole ledger; only the dialogs' Part pickers need it, so
  // the page does not pay for it until one opens.
  const stockOnHandQuery = useQuery(
    trpc.inventory.stockOnHand.queryOptions(undefined, { enabled: canMove && movementType !== null }),
  );
  const items = useMemo(() => stockOnHandQuery.data?.items ?? [], [stockOnHandQuery.data?.items]);
  const parts = useMemo(
    () => partOptionsAllowing(items, movementType === 'return-to-store' ? 'returnToStore' : 'checkout'),
    [movementType, items],
  );
  const onOpenChange = (open: boolean) => {
    if (!open) setMovementType(null);
  };

  const dialogs =
    movementType === 'checkout' ? (
      <CheckoutBasketDialog
        fixedTarget={fixedTarget}
        isLoadingParts={stockOnHandQuery.isPending}
        items={items}
        onOpenChange={onOpenChange}
        open={true}
        parts={parts}
      />
    ) : movementType === 'return-to-store' ? (
      <StockMovementDialog
        fixedTarget={fixedTarget}
        isLoadingParts={stockOnHandQuery.isPending}
        onOpenChange={onOpenChange}
        open={true}
        parts={parts}
      />
    ) : null;

  return { dialogs, openDialog: setMovementType };
}
