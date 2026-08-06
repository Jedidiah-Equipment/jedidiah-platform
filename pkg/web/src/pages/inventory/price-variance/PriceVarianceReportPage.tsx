import { formatCurrency, formatNumber } from '@pkg/domain';
import type { InvoicePriceVarianceRow } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { DataTable } from '@/components/data-table/DataTable.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { priceVariancePageDescription } from '@/utils/page-descriptions.js';

const columns: ColumnDef<InvoicePriceVarianceRow>[] = [
  {
    accessorKey: 'purchaseOrderCode',
    cell: ({ row }) => <span className="font-medium font-mono">{row.original.purchaseOrderCode}</span>,
    header: 'Order',
  },
  { accessorKey: 'supplierName', header: 'Supplier' },
  {
    accessorFn: (row) => `${row.partCode} ${row.partName}`,
    cell: ({ row }) => (
      <>
        <span className="font-medium">{row.original.partCode}</span> · {row.original.partName}
      </>
    ),
    header: 'Part',
    id: 'part',
  },
  {
    accessorFn: (row) => row.invoiceNumber ?? '—',
    header: 'Invoice',
    id: 'invoice',
  },
  {
    accessorKey: 'unitPrice',
    cell: ({ row }) => (row.original.unitPrice === null ? '—' : formatCurrency(row.original.unitPrice, 'ZAR')),
    header: 'Agreed',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
  {
    accessorKey: 'invoiceUnitPrice',
    cell: ({ row }) =>
      row.original.invoiceUnitPrice === null ? '—' : formatCurrency(row.original.invoiceUnitPrice, 'ZAR'),
    header: 'Billed',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
  {
    accessorKey: 'quantity',
    cell: ({ row }) => formatNumber(row.original.quantity),
    header: 'Quantity',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
  {
    accessorKey: 'varianceValue',
    cell: ({ row }) => (row.original.varianceValue === null ? '—' : formatCurrency(row.original.varianceValue, 'ZAR')),
    header: 'Variance',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
  {
    cell: ({ row }) =>
      row.original.resolution === null ? (
        <Badge variant="destructive">To judge</Badge>
      ) : (
        <Badge variant="outline">{row.original.resolution === 'applied' ? 'Applied' : 'Dismissed'}</Badge>
      ),
    enableSorting: false,
    header: 'Outcome',
    id: 'resolution',
  },
];

/**
 * Every line a Supplier billed at a price the order did not agree (spec §12).
 *
 * The same read the Purchase Order panel does, widened to the whole plant: matched fresh against
 * current lines, so amending a price takes its row off this list without anything being rewritten.
 * It is a list of things to judge, not a list of errors — which is what the outcome column says.
 */
export function PriceVarianceReportPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const query = useQuery(trpc.purchaseOrders.invoicePriceVariance.queryOptions());
  const items = query.data?.items ?? [];
  const table = useReactTable({
    columns,
    data: items,
    enableColumnFilters: false,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => `${row.documentId}:${row.partId}`,
  });

  return (
    <PageLayout description={priceVariancePageDescription} size="lg" title="PO vs invoiced">
      <DataTable
        emptyMessage="No Supplier has billed against an agreed price."
        errorMessage={getApiQueryErrorMessage(query.error, 'Unable to load the price variance report.')}
        getRowAriaLabel={(item) => `Open ${item.purchaseOrderCode}`}
        isLoading={query.isPending}
        onRowClick={(item) => navigate({ params: { id: item.purchaseOrderId }, to: '/purchase-orders/$id' })}
        paginationMode="incremental"
        table={table}
        total={table.getFilteredRowModel().rows.length}
        totalLabel={(value) => `${value} ${value === 1 ? 'line' : 'lines'}`}
      />
    </PageLayout>
  );
}
