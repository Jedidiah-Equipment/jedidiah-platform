import { formatCurrency } from '@pkg/domain';
import { PARTS_SALE_CHECKOUT_STATUSES } from '@pkg/domain/equipment';
import type { JobStockMovementType, QuoteDetail, QuoteStockRow } from '@pkg/schema/equipment';
import { IconArrowDown, IconArrowUp, IconPackage } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { CheckoutBasketDialog } from '@/equipment/pages/inventory/components/CheckoutBasketDialog.js';
import { StockMovementDialog } from '@/equipment/pages/inventory/components/StockMovementDialog.js';
import { partOptionsAllowing } from '@/equipment/pages/inventory/components/types.js';
import { formatLengthBucket, formatPartQuantity } from '@/equipment/utils/part-quantity-format.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

import { QuoteFormSection } from './QuoteFormSection.js';

/** What has left stores for this Parts Sale, net of returns, with the stores actions that move it. */
export function QuoteStockSection({ quote }: { quote: Pick<QuoteDetail, 'code' | 'id' | 'status'> }) {
  const trpc = useTRPC();
  const canMove = useCan('equipment_inventory:move').can;
  const showValue = useCan('equipment_inventory_cost:read').can;
  const quoteStockQuery = useQuery(trpc.inventory.quoteStock.queryOptions({ quoteId: quote.id }));
  const [movementType, setMovementType] = useState<JobStockMovementType | null>(null);
  // Only the movement dialogs' Part pickers need the stock report, so it waits until one opens.
  const stockOnHandQuery = useQuery(
    trpc.inventory.stockOnHand.queryOptions(undefined, { enabled: canMove && movementType !== null }),
  );
  const stockOnHandItems = useMemo(() => stockOnHandQuery.data?.items ?? [], [stockOnHandQuery.data?.items]);
  const parts = useMemo(
    () => partOptionsAllowing(stockOnHandItems, movementType === 'return-to-store' ? 'returnToStore' : 'checkout'),
    [movementType, stockOnHandItems],
  );
  const fixedQuote = { code: quote.code, id: quote.id };
  const closeDialog = (open: boolean) => {
    if (!open) setMovementType(null);
  };

  return (
    <QuoteFormSection
      action={
        canMove ? (
          <div className="flex flex-wrap gap-2">
            {PARTS_SALE_CHECKOUT_STATUSES.has(quote.status) ? (
              <Button onClick={() => setMovementType('checkout')} size="sm" type="button" variant="outline">
                <IconArrowDown data-icon="inline-start" />
                Check out
              </Button>
            ) : null}
            <Button onClick={() => setMovementType('return-to-store')} size="sm" type="button" variant="outline">
              <IconArrowUp data-icon="inline-start" />
              Return to store
            </Button>
          </div>
        ) : undefined
      }
      icon={IconPackage}
      title="Stock drawn"
    >
      {quoteStockQuery.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {quoteStockQuery.error ? <p className="text-destructive text-sm">Unable to load stock drawn.</p> : null}
      {quoteStockQuery.data ? <QuoteStockTable items={quoteStockQuery.data.items} showValue={showValue} /> : null}
      {movementType === 'checkout' ? (
        <CheckoutBasketDialog
          fixedQuote={fixedQuote}
          isLoadingParts={stockOnHandQuery.isPending}
          items={stockOnHandItems}
          onOpenChange={closeDialog}
          open={true}
          parts={parts}
        />
      ) : null}
      {movementType === 'return-to-store' ? (
        <StockMovementDialog
          fixedQuote={fixedQuote}
          isLoadingParts={stockOnHandQuery.isPending}
          items={stockOnHandItems}
          onOpenChange={closeDialog}
          open={true}
          parts={parts}
        />
      ) : null}
    </QuoteFormSection>
  );
}

function QuoteStockTable({ items, showValue }: { items: QuoteStockRow[]; showValue: boolean }) {
  const columns = useMemo(() => createQuoteStockColumns(showValue), [showValue]);
  const table = useDataTable({ columns, data: items, enableColumnFilters: false, enableSortingRemoval: false });

  return (
    <DataTable
      emptyMessage="Nothing is checked out to this Parts Sale."
      hideGlobalFilter
      paginationMode="complete"
      table={table}
      total={items.length}
      totalLabel={(value) => `${value} ${value === 1 ? 'part' : 'parts'}`}
    />
  );
}

function createQuoteStockColumns(showValue: boolean): DataTableColumnDef<QuoteStockRow>[] {
  return [
    {
      accessorFn: (item) => `${item.partName} ${item.partCode}`,
      cell: ({ row }) => (
        <>
          <span className="block font-medium">{row.original.partName}</span>
          <span className="block text-muted-foreground text-xs">{row.original.partCode}</span>
        </>
      ),
      header: 'Part',
      id: 'part',
    },
    {
      accessorKey: 'drawnQuantity',
      cell: ({ row }) => (
        <>
          <span className="block">{formatPartQuantity(row.original.drawnQuantity, row.original.unitOfMeasure)}</span>
          {row.original.lengthBuckets.map((bucket) => (
            <span key={bucket.lengthMm} className="block text-muted-foreground text-xs">
              {formatLengthBucket(bucket.lengthMm, bucket.drawnQuantity)}
            </span>
          ))}
        </>
      ),
      header: 'Drawn',
      meta: { cellClassName: 'tabular-nums' },
    },
    ...(showValue
      ? [
          {
            accessorKey: 'drawnValue',
            cell: ({ row }) =>
              row.original.drawnValue === null ? '—' : formatCurrency(row.original.drawnValue, 'ZAR'),
            header: 'Value',
            meta: { cellClassName: 'tabular-nums' },
          } satisfies DataTableColumnDef<QuoteStockRow>,
        ]
      : []),
  ];
}
