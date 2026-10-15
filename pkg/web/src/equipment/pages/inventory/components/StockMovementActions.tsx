import { derivePartStockActions } from '@pkg/domain/equipment';
import {
  IconAdjustments,
  IconArrowDown,
  IconArrowUp,
  IconCash,
  IconPrinter,
  IconTool,
  IconUserMinus,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { type PageHeaderAction, PageHeaderActions } from '@/components/page-layout/PageHeaderActions.js';
import { Button } from '@/components/ui/button.js';
import { PartLabelBatchPrintDialog } from '@/equipment/pages/parts/PartLabelBatchDialog.js';
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
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labelOpenCount, setLabelOpenCount] = useState(0);
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

  const actions: PageHeaderAction[] = [
    {
      label: 'Print labels',
      icon: <IconPrinter data-icon="inline-start" />,
      onClick: () => {
        setLabelOpenCount((count) => count + 1);
        setLabelsOpen(true);
      },
    },
    ...(canMove
      ? [
          {
            label: 'Check out',
            icon: <IconArrowDown data-icon="inline-start" />,
            onClick: () => setCheckoutOpen(true),
          },
          {
            label: 'Return to store',
            icon: <IconArrowUp data-icon="inline-start" />,
            onClick: () => setReturnOpen(true),
          },
          {
            label: 'Return without a Job',
            icon: <IconUserMinus data-icon="inline-start" />,
            onClick: () => setReturnFromCheckoutOpen(true),
          },
        ]
      : []),
    ...(canBuild
      ? [{ label: 'Build stock', icon: <IconTool data-icon="inline-start" />, onClick: () => setBuildOpen(true) }]
      : []),
    ...(canAdjust
      ? [
          {
            label: 'Post adjustment',
            icon: <IconAdjustments data-icon="inline-start" />,
            onClick: () => setAdjustmentOpen(true),
          },
        ]
      : []),
    ...(canRevalue
      ? [
          {
            label: 'Revalue Part',
            icon: <IconCash data-icon="inline-start" />,
            onClick: () => setRevaluationOpen(true),
          },
        ]
      : []),
  ];

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
      <PageHeaderActions actions={actions} title="Stock on hand" />
      <PartLabelBatchPrintDialog
        key={labelOpenCount}
        onOpenChange={setLabelsOpen}
        open={labelsOpen}
        partSource="inventory"
      />
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
