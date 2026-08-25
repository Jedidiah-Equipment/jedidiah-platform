import { formatDate } from '@pkg/domain';
import type { LatePurchaseOrderRow } from '@pkg/schema';
import { useNavigate } from '@tanstack/react-router';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';

const lateColumns: DataTableColumnDef<LatePurchaseOrderRow>[] = [
  {
    accessorKey: 'code',
    cell: ({ row }) => <span className="font-medium font-mono">{row.original.code}</span>,
    header: 'Order',
  },
  {
    accessorKey: 'supplierName',
    header: 'Supplier',
  },
  {
    accessorKey: 'expectedDeliveryDate',
    cell: ({ row }) => formatDate(row.original.expectedDeliveryDate),
    header: 'Expected',
  },
  {
    accessorKey: 'daysLate',
    cell: ({ row }) => (
      <Badge variant="destructive">
        {row.original.daysLate === 1 ? '1 day late' : `${row.original.daysLate} days late`}
      </Badge>
    ),
    header: 'Overdue',
  },
  {
    accessorKey: 'openLineCount',
    cell: ({ row }) => (row.original.openLineCount === 1 ? '1 line' : `${row.original.openLineCount} lines`),
    header: 'Still owed',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
];

export function LatePurchaseOrdersTable({
  errorMessage,
  isLoading,
  items,
}: {
  errorMessage: string | undefined;
  isLoading: boolean;
  items: LatePurchaseOrderRow[];
}) {
  const navigate = useNavigate();
  const table = useDataTable({
    columns: lateColumns,
    data: items,
    enableColumnFilters: false,
    enableSortingRemoval: false,
    initialState: { sorting: [{ desc: true, id: 'daysLate' }] },
  });

  return (
    <DataTable
      emptyMessage="No sent order is past its expected date."
      errorMessage={errorMessage}
      getRowAriaLabel={(item) => `Open ${item.code}`}
      hideGlobalFilter={true}
      isLoading={isLoading}
      onRowClick={(item) => navigate({ params: { id: item.id }, to: '/purchase-orders/$id' })}
      paginationMode="complete"
      table={table}
      total={table.getFilteredRowModel().rows.length}
      totalLabel={(value) => `${value} ${value === 1 ? 'order' : 'orders'}`}
    />
  );
}
