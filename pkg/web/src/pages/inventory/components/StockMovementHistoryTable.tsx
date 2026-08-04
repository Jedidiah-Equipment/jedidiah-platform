import { formatCurrency, formatDate, formatNumber } from '@pkg/domain';
import { type PartUnitOfMeasure, STOCK_ADJUSTMENT_REASON_LABELS, type StockMovementHistoryRow } from '@pkg/schema';
import { Link } from '@tanstack/react-router';
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo } from 'react';

import { DataTable } from '@/components/data-table/DataTable.js';
import { getPartQuantityUnitDisplay } from '@/utils/part-quantity-format.js';

export function StockMovementHistoryTable({
  items,
  showCosts,
  unitOfMeasure,
}: {
  items: readonly StockMovementHistoryRow[];
  showCosts: boolean;
  unitOfMeasure: PartUnitOfMeasure;
}) {
  const columns = useMemo(
    () => createStockMovementHistoryColumns({ showCosts, unitOfMeasure }),
    [showCosts, unitOfMeasure],
  );
  const data = useMemo(() => [...items], [items]);
  const table = useReactTable({
    columns,
    data,
    enableColumnFilters: false,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const total = table.getFilteredRowModel().rows.length;

  return (
    <DataTable
      emptyMessage="No stock movements have been recorded for this Part."
      globalFilterPlaceholder="Search inventory history..."
      paginationMode="complete"
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'movement' : 'movements'}`}
    />
  );
}

function createStockMovementHistoryColumns({
  showCosts,
  unitOfMeasure,
}: {
  showCosts: boolean;
  unitOfMeasure: PartUnitOfMeasure;
}): ColumnDef<StockMovementHistoryRow>[] {
  return [
    {
      accessorKey: 'createdAt',
      cell: ({ row }) => formatDate(row.original.createdAt, 'medium'),
      header: 'When',
    },
    {
      accessorFn: formatMovementLabel,
      header: 'Movement',
      id: 'movement',
    },
    {
      accessorFn: (item) => (item.movementType === 'revaluation' ? 0 : item.delta),
      cell: ({ row }) => formatMovementQuantity(row.original, unitOfMeasure),
      header: 'Quantity',
      id: 'quantity',
      meta: { cellClassName: 'tabular-nums' },
    },
    {
      accessorKey: 'runningBalance',
      cell: ({ row }) => formatLedgerQuantity(row.original.runningBalance, unitOfMeasure),
      header: 'Running balance',
      meta: { cellClassName: 'tabular-nums' },
    },
    {
      accessorFn: (item) => item.note ?? '—',
      header: 'Note',
      id: 'note',
    },
    {
      accessorKey: 'actorName',
      header: 'Actor',
    },
    {
      accessorFn: (item) => item.purchaseOrderCode ?? '—',
      cell: ({ row }) =>
        row.original.purchaseOrderId && row.original.purchaseOrderCode ? (
          <Link
            className="font-medium underline-offset-4 hover:underline"
            params={{ id: row.original.purchaseOrderId }}
            to="/purchase-orders/$id"
          >
            {row.original.purchaseOrderCode}
          </Link>
        ) : (
          '—'
        ),
      header: 'Reference',
      id: 'reference',
    },
    ...(showCosts
      ? [
          {
            accessorKey: 'unitCost',
            cell: ({ row }) => formatCost(row.original.unitCost),
            header: 'Unit cost',
          } satisfies ColumnDef<StockMovementHistoryRow>,
          {
            accessorKey: 'movementValue',
            cell: ({ row }) => formatCost(row.original.movementValue),
            header: 'Movement value',
          } satisfies ColumnDef<StockMovementHistoryRow>,
        ]
      : []),
  ];
}

function formatMovementLabel(item: StockMovementHistoryRow): string {
  switch (item.movementType) {
    case 'checkout':
      return 'Checkout';
    case 'return-to-store':
      return 'Return to store';
    case 'receipt':
      return 'Receipt';
    case 'build-consume':
      return 'Build consumption';
    case 'build-produce':
      return 'Build output';
    case 'revaluation':
      return 'Revaluation';
    case 'adjustment':
      return item.reason === null ? 'Adjustment' : STOCK_ADJUSTMENT_REASON_LABELS[item.reason];
  }
}

function formatMovementQuantity(item: StockMovementHistoryRow, unitOfMeasure: PartUnitOfMeasure): string {
  if (item.movementType === 'revaluation') {
    return '0';
  }

  if (unitOfMeasure === 'mm' && item.lengthMm !== null) {
    return `${formatNumber(item.delta)} pc @ ${formatNumber(item.lengthMm / 1_000, {
      decimals: item.lengthMm % 1_000 === 0 ? 0 : 1,
    })} m`;
  }

  return formatLedgerQuantity(item.delta, unitOfMeasure);
}

function formatLedgerQuantity(quantity: number, unitOfMeasure: PartUnitOfMeasure): string {
  const suffix = unitOfMeasure === 'mm' ? 'pc' : getPartQuantityUnitDisplay(unitOfMeasure).suffix;
  return `${formatNumber(quantity, { decimals: Number.isInteger(quantity) ? 0 : 3 })} ${suffix}`;
}

function formatCost(value: number | null): string {
  return value === null ? '—' : formatCurrency(value, 'ZAR');
}
