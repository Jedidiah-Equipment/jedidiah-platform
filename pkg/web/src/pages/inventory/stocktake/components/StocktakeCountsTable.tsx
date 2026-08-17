import { formatCurrency, formatDate } from '@pkg/domain';
import type { StocktakeSessionCount } from '@pkg/schema';
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo } from 'react';

import { DataTable } from '@/components/data-table/DataTable.js';
import { formatLengthBucket, formatPartQuantity } from '@/utils/part-quantity-format.js';

/**
 * The session variance report: what was expected, what was counted, and what the correction was
 * worth. Deltas are signed on purpose — a stocktake that only ever showed magnitudes would hide the
 * one thing the report is read for, which is whether the shop is losing stock or finding it.
 */
export function StocktakeCountsTable({
  isLoading,
  items,
  showCosts,
}: {
  isLoading: boolean;
  items: StocktakeSessionCount[];
  showCosts: boolean;
}) {
  const columns = useMemo(() => createCountColumns(showCosts), [showCosts]);
  const table = useReactTable({
    columns,
    data: items,
    enableColumnFilters: false,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const total = table.getFilteredRowModel().rows.length;

  return (
    <DataTable
      emptyMessage="Nothing has been counted in this session yet."
      globalFilterPlaceholder="Search counted parts..."
      isLoading={isLoading}
      paginationMode="incremental"
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'Part counted' : 'Parts counted'}`}
    />
  );
}

function createCountColumns(showCosts: boolean): ColumnDef<StocktakeSessionCount>[] {
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
      cell: ({ row }) => (
        <div className="space-y-0.5">
          {row.original.buckets.map((bucket) => (
            <div key={bucket.lengthMm ?? 'single'}>
              <span className="tabular-nums">
                {bucket.lengthMm === null
                  ? `${bucket.expected} → ${bucket.observed}`
                  : `${formatLengthBucket(bucket.lengthMm, bucket.expected)} → ${bucket.observed}`}
              </span>
            </div>
          ))}
        </div>
      ),
      header: 'Expected → counted',
      id: 'buckets',
    },
    {
      accessorKey: 'delta',
      cell: ({ row }) => (
        <span className={`tabular-nums ${row.original.delta < 0 ? 'text-destructive' : ''}`}>
          {row.original.delta > 0 ? '+' : ''}
          {formatPartQuantity(row.original.delta, row.original.unitOfMeasure)}
        </span>
      ),
      header: 'Variance',
      meta: { cellClassName: 'text-right', headerClassName: 'text-right' },
    },
    ...(showCosts
      ? [
          {
            accessorFn: (item: StocktakeSessionCount) => item.varianceValue ?? 0,
            cell: ({ row }) =>
              row.original.varianceValue === null ? (
                <span className="text-muted-foreground">No cost yet</span>
              ) : (
                formatCurrency(row.original.varianceValue)
              ),
            header: 'Value',
            id: 'varianceValue',
            meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
          } satisfies ColumnDef<StocktakeSessionCount>,
        ]
      : []),
    {
      accessorKey: 'countedAt',
      cell: ({ row }) => (
        <>
          <span className="block">{formatDate(row.original.countedAt)}</span>
          <span className="block text-muted-foreground text-xs">{row.original.countedByName}</span>
        </>
      ),
      header: 'Counted',
    },
  ];
}
