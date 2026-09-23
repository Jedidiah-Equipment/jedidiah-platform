import { derivePartStockActions } from '@pkg/domain/equipment';
import type { StockOnHandRow } from '@pkg/schema/equipment';
import { IconAdjustments, IconArrowDown, IconArrowUp, IconCash, IconTool, IconUserMinus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button.js';

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
  items,
}: {
  canAdjust: boolean;
  canBuild: boolean;
  canReadCost: boolean;
  canRevalue: boolean;
  canMove: boolean;
  items: readonly StockOnHandRow[];
}) {
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [revaluationOpen, setRevaluationOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnFromCheckoutOpen, setReturnFromCheckoutOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const buildableParts = useMemo(() => items.filter((item) => derivePartStockActions(item).build.allowed), [items]);
  const adjustableParts = useMemo(() => partOptionsAllowing(items, 'adjust'), [items]);
  const checkoutParts = useMemo(() => partOptionsAllowing(items, 'checkout'), [items]);
  const returnParts = useMemo(() => partOptionsAllowing(items, 'returnToStore'), [items]);
  const revaluableParts = useMemo(() => partOptionsAllowing(items, 'revalue'), [items]);

  return (
    <>
      {canMove ? (
        <Button disabled={checkoutParts.length === 0} onClick={() => setCheckoutOpen(true)} variant="outline">
          <IconArrowDown data-icon="inline-start" />
          Check out
        </Button>
      ) : null}
      {canMove ? (
        <Button disabled={returnParts.length === 0} onClick={() => setReturnOpen(true)} variant="outline">
          <IconArrowUp data-icon="inline-start" />
          Return to store
        </Button>
      ) : null}
      {canMove ? (
        <Button disabled={returnParts.length === 0} onClick={() => setReturnFromCheckoutOpen(true)} variant="outline">
          <IconUserMinus data-icon="inline-start" />
          Return without a Job
        </Button>
      ) : null}
      {canBuild ? (
        <Button disabled={buildableParts.length === 0} onClick={() => setBuildOpen(true)} variant="outline">
          <IconTool data-icon="inline-start" />
          Build stock
        </Button>
      ) : null}
      {canAdjust ? (
        <Button disabled={adjustableParts.length === 0} onClick={() => setAdjustmentOpen(true)} variant="outline">
          <IconAdjustments data-icon="inline-start" />
          Post adjustment
        </Button>
      ) : null}
      {canRevalue ? (
        <Button disabled={revaluableParts.length === 0} onClick={() => setRevaluationOpen(true)} variant="outline">
          <IconCash data-icon="inline-start" />
          Revalue Part
        </Button>
      ) : null}
      {buildOpen ? (
        <StockBuildDialog buildableParts={buildableParts} items={items} onOpenChange={setBuildOpen} open />
      ) : null}
      {adjustmentOpen ? (
        <StockAdjustmentDialog
          canReadCost={canReadCost}
          onOpenChange={setAdjustmentOpen}
          open={true}
          parts={adjustableParts}
        />
      ) : null}
      {revaluationOpen ? (
        <StockRevaluationDialog onOpenChange={setRevaluationOpen} open={true} parts={revaluableParts} />
      ) : null}
      {checkoutOpen ? (
        <CheckoutBasketDialog items={items} onOpenChange={setCheckoutOpen} open={true} parts={checkoutParts} />
      ) : null}
      {returnOpen ? <StockMovementDialog onOpenChange={setReturnOpen} open={true} parts={returnParts} /> : null}
      {returnFromCheckoutOpen ? <ReturnFromCheckoutDialog onOpenChange={setReturnFromCheckoutOpen} open /> : null}
    </>
  );
}
