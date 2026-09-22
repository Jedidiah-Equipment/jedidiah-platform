import { formatCurrency } from '@pkg/domain';
import { PARTS_SALE_CHECKOUT_STATUSES } from '@pkg/domain/equipment';
import type { QuoteDetail, QuoteStockRow } from '@pkg/schema/equipment';
import { IconArrowDown, IconArrowUp, IconPackage } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useStockMovementDialogs } from '@/equipment/pages/inventory/components/use-stock-movement-dialogs.js';
import { drawnColumn, partColumn } from '@/equipment/pages/jobs/components/JobStockTable.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

import { QuoteFormSection } from './QuoteFormSection.js';

/** What has left stores for this Parts Sale, net of returns, with the stores actions that move it. */
export function QuoteStockSection({ quote }: { quote: Pick<QuoteDetail, 'code' | 'id' | 'status'> }) {
  const trpc = useTRPC();
  const canMove = useCan('equipment_inventory:move').can;
  const showValue = useCan('equipment_inventory_cost:read').can;
  const quoteStockQuery = useQuery(trpc.inventory.quoteStock.queryOptions({ quoteId: quote.id }));
  const movementDialogs = useStockMovementDialogs({
    canMove,
    fixedTarget: { code: quote.code, id: quote.id, kind: 'quote' },
  });

  return (
    <QuoteFormSection
      action={
        canMove ? (
          <div className="flex flex-wrap gap-2">
            {PARTS_SALE_CHECKOUT_STATUSES.has(quote.status) ? (
              <Button onClick={() => movementDialogs.openDialog('checkout')} size="sm" type="button" variant="outline">
                <IconArrowDown data-icon="inline-start" />
                Check out
              </Button>
            ) : null}
            <Button
              onClick={() => movementDialogs.openDialog('return-to-store')}
              size="sm"
              type="button"
              variant="outline"
            >
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
      {movementDialogs.dialogs}
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
    partColumn<QuoteStockRow>(),
    drawnColumn<QuoteStockRow>(),
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
