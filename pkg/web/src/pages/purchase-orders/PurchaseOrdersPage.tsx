import { formatCurrency, formatDate } from '@pkg/domain';
import { type PurchaseOrderView, purchaseOrderHasUnpricedLines } from '@pkg/schema';
import { IconCheck, IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { purchaseOrdersPageDescription } from '@/utils/page-descriptions.js';
import { PurchaseOrderStatusBadge } from './components/PurchaseOrderStatusBadge.js';
import { PurchaseOrderCreateDialog } from './PurchaseOrderCreateDialog.js';

export const PurchaseOrdersPage: React.FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const canCreate = useCan('purchase_order:create').can;
  const canReadCosts = useCan('inventory_cost:read').can;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const purchaseOrdersQuery = useQuery(
    trpc.purchaseOrders.list.queryOptions({
      cursor: 0,
      limit: 0,
      search: '',
      sortBy: 'createdAt',
      sortDirection: 'desc',
    }),
  );

  return (
    <>
      <PageLayout
        actions={
          canCreate ? (
            <Button onClick={() => setIsCreateOpen(true)} type="button">
              <IconPlus data-icon="inline-start" />
              New Purchase Order
            </Button>
          ) : null
        }
        description={purchaseOrdersPageDescription}
        title="Purchase Orders"
      >
        <PurchaseOrderTable
          canReadCosts={canReadCosts}
          errorMessage={getApiQueryErrorMessage(purchaseOrdersQuery.error, 'Unable to load Purchase Orders.')}
          isLoading={purchaseOrdersQuery.isPending}
          items={purchaseOrdersQuery.data?.items ?? []}
          onOpen={(id) => navigate({ params: { id }, to: '/purchase-orders/$id' })}
        />
      </PageLayout>
      {canCreate ? <PurchaseOrderCreateDialog onOpenChange={setIsCreateOpen} open={isCreateOpen} /> : null}
    </>
  );
};

export const PurchaseOrderTable: React.FC<{
  canReadCosts: boolean;
  errorMessage?: string | undefined;
  isLoading?: boolean;
  items: PurchaseOrderView[];
  onOpen: (id: PurchaseOrderView['id']) => void;
}> = ({ canReadCosts, errorMessage, isLoading = false, items, onOpen }) => {
  const columns = useMemo(() => createPurchaseOrderColumns(canReadCosts), [canReadCosts]);
  const table = useDataTable({
    columns,
    data: items,
    enableColumnFilters: false,
    enableSortingRemoval: false,
  });
  const total = table.getFilteredRowModel().rows.length;

  return (
    <DataTable
      emptyMessage="No Purchase Orders found."
      errorMessage={errorMessage}
      getRowAriaLabel={(purchaseOrder) => `Open ${purchaseOrder.code}`}
      globalFilterPlaceholder="Search purchase orders..."
      isLoading={isLoading}
      onRowClick={(purchaseOrder) => onOpen(purchaseOrder.id)}
      paginationMode="complete"
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'Purchase Order' : 'Purchase Orders'}`}
    />
  );
};

function createPurchaseOrderColumns(canReadCosts: boolean): DataTableColumnDef<PurchaseOrderView>[] {
  return [
    {
      accessorKey: 'code',
      cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
      header: 'Number',
    },
    {
      accessorFn: (purchaseOrder) => purchaseOrder.supplier.companyName,
      header: 'Supplier',
      id: 'supplier',
    },
    {
      accessorFn: (purchaseOrder) => purchaseOrder.jobs.map((job) => job.code).join(', ') || 'Restock',
      header: 'Jobs',
      id: 'jobs',
    },
    {
      accessorKey: 'expectedDeliveryDate',
      cell: ({ row }) =>
        row.original.expectedDeliveryDate ? formatDate(row.original.expectedDeliveryDate) : 'Not set',
      header: 'Expected',
    },
    ...(canReadCosts
      ? [
          {
            accessorFn: totalFor,
            cell: ({ row }) =>
              purchaseOrderHasUnpricedLines(row.original)
                ? 'Not priced'
                : formatCurrency(totalFor(row.original), 'ZAR'),
            header: 'Total',
            id: 'total',
            meta: {
              cellClassName: 'text-right tabular-nums',
              headerClassName: 'text-right',
            },
          } satisfies DataTableColumnDef<PurchaseOrderView>,
        ]
      : []),
    {
      accessorKey: 'derivedStatus',
      cell: ({ row }) => <PurchaseOrderStatusBadge status={row.original.derivedStatus} />,
      header: 'Status',
    },
    // Sent left the status ladder: the badge names the highest level the order reached, and whether
    // it has actually gone to the Supplier is this tick.
    {
      accessorFn: (purchaseOrder) => purchaseOrder.sentAt !== null,
      cell: ({ row }) => (row.original.sentAt ? <IconCheck aria-label="Sent" className="size-4" /> : null),
      header: 'Sent',
      id: 'sent',
    },
  ];
}

function totalFor(purchaseOrder: PurchaseOrderView): number {
  return purchaseOrder.lines.reduce((total, line) => total + line.quantity * (line.unitPrice ?? 0), 0);
}
