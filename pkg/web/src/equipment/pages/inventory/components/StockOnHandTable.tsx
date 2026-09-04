import { formatCurrency, formatDate } from '@pkg/domain';
import { formatEstimatedStockOnHand } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import type { StockOnHandRow } from '@pkg/schema/equipment';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useMemo } from 'react';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  formatLengthBucket,
  formatPartQuantity,
  formatUnitCost,
  getPartQuantityUnitDisplay,
} from '@/equipment/utils/part-quantity-format.js';

export function StockOnHandTable({
  errorMessage,
  isLoading = false,
  items,
  onOpenHistory,
  showCosts,
}: {
  errorMessage?: string | undefined;
  isLoading?: boolean;
  items: StockOnHandRow[];
  onOpenHistory: (partId: UUID) => void;
  showCosts: boolean;
}) {
  const columns = useMemo<DataTableColumnDef<StockOnHandRow>[]>(
    () => createStockOnHandColumns({ onOpenHistory, showCosts }),
    [onOpenHistory, showCosts],
  );
  const table = useDataTable({
    columns,
    data: items,
    enableColumnFilters: false,
    enableSortingRemoval: false,
  });
  const total = table.getFilteredRowModel().rows.length;

  return (
    <DataTable
      emptyMessage="No Parts are available for inventory reporting."
      errorMessage={errorMessage}
      globalFilterPlaceholder="Search stock on hand..."
      isLoading={isLoading}
      paginationMode="complete"
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'part' : 'parts'}`}
    />
  );
}

function createStockOnHandColumns({
  onOpenHistory,
  showCosts,
}: {
  onOpenHistory: (partId: UUID) => void;
  showCosts: boolean;
}): DataTableColumnDef<StockOnHandRow>[] {
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
      accessorKey: 'quantity',
      cell: ({ row }) => (
        <>
          <StockQuantity className="block" quantity={row.original.quantity}>
            {formatPartQuantity(row.original.quantity, row.original.unitOfMeasure)}
          </StockQuantity>
          {row.original.buckets.map((bucket) =>
            bucket.lengthMm === null ? null : (
              <StockQuantity
                key={bucket.lengthMm}
                className="block text-muted-foreground text-xs"
                quantity={bucket.quantity}
              >
                {formatLengthBucket(bucket.lengthMm, bucket.quantity)}
              </StockQuantity>
            ),
          )}
        </>
      ),
      header: 'Stock on hand',
      meta: {
        cellClassName: 'tabular-nums',
      },
    },
    {
      accessorFn: (item) =>
        item.estimatedOnHand === null
          ? undefined
          : item.estimatedOnHand.wholeUnits + (item.estimatedOnHand.openPlateRemainingPercent ?? 0) / 100,
      cell: ({ row }) =>
        row.original.estimatedOnHand === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatEstimatedStockOnHand(row.original.estimatedOnHand, row.original.unitOfMeasure)
        ),
      header: 'Estimated on hand',
      id: 'estimatedOnHand',
      meta: { cellClassName: 'tabular-nums' },
      sortUndefined: 'last',
    },
    {
      accessorKey: 'free',
      cell: ({ row }) => formatPartQuantity(row.original.free, row.original.unitOfMeasure),
      header: 'Free',
      meta: {
        cellClassName: 'tabular-nums',
      },
    },
    {
      accessorKey: 'onOrder',
      cell: ({ row }) => formatPartQuantity(row.original.onOrder, row.original.unitOfMeasure),
      header: 'On order',
      meta: {
        cellClassName: 'tabular-nums',
      },
    },
    {
      accessorFn: formatCountStatus,
      header: 'Count status',
      id: 'countStatus',
    },
    ...(showCosts
      ? [
          {
            accessorKey: 'averageUnitCost',
            cell: ({ row }) => formatAverageCost(row.original),
            header: 'Average cost',
          } satisfies DataTableColumnDef<StockOnHandRow>,
          {
            accessorKey: 'totalValue',
            cell: ({ row }) => formatInventoryValue(row.original.totalValue),
            header: 'Value',
          } satisfies DataTableColumnDef<StockOnHandRow>,
        ]
      : []),
    {
      cell: ({ row }) => (
        <Button onClick={() => onOpenHistory(row.original.partId)} size="sm" variant="link">
          View history
        </Button>
      ),
      enableSorting: false,
      header: 'History',
      id: 'history',
      meta: {
        cellClassName: 'text-right',
        headerClassName: 'text-right',
      },
    },
  ];
}

/**
 * A negative count is an operational exception, not a smaller number: it means the shelf disagrees
 * with the ledger, and plain table text disappears in a long list. Free stock is deliberately not
 * routed through here — spec §3 sends negative free to procurement's buy list and reserves the
 * count-is-wrong flag for negative stock on hand.
 */
function StockQuantity({ children, className, quantity }: { children: string; className?: string; quantity: number }) {
  if (quantity >= 0) {
    return <span className={className}>{children}</span>;
  }

  return (
    <span className={className}>
      <Badge variant="destructive">
        <IconAlertTriangle data-icon="inline-start" />
        {children}
        <span className="sr-only">Negative stock</span>
      </Badge>
    </span>
  );
}

function formatCountStatus(item: StockOnHandRow): string {
  if (item.stockTrackingMode !== 'periodic') {
    return 'Live';
  }

  return item.asOfLastCount === null
    ? 'No count yet'
    : `As of last count ${formatDate(item.asOfLastCount, 'd MMM yyyy')}`;
}

function formatAverageCost(item: StockOnHandRow): string {
  if (item.averageUnitCost === null) {
    return 'No cost yet';
  }

  // A linear Part's average is per millimetre, so its suffix is the dimension, not the counting unit.
  return `${formatUnitCost(item.averageUnitCost, item.unitOfMeasure)}/${getPartQuantityUnitDisplay(item.unitOfMeasure).suffix}`;
}

function formatInventoryValue(value: number | null): string {
  return value === null ? 'No cost yet' : formatCurrency(value, 'ZAR');
}
