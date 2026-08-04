import { formatDate } from '@pkg/domain';
import { BUY_LIST_REASON_LABELS, type BuyListRow } from '@pkg/schema';
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type RowSelectionState,
  useReactTable,
} from '@tanstack/react-table';

import { DataTable } from '@/components/data-table/DataTable.js';
import { Badge } from '@/components/ui/badge.js';
import { Checkbox } from '@/components/ui/checkbox.js';

type BuyListTableProps = {
  canSelect: boolean;
  errorMessage: string | undefined;
  isLoading: boolean;
  items: BuyListRow[];
  onRowSelectionChange: (selection: RowSelectionState) => void;
  rowSelection: RowSelectionState;
};

const buyListColumns: ColumnDef<BuyListRow>[] = [
  {
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Select ${row.original.partCode}`}
        checked={row.getIsSelected()}
        // A Built Part is made in-house, so it can never reach a Purchase Order line (#1058).
        disabled={!row.getCanSelect()}
        onCheckedChange={(checked) => row.toggleSelected(checked === true)}
      />
    ),
    enableGlobalFilter: false,
    enableSorting: false,
    header: '',
    id: 'select',
    meta: { cellClassName: 'w-8', headerClassName: 'w-8' },
  },
  {
    accessorFn: (item) => `${item.partCode} ${item.partName}`,
    cell: ({ row }) => (
      <>
        <span className="block font-medium">{row.original.partName}</span>
        <span className="block font-mono text-muted-foreground text-xs">{row.original.partCode}</span>
      </>
    ),
    header: 'Part',
    id: 'part',
  },
  {
    accessorFn: (item) => item.reasons.join(' '),
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.reasons.map((reason) => (
          <Badge key={reason} variant={reason === 'below-minimum' ? 'secondary' : 'destructive'}>
            {BUY_LIST_REASON_LABELS[reason]}
          </Badge>
        ))}
      </div>
    ),
    enableSorting: false,
    header: 'Why',
    id: 'reasons',
  },
  {
    accessorKey: 'earliestDemandDate',
    cell: ({ row }) =>
      row.original.earliestDemandDate === null ? (
        <span className="text-muted-foreground">Not scheduled</span>
      ) : (
        formatDate(row.original.earliestDemandDate)
      ),
    header: 'Needed by',
    // Null last: no scheduled Job waiting is the absence of urgency, not the top of the list.
    sortUndefined: 'last',
  },
  {
    accessorKey: 'quantity',
    header: 'On hand',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
  {
    accessorKey: 'free',
    cell: ({ row }) => (
      <span className={row.original.free < 0 ? 'font-medium text-destructive' : undefined}>{row.original.free}</span>
    ),
    header: 'Free',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
  {
    accessorKey: 'onOrder',
    cell: ({ row }) => (
      <>
        <span className="block tabular-nums">{row.original.onOrder}</span>
        {row.original.coveringOrders[0] ? (
          <span className="block text-muted-foreground text-xs">{describeCover(row.original.coveringOrders[0])}</span>
        ) : null}
      </>
    ),
    header: 'On order',
    meta: { cellClassName: 'text-right', headerClassName: 'text-right' },
  },
  {
    accessorKey: 'suggestedQuantity',
    cell: ({ row }) => <span className="font-medium">{row.original.suggestedQuantity}</span>,
    header: 'Suggested buy',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
  {
    accessorFn: (item) => item.supplierName ?? '',
    cell: ({ row }) => row.original.supplierName ?? <span className="text-muted-foreground">Built in-house</span>,
    header: 'Supplier',
    id: 'supplier',
  },
];

export function BuyListTable({
  canSelect,
  errorMessage,
  isLoading,
  items,
  onRowSelectionChange,
  rowSelection,
}: BuyListTableProps) {
  const table = useReactTable({
    columns: canSelect ? buyListColumns : buyListColumns.filter((column) => column.id !== 'select'),
    data: items,
    enableColumnFilters: false,
    enableRowSelection: (row) => !row.original.isInternallyFabricated,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (item) => item.partId,
    getSortedRowModel: getSortedRowModel(),
    onRowSelectionChange: (updater) =>
      onRowSelectionChange(typeof updater === 'function' ? updater(rowSelection) : updater),
    state: { rowSelection },
  });

  return (
    <DataTable
      emptyMessage="Nothing is short, below its minimum, or off the shelf."
      errorMessage={errorMessage}
      globalFilterPlaceholder="Search the buy list..."
      isLoading={isLoading}
      paginationMode="complete"
      table={table}
      total={table.getFilteredRowModel().rows.length}
      totalLabel={(value) => `${value} ${value === 1 ? 'Part' : 'Parts'}`}
    />
  );
}

function describeCover(order: BuyListRow['coveringOrders'][number]): string {
  return order.expectedDeliveryDate === null
    ? `${order.code}, no date`
    : `${order.code}, expected ${formatDate(order.expectedDeliveryDate)}`;
}
