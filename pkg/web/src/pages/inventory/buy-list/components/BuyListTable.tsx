import { compareNullableDateOnly, derivePartStockActions, formatDate } from '@pkg/domain';
import { BUY_LIST_REASONS, type BuyListReason, type BuyListRow } from '@pkg/schema';
import type { RowSelectionState } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { formatPartQuantity } from '@/utils/part-quantity-format.js';

type BuyListTableProps = {
  canSelect: boolean;
  errorMessage: string | undefined;
  isLoading: boolean;
  items: BuyListRow[];
  onRowSelectionChange: (selection: RowSelectionState) => void;
  rowSelection: RowSelectionState;
};

/** A reason worth interrupting someone over reads loud; ordinary Job demand reads as information. */
function reasonBadgeVariant(reason: BuyListReason) {
  return BUY_LIST_REASONS[reason].notifies ? 'destructive' : 'secondary';
}

const buyListColumns: DataTableColumnDef<BuyListRow>[] = [
  {
    cell: ({ row }) => (
      <Checkbox
        aria-label={
          row.getCanSelect()
            ? `Select ${row.original.partCode}`
            : `${row.original.partCode} is built in-house and cannot be purchased`
        }
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
          <Badge key={reason} variant={reasonBadgeVariant(reason)}>
            {BUY_LIST_REASONS[reason].label}
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
        <>
          <span className="block">{formatDate(row.original.earliestDemandDate)}</span>
          {row.original.drivingJobs[0] ? (
            <span className="block text-muted-foreground text-xs">{describeDemand(row.original.drivingJobs)}</span>
          ) : null}
        </>
      ),
    header: 'Needed by',
    // The server's ranking rule, applied to the client sort so the two cannot disagree. A column
    // option cannot do it: `sortUndefined` tests strict `undefined`, and this column holds `null`,
    // which the default alphanumeric fn stringifies to '' — sorting the unscheduled rows first.
    sortFn: (left, right) =>
      compareNullableDateOnly(left.original.earliestDemandDate, right.original.earliestDemandDate),
  },
  {
    accessorKey: 'quantity',
    cell: ({ row }) => formatPartQuantity(row.original.quantity, row.original.unitOfMeasure),
    header: 'On hand',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
  {
    accessorKey: 'committed',
    cell: ({ row }) => formatPartQuantity(row.original.committed, row.original.unitOfMeasure),
    header: 'Committed',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
  {
    accessorKey: 'free',
    cell: ({ row }) => (
      <span className={row.original.free < 0 ? 'font-medium text-destructive' : undefined}>
        {formatPartQuantity(row.original.free, row.original.unitOfMeasure)}
      </span>
    ),
    header: 'Free',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
  {
    accessorKey: 'onOrder',
    cell: ({ row }) => (
      <>
        <span className="block tabular-nums">
          {formatPartQuantity(row.original.onOrder, row.original.unitOfMeasure)}
        </span>
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
    cell: ({ row }) => (
      <span className="font-medium">
        {formatPartQuantity(row.original.suggestedQuantity, row.original.unitOfMeasure)}
      </span>
    ),
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
  const table = useDataTable({
    columns: canSelect ? buyListColumns : buyListColumns.filter((column) => column.id !== 'select'),
    data: items,
    enableColumnFilters: false,
    enableRowSelection: (row) => derivePartStockActions(row.original).purchase.allowed,
    enableSortingRemoval: false,
    getRowId: (item) => item.partId,
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
      paginationMode="incremental"
      table={table}
      total={table.getFilteredRowModel().rows.length}
      totalLabel={(value) => `${value} ${value === 1 ? 'Part' : 'Parts'}`}
    />
  );
}

/** Names the Job that sets the date, so the row says *whose* deadline it is ranked against. */
function describeDemand(drivingJobs: BuyListRow['drivingJobs']): string {
  const [soonest, ...rest] = drivingJobs;
  if (!soonest) return '';

  return rest.length === 0 ? soonest.code : `${soonest.code} +${rest.length} more`;
}

function describeCover(order: BuyListRow['coveringOrders'][number]): string {
  return order.expectedDeliveryDate === null
    ? `${order.code}, no date`
    : `${order.code}, expected ${formatDate(order.expectedDeliveryDate)}`;
}
