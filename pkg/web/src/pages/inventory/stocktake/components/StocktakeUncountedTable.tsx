import type { StocktakeUncountedPart } from '@pkg/schema';
import { Link } from '@tanstack/react-router';
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { DataTable } from '@/components/data-table/DataTable.js';
import { formatPartQuantity } from '@/utils/part-quantity-format.js';

const uncountedColumns: ColumnDef<StocktakeUncountedPart>[] = [
  {
    accessorFn: (item) => `${item.partName} ${item.partCode}`,
    cell: ({ row }) => (
      <>
        <Link className="block font-medium" params={{ partId: row.original.partId }} to="/inventory/$partId">
          {row.original.partName}
        </Link>
        <span className="block text-muted-foreground text-xs">{row.original.partCode}</span>
      </>
    ),
    header: 'Part',
    id: 'part',
  },
  {
    accessorKey: 'quantity',
    cell: ({ row }) => formatPartQuantity(row.original.quantity, row.original.unitOfMeasure),
    header: 'Recorded stock',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
];

/**
 * The session's to-do while it is open, and its skip list once it closes — the same list, read at
 * two moments. Nothing here is stored: a Part is uncounted exactly while the session holds no count
 * movement for it.
 */
export function StocktakeUncountedTable({
  isLoading,
  items,
  isClosed,
}: {
  isClosed: boolean;
  isLoading: boolean;
  items: StocktakeUncountedPart[];
}) {
  const table = useReactTable({
    columns: uncountedColumns,
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
      emptyMessage={isClosed ? 'Nothing was skipped — the whole scope was counted.' : 'Every Part in scope is counted.'}
      globalFilterPlaceholder="Search uncounted Parts..."
      isLoading={isLoading}
      paginationMode="incremental"
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'Part' : 'Parts'}`}
    />
  );
}
