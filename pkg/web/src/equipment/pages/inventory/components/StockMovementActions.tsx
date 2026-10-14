import { derivePartStockActions } from '@pkg/domain/equipment';
import { IconAdjustments, IconArrowDown, IconArrowUp, IconCash, IconTool, IconUserMinus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

import { CheckoutBasketDialog } from './CheckoutBasketDialog.js';
import { ReturnFromCheckoutDialog } from './ReturnFromCheckoutDialog.js';
import { StockAdjustmentDialog } from './StockAdjustmentDialog.js';
import { StockBuildDialog } from './StockBuildDialog.js';
import { StockMovementDialog } from './StockMovementDialog.js';
import { StockRevaluationDialog } from './StockRevaluationDialog.js';
import { partOptionsAllowing } from './types.js';

export function StockMovementActions({
  canAdjust,
  canBuild,
  canReadCost,
  canRevalue,
  canMove,
}: {
  canAdjust: boolean;
  canBuild: boolean;
  canReadCost: boolean;
  canRevalue: boolean;
  canMove: boolean;
}) {
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [revaluationOpen, setRevaluationOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnFromCheckoutOpen, setReturnFromCheckoutOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const trpc = useTRPC();
  const stockQuery = useQuery(
    trpc.inventory.stockOnHand.queryOptions(
      { limit: 0 },
      {
        enabled: adjustmentOpen || checkoutOpen || revaluationOpen || returnOpen || buildOpen,
      },
    ),
  );
  const items = stockQuery.data?.items ?? [];
  const buildableParts = useMemo(() => items.filter((item) => derivePartStockActions(item).build.allowed), [items]);
  const adjustableParts = useMemo(() => partOptionsAllowing(items, 'adjust'), [items]);
  const checkoutParts = useMemo(() => partOptionsAllowing(items, 'checkout'), [items]);
  const returnParts = useMemo(() => partOptionsAllowing(items, 'returnToStore'), [items]);
  const revaluableParts = useMemo(() => partOptionsAllowing(items, 'revalue'), [items]);

  return (
    <>
      {stockQuery.isFetching ? <span role="status">Loading Parts…</span> : null}
      {stockQuery.isError ? (
        <div role="alert">
          {getApiQueryErrorMessage(stockQuery.error, 'Unable to load Parts.')}
          <Button onClick={() => void stockQuery.refetch()} variant="link">
            Retry
          </Button>
        </div>
      ) : null}
      {canMove ? (
        <Button onClick={() => setCheckoutOpen(true)} variant="outline">
          <IconArrowDown data-icon="inline-start" />
          Check out
        </Button>
      ) : null}
      {canMove ? (
        <Button onClick={() => setReturnOpen(true)} variant="outline">
          <IconArrowUp data-icon="inline-start" />
          Return to store
        </Button>
      ) : null}
      {canMove ? (
        <Button onClick={() => setReturnFromCheckoutOpen(true)} variant="outline">
          <IconUserMinus data-icon="inline-start" />
          Return without a Job
        </Button>
      ) : null}
      {canBuild ? (
        <Button onClick={() => setBuildOpen(true)} variant="outline">
          <IconTool data-icon="inline-start" />
          Build stock
        </Button>
      ) : null}
      {canAdjust ? (
        <Button onClick={() => setAdjustmentOpen(true)} variant="outline">
          <IconAdjustments data-icon="inline-start" />
          Post adjustment
        </Button>
      ) : null}
      {canRevalue ? (
        <Button onClick={() => setRevaluationOpen(true)} variant="outline">
          <IconCash data-icon="inline-start" />
          Revalue Part
        </Button>
      ) : null}
      {buildOpen && stockQuery.isSuccess ? (
        <StockBuildDialog buildableParts={buildableParts} items={items} onOpenChange={setBuildOpen} open />
      ) : null}
      {adjustmentOpen && stockQuery.isSuccess ? (
        <StockAdjustmentDialog
          canReadCost={canReadCost}
          onOpenChange={setAdjustmentOpen}
          open={true}
          parts={adjustableParts}
        />
      ) : null}
      {revaluationOpen && stockQuery.isSuccess ? (
        <StockRevaluationDialog onOpenChange={setRevaluationOpen} open={true} parts={revaluableParts} />
      ) : null}
      {checkoutOpen && stockQuery.isSuccess ? (
        <CheckoutBasketDialog items={items} onOpenChange={setCheckoutOpen} open={true} parts={checkoutParts} />
      ) : null}
      {returnOpen && stockQuery.isSuccess ? (
        <StockMovementDialog onOpenChange={setReturnOpen} open={true} parts={returnParts} />
      ) : null}
      {returnFromCheckoutOpen ? <ReturnFromCheckoutDialog onOpenChange={setReturnFromCheckoutOpen} open /> : null}
    </>
  );
}
