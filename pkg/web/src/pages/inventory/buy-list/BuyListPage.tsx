import { IconShoppingCartPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { RowSelectionState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { buyListPageDescription } from '@/utils/page-descriptions.js';

import { CreatePurchaseOrdersDialog } from '../components/CreatePurchaseOrdersDialog.js';
import { BuyListTable } from './components/BuyListTable.js';
import { LatePurchaseOrdersTable } from './components/LatePurchaseOrdersTable.js';

export function BuyListPage() {
  const trpc = useTRPC();
  const canSeed = useCan('purchase_order:create').can;
  const canReadPurchaseOrders = useCan('purchase_order:read').can;
  const buyListQuery = useQuery(trpc.inventory.buyList.queryOptions());
  const lateQuery = useQuery({ ...trpc.purchaseOrders.late.queryOptions(), enabled: canReadPurchaseOrders });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isSeeding, setIsSeeding] = useState(false);

  const items = buyListQuery.data?.items ?? [];
  const selected = useMemo(() => items.filter((item) => rowSelection[item.partId]), [items, rowSelection]);
  const candidates = useMemo(
    () =>
      selected.map((item) => ({
        partCode: item.partCode,
        partId: item.partId,
        partName: item.partName,
        standardPurchaseLengthMm: item.standardPurchaseLengthMm,
        suggestedQuantity: item.suggestedQuantity,
        supplierName: item.supplierName,
        unitOfMeasure: item.unitOfMeasure,
      })),
    [selected],
  );

  return (
    <PageLayout
      actions={
        canSeed ? (
          <Button disabled={selected.length === 0} onClick={() => setIsSeeding(true)} type="button">
            <IconShoppingCartPlus data-icon="inline-start" />
            {selected.length === 0 ? 'Create Purchase Orders' : `Create Purchase Orders (${selected.length})`}
          </Button>
        ) : null
      }
      description={buyListPageDescription}
      size="lg"
      title="Buy list"
    >
      <div className="grid gap-8">
        <BuyListTable
          canSelect={canSeed}
          errorMessage={getApiQueryErrorMessage(buyListQuery.error, 'Unable to load the buy list.')}
          isLoading={buyListQuery.isPending}
          items={items}
          onRowSelectionChange={setRowSelection}
          rowSelection={rowSelection}
        />
        {canReadPurchaseOrders ? (
          <section className="grid gap-3">
            <div>
              <h2 className="font-medium text-lg">Late Purchase Orders</h2>
              <p className="text-muted-foreground text-sm">
                Sent orders past their expected date with lines still owed. Chase them, or close them short.
              </p>
            </div>
            <LatePurchaseOrdersTable
              errorMessage={getApiQueryErrorMessage(lateQuery.error, 'Unable to load late Purchase Orders.')}
              isLoading={lateQuery.isPending}
              items={lateQuery.data?.items ?? []}
            />
          </section>
        ) : null}
      </div>
      <CreatePurchaseOrdersDialog
        candidates={candidates}
        onOpenChange={setIsSeeding}
        onCreated={() => setRowSelection({})}
        open={isSeeding}
      />
    </PageLayout>
  );
}
