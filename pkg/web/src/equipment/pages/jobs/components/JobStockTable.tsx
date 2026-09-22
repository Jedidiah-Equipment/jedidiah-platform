import type { JobStockRow } from '@pkg/schema/equipment';
import { useMemo } from 'react';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Button } from '@/components/ui/button.js';
import { formatLengthBucket, formatPartQuantity } from '@/equipment/utils/part-quantity-format.js';

/** `onReturn` turns each drawn row into a leftover the close-out screen can hand straight back. */
export function JobStockTable({
  items,
  onReturn,
}: {
  items: JobStockRow[];
  onReturn?: ((partId: string) => void) | undefined;
}) {
  const columns = useMemo<DataTableColumnDef<JobStockRow>[]>(() => createJobStockColumns(onReturn), [onReturn]);
  const table = useDataTable({
    columns,
    data: items,
    enableColumnFilters: false,
    enableSortingRemoval: false,
  });
  const total = table.getFilteredRowModel().rows.length;

  return (
    <DataTable
      emptyMessage="No CFO or stock movements for this Job."
      globalFilterPlaceholder="Search job stock..."
      paginationMode="complete"
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'part' : 'parts'}`}
    />
  );
}

/** What a Job or Parts Sale stock row carries for the Part and Drawn columns both screens show. */
type DrawnStockRow = Pick<JobStockRow, 'drawnQuantity' | 'lengthBuckets' | 'partCode' | 'partName' | 'unitOfMeasure'>;

export function partColumn<TRow extends DrawnStockRow>(): DataTableColumnDef<TRow> {
  return {
    accessorFn: (item) => `${item.partName} ${item.partCode}`,
    cell: ({ row }) => (
      <>
        <span className="block font-medium">{row.original.partName}</span>
        <span className="block text-muted-foreground text-xs">{row.original.partCode}</span>
      </>
    ),
    header: 'Part',
    id: 'part',
  };
}

/** Net drawn for the Part, with each length bucket still out beneath it. */
export function drawnColumn<TRow extends DrawnStockRow>(): DataTableColumnDef<TRow> {
  return {
    accessorFn: (item) => item.drawnQuantity,
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
    id: 'drawnQuantity',
    meta: {
      cellClassName: 'tabular-nums',
    },
  };
}

function createJobStockColumns(onReturn: ((partId: string) => void) | undefined): DataTableColumnDef<JobStockRow>[] {
  return [
    partColumn<JobStockRow>(),
    {
      accessorKey: 'cfoQuantity',
      cell: ({ row }) => formatPartQuantity(row.original.cfoQuantity, row.original.unitOfMeasure),
      header: 'CFO',
      meta: {
        cellClassName: 'tabular-nums',
      },
    },
    drawnColumn<JobStockRow>(),
    {
      accessorKey: 'committedQuantity',
      cell: ({ row }) => formatPartQuantity(row.original.committedQuantity, row.original.unitOfMeasure),
      header: 'Committed',
      meta: {
        cellClassName: 'tabular-nums',
      },
    },
    // Free and On order sit beside Committed because this is one of the two screens buying is
    // decided on; on-order is shown next to free, never folded into it (spec §3).
    {
      accessorKey: 'freeQuantity',
      cell: ({ row }) => (
        <span className={row.original.freeQuantity < 0 ? 'font-medium text-destructive' : undefined}>
          {formatPartQuantity(row.original.freeQuantity, row.original.unitOfMeasure)}
        </span>
      ),
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
    ...(onReturn
      ? [
          {
            cell: ({ row }) =>
              row.original.drawnQuantity > 0 ? (
                <Button onClick={() => onReturn(row.original.partId)} size="sm" variant="outline">
                  Return
                </Button>
              ) : null,
            enableSorting: false,
            header: () => <span className="sr-only">Return</span>,
            id: 'return',
            meta: {
              cellClassName: 'text-right',
            },
          } satisfies DataTableColumnDef<JobStockRow>,
        ]
      : []),
  ];
}
