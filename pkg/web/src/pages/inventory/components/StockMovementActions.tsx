import type { StockOnHandRow } from '@pkg/schema';
import { IconAdjustments, IconArrowDown, IconArrowUp, IconCash, IconTool } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button.js';

import { StockAdjustmentDialog } from './StockAdjustmentDialog.js';
import { StockBuildDialog } from './StockBuildDialog.js';
import { StockMovementDialog } from './StockMovementDialog.js';
import { StockRevaluationDialog } from './StockRevaluationDialog.js';
import { perpetualPartOptions, revaluablePartOptions, toStockPartOption } from './types.js';

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
  const [buildOpen, setBuildOpen] = useState(false);
  // Only a built, perpetual Part can be produced into; bought stock arrives on a Purchase Order.
  const buildableParts = useMemo(
    () => items.filter((item) => item.isInternallyFabricated && item.stockTrackingMode === 'perpetual'),
    [items],
  );
  const allParts = useMemo(() => items.map(toStockPartOption), [items]);
  const movementParts = useMemo(() => perpetualPartOptions(items), [items]);
  const revaluableParts = useMemo(() => revaluablePartOptions(allParts), [allParts]);

  return (
    <>
      {canMove ? (
        <Button disabled={movementParts.length === 0} onClick={() => setCheckoutOpen(true)} variant="outline">
          <IconArrowDown data-icon="inline-start" />
          Check out
        </Button>
      ) : null}
      {canMove ? (
        <Button disabled={movementParts.length === 0} onClick={() => setReturnOpen(true)} variant="outline">
          <IconArrowUp data-icon="inline-start" />
          Return to store
        </Button>
      ) : null}
      {canBuild ? (
        <Button disabled={buildableParts.length === 0} onClick={() => setBuildOpen(true)} variant="outline">
          <IconTool data-icon="inline-start" />
          Build stock
        </Button>
      ) : null}
      {canAdjust ? (
        <Button disabled={allParts.length === 0} onClick={() => setAdjustmentOpen(true)} variant="outline">
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
          parts={allParts}
        />
      ) : null}
      {revaluationOpen ? (
        <StockRevaluationDialog onOpenChange={setRevaluationOpen} open={true} parts={revaluableParts} />
      ) : null}
      {checkoutOpen ? (
        <StockMovementDialog
          items={items}
          onOpenChange={setCheckoutOpen}
          open={true}
          parts={movementParts}
          type="checkout"
        />
      ) : null}
      {returnOpen ? (
        <StockMovementDialog
          items={items}
          onOpenChange={setReturnOpen}
          open={true}
          parts={movementParts}
          type="return-to-store"
        />
      ) : null}
    </>
  );
}
