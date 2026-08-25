import { formatDate, formatNumber } from '@pkg/domain';
import { PURCHASE_ORDER_AMENDMENT_KIND_LABELS, type PurchaseOrderAmendment, type UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useTRPC } from '@/lib/trpc.js';

/**
 * How a sent order got from as-sent to now. The log is the record (spec §4), so this card exists
 * whenever an order has one and is simply absent on an order nobody has had to change.
 */
export function PurchaseOrderAmendmentsCard({ purchaseOrderId }: { purchaseOrderId: UUID }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.purchaseOrders.amendments.queryOptions({ purchaseOrderId }));
  const items = query.data?.items ?? [];
  const columns = useMemo<DataTableColumnDef<PurchaseOrderAmendment>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        cell: ({ row }) => formatDate(row.original.createdAt, 'medium'),
        header: 'When',
      },
      {
        cell: ({ row }) => <Badge variant="outline">{PURCHASE_ORDER_AMENDMENT_KIND_LABELS[row.original.kind]}</Badge>,
        header: 'Change',
        id: 'kind',
      },
      {
        cell: ({ row }) => describeAmendment(row.original),
        header: 'Detail',
        id: 'detail',
      },
      { accessorKey: 'note', header: 'Note' },
      {
        accessorFn: (amendment) => amendment.actorName ?? '—',
        header: 'By',
        id: 'actor',
      },
    ],
    [],
  );
  const table = useDataTable({
    columns,
    data: items,
    enableColumnFilters: false,
    enableSorting: false,
    getRowId: (amendment) => amendment.id,
  });

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Amendment history</CardTitle>
        <CardDescription>Every change made since this order was sent, and who agreed it.</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          emptyMessage="This order has not been amended."
          hideGlobalFilter
          paginationMode="complete"
          table={table}
          total={items.length}
          totalLabel={(value) => `${value} ${value === 1 ? 'amendment' : 'amendments'}`}
        />
      </CardContent>
    </Card>
  );
}

function describeAmendment(amendment: PurchaseOrderAmendment): string {
  if (amendment.kind === 'expected-date-change') {
    const before = amendment.oldExpectedDate ? formatDate(amendment.oldExpectedDate) : 'Not set';
    const after = amendment.newExpectedDate ? formatDate(amendment.newExpectedDate) : '—';
    return `${before} → ${after}`;
  }

  const part = `${amendment.partCode ?? '—'} · ${amendment.partName ?? '—'}`;

  if (amendment.kind === 'add-line') {
    return `${part} — ${formatNumber(amendment.newQuantity ?? 0)} added`;
  }

  if (amendment.kind === 'substitute-part') {
    return `${part} → ${amendment.newPartCode ?? '—'} · ${amendment.newPartName ?? ''} (${formatNumber(amendment.newQuantity ?? 0)})`;
  }

  return `${part} — ${formatNumber(amendment.oldQuantity ?? 0)} → ${formatNumber(amendment.newQuantity ?? 0)}`;
}
