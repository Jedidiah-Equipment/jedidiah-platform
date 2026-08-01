import type { StockOnHandRow } from '@pkg/schema';
import { IconAdjustments, IconCash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button.js';

import { StockAdjustmentDialog } from './StockAdjustmentDialog.js';
import { StockRevaluationDialog } from './StockRevaluationDialog.js';
import { distinctPartOptions } from './types.js';

export function StockMovementActions({
  canAdjust,
  canReadCost,
  canRevalue,
  items,
}: {
  canAdjust: boolean;
  canReadCost: boolean;
  canRevalue: boolean;
  items: readonly StockOnHandRow[];
}) {
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [revaluationOpen, setRevaluationOpen] = useState(false);
  const parts = useMemo(() => distinctPartOptions(items), [items]);

  return (
    <>
      {canAdjust ? (
        <Button disabled={parts.length === 0} onClick={() => setAdjustmentOpen(true)} variant="outline">
          <IconAdjustments data-icon="inline-start" />
          Post adjustment
        </Button>
      ) : null}
      {canRevalue ? (
        <Button disabled={parts.length === 0} onClick={() => setRevaluationOpen(true)} variant="outline">
          <IconCash data-icon="inline-start" />
          Revalue Part
        </Button>
      ) : null}
      <StockAdjustmentDialog
        canReadCost={canReadCost}
        onOpenChange={setAdjustmentOpen}
        open={adjustmentOpen}
        parts={parts}
      />
      <StockRevaluationDialog onOpenChange={setRevaluationOpen} open={revaluationOpen} parts={parts} />
    </>
  );
}
