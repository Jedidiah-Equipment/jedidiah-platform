import type { StockOnHandRow } from '@pkg/schema';
import { IconAdjustments, IconCash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button.js';

import { StockAdjustmentDialog } from './StockAdjustmentDialog.js';
import { StockRevaluationDialog } from './StockRevaluationDialog.js';
import { distinctPartOptions, revaluablePartOptions } from './types.js';

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
  const revaluableParts = useMemo(() => revaluablePartOptions(parts), [parts]);

  return (
    <>
      {canAdjust ? (
        <Button disabled={parts.length === 0} onClick={() => setAdjustmentOpen(true)} variant="outline">
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
      {adjustmentOpen ? (
        <StockAdjustmentDialog canReadCost={canReadCost} onOpenChange={setAdjustmentOpen} open={true} parts={parts} />
      ) : null}
      {revaluationOpen ? (
        <StockRevaluationDialog onOpenChange={setRevaluationOpen} open={true} parts={revaluableParts} />
      ) : null}
    </>
  );
}
